"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { v4 as uuidv4 } from "uuid";
import type { CartItem, CartState, PublicAvailableDay } from "@/types/public";

const CART_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const STORAGE_KEY_PREFIX = "aydt_cart_";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function computeTotals(
  items: CartItem[],
): Pick<CartState, "subtotal" | "discountAmount" | "total"> {
  const subtotal = items.reduce((sum, i) => sum + i.subtotal, 0);
  // Discount calculation happens server-side at checkout confirmation.
  return { subtotal, discountAmount: 0, total: subtotal };
}

function freshCart(semesterId: string): CartState {
  return {
    semesterId,
    items: [],
    expiresAt: new Date(Date.now() + CART_TTL_MS).toISOString(),
    subtotal: 0,
    discountAmount: 0,
    total: 0,
  };
}

function isExpiredCart(cart: CartState): boolean {
  return new Date(cart.expiresAt).getTime() < Date.now();
}

/* -------------------------------------------------------------------------- */
/* Reducer                                                                     */
/* -------------------------------------------------------------------------- */

type CartAction =
  | {
      type: "ADD_ITEM";
      payload: {
        sessionId: string;
        sessionName: string;
        dayIds: string[];
        selectedDays: PublicAvailableDay[];
        pricePerDay: number;
        minAge: number | null;
        maxAge: number | null;
      };
    }
  | { type: "REMOVE_ITEM"; payload: { sessionId: string } }
  | {
      type: "UPDATE_DAYS";
      payload: { sessionId: string; dayIds: string[]; pricePerDay: number };
    }
  | { type: "CLEAR" }
  | { type: "LOAD"; payload: CartState };

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "LOAD":
      return action.payload;

    case "ADD_ITEM": {
      const {
        sessionId,
        sessionName,
        dayIds,
        selectedDays,
        pricePerDay,
        minAge,
        maxAge,
      } = action.payload;
      // Replace if session already in cart
      const filtered = state.items.filter((i) => i.sessionId !== sessionId);
      const newItem: CartItem = {
        id: uuidv4(),
        semesterId: state.semesterId,
        sessionId,
        sessionName,
        selectedDayIds: dayIds,
        selectedDays,
        pricePerDay,
        subtotal: pricePerDay * dayIds.length,
        addedAt: new Date().toISOString(),
        minAge,
        maxAge,
      };
      const items = [...filtered, newItem];
      return { ...state, items, ...computeTotals(items) };
    }

    case "REMOVE_ITEM": {
      const items = state.items.filter(
        (i) => i.sessionId !== action.payload.sessionId,
      );
      return { ...state, items, ...computeTotals(items) };
    }

    case "UPDATE_DAYS": {
      const { sessionId, dayIds, pricePerDay } = action.payload;
      const items = state.items.map((i) =>
        i.sessionId === sessionId
          ? {
              ...i,
              selectedDayIds: dayIds,
              pricePerDay,
              subtotal: pricePerDay * dayIds.length,
            }
          : i,
      );
      return { ...state, items, ...computeTotals(items) };
    }

    case "CLEAR":
      return freshCart(state.semesterId);

    default:
      return state;
  }
}

/* -------------------------------------------------------------------------- */
/* Context shape                                                               */
/* -------------------------------------------------------------------------- */

interface CartContextValue extends CartState {
  addItem: (
    sessionId: string,
    sessionName: string,
    dayIds: string[],
    selectedDays: PublicAvailableDay[],
    pricePerDay: number,
    minAge: number | null,
    maxAge: number | null,
  ) => void;
  removeItem: (sessionId: string) => void;
  updateDays: (
    sessionId: string,
    dayIds: string[],
    pricePerDay: number,
  ) => void;
  clearCart: () => void;
  /** Seconds remaining before expiry (0 when expired or cart is empty) */
  secondsRemaining: number;
  isExpired: boolean;
  itemCount: number;
  hasSession: (sessionId: string) => boolean;
}

const CartContext = createContext<CartContextValue | null>(null);

/* -------------------------------------------------------------------------- */
/* Provider                                                                    */
/* -------------------------------------------------------------------------- */

interface CartProviderProps {
  /**
   * Semester this cart is scoped to. A cart loaded from localStorage for a
   * different semester is discarded on mount.
   */
  semesterId: string;
  /**
   * Preview mode: cart lives in-memory only and is never written to
   * localStorage. Useful for admin semester preview flows.
   */
  preview?: boolean;
  children: React.ReactNode;
}

export function CartProvider({
  semesterId,
  preview = false,
  children,
}: CartProviderProps) {
  const storageKey = `${STORAGE_KEY_PREFIX}${semesterId}`;

  const [state, dispatch] = useReducer(cartReducer, undefined, () =>
    freshCart(semesterId),
  );
  // Capture the initial freshCart() reference so the persist effect can skip
  // the very first write (which would otherwise overwrite stored data before
  // the hydration LOAD dispatch is committed).
  const mountState = useRef(state);
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  /* ---------------------------------------------------------------------- */
  /* Hydrate from localStorage on mount                                       */
  /* ---------------------------------------------------------------------- */
  useEffect(() => {
    if (preview) return;
    console.log("[Cart] Hydrating — key:", storageKey);
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        console.log("[Cart] Nothing in localStorage for key:", storageKey);
        return;
      }
      const parsed: CartState = JSON.parse(raw);
      const expired = isExpiredCart(parsed);
      const semesterMatch = parsed.semesterId === semesterId;
      console.log("[Cart] Stored cart found:", {
        semesterId: parsed.semesterId,
        semesterMatch,
        expired,
        itemCount: parsed.items?.length ?? 0,
        expiresAt: parsed.expiresAt,
      });
      if (semesterMatch && !expired) {
        console.log(
          "[Cart] LOAD dispatched —",
          parsed.items.length,
          "item(s).",
        );
        dispatch({ type: "LOAD", payload: parsed });
      } else {
        console.warn(
          "[Cart] Discarding stored cart. semesterMatch:",
          semesterMatch,
          "expired:",
          expired,
        );
        localStorage.removeItem(storageKey);
      }
    } catch (e) {
      console.error("[Cart] Failed to parse localStorage cart:", e);
    }
    // Run once on mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Persist to localStorage on every state change                           */
  /* ---------------------------------------------------------------------- */
  useEffect(() => {
    if (preview) return;
    // Skip the very first run when state is still the initial freshCart().
    // Without this guard, the persist effect fires with an empty cart
    // BEFORE the hydration effect's LOAD dispatch is committed, overwriting
    // stored data. (Worse in React Strict Mode where effects run twice.)
    if (state === mountState.current) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // Storage quota exceeded — non-fatal
    }
  }, [state, storageKey, preview]);

  /* ---------------------------------------------------------------------- */
  /* Expiry countdown ticker                                                  */
  /* ---------------------------------------------------------------------- */
  useEffect(() => {
    const tick = () => {
      const ms = new Date(state.expiresAt).getTime() - Date.now();
      setSecondsRemaining(Math.max(0, Math.floor(ms / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state.expiresAt]);

  /* ---------------------------------------------------------------------- */
  /* Actions                                                                  */
  /* ---------------------------------------------------------------------- */

  const addItem = useCallback(
    (
      sessionId: string,
      sessionName: string,
      dayIds: string[],
      selectedDays: PublicAvailableDay[],
      pricePerDay: number,
      minAge: number | null,
      maxAge: number | null,
    ) => {
      console.log("[Cart] addItem:", {
        sessionId,
        sessionName,
        dayCount: dayIds.length,
        pricePerDay,
        minAge,
        maxAge,
      });
      dispatch({
        type: "ADD_ITEM",
        payload: {
          sessionId,
          sessionName,
          dayIds,
          selectedDays,
          pricePerDay,
          minAge,
          maxAge,
        },
      });
    },
    [],
  );

  const removeItem = useCallback((sessionId: string) => {
    dispatch({ type: "REMOVE_ITEM", payload: { sessionId } });
  }, []);

  const updateDays = useCallback(
    (sessionId: string, dayIds: string[], pricePerDay: number) => {
      dispatch({
        type: "UPDATE_DAYS",
        payload: { sessionId, dayIds, pricePerDay },
      });
    },
    [],
  );

  const clearCart = useCallback(() => {
    console.log(
      "[Cart] clearCart called — removing localStorage key:",
      storageKey,
    );
    dispatch({ type: "CLEAR" });
    if (!preview) {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // ignore
      }
    }
  }, [storageKey, preview]);

  const hasSession = useCallback(
    (sessionId: string) => state.items.some((i) => i.sessionId === sessionId),
    [state.items],
  );

  const isExpired = secondsRemaining === 0 && state.items.length > 0;

  return (
    <CartContext.Provider
      value={{
        ...state,
        addItem,
        removeItem,
        updateDays,
        clearCart,
        secondsRemaining,
        isExpired,
        itemCount: state.items.length,
        hasSession,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

/* -------------------------------------------------------------------------- */
/* Hook                                                                        */
/* -------------------------------------------------------------------------- */

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}

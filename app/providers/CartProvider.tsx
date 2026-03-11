"use client";

import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useCallback,
  useState,
  useRef,
} from "react";

const CART_TTL_MS = 20 * 60 * 1000;
const STORAGE_KEY_PREFIX = "aydt_cart_";
const CART_VERSION = 1;

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

interface CartState {
  version: 1;
  semesterId: string;
  sessionIds: string[];
  expiresAt: string;
}

type CartAction =
  | { type: "LOAD"; payload: CartState }
  | { type: "ADD"; sessionId: string }
  | { type: "REMOVE"; sessionId: string }
  | { type: "CLEAR" };

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function freshCart(semesterId: string): CartState {
  return {
    version: CART_VERSION,
    semesterId,
    sessionIds: [],
    expiresAt: new Date(Date.now() + CART_TTL_MS).toISOString(),
  };
}

function isExpired(cart: CartState): boolean {
  return new Date(cart.expiresAt).getTime() < Date.now();
}

function bumpExpiry(cart: CartState): CartState {
  return {
    ...cart,
    expiresAt: new Date(Date.now() + CART_TTL_MS).toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/* Reducer                                                                     */
/* -------------------------------------------------------------------------- */

function reducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "LOAD":
      console.log(
        `[Cart] action: LOAD ${action.payload.sessionIds.length} items`,
      );
      return action.payload;

    case "ADD": {
      if (state.sessionIds.includes(action.sessionId)) return state;

      const next = bumpExpiry({
        ...state,
        sessionIds: [...state.sessionIds, action.sessionId],
      });

      console.log(
        `[Cart] action: ADD ${action.sessionId} → ${next.sessionIds.length} items`,
      );
      return next;
    }

    case "REMOVE": {
      const next = bumpExpiry({
        ...state,
        sessionIds: state.sessionIds.filter((id) => id !== action.sessionId),
      });

      console.log(
        `[Cart] action: REMOVE ${action.sessionId} → ${next.sessionIds.length} items`,
      );
      return next;
    }

    case "CLEAR":
      console.log("[Cart] action: CLEAR");
      return freshCart(state.semesterId);

    default:
      return state;
  }
}

/* -------------------------------------------------------------------------- */
/* Context                                                                     */
/* -------------------------------------------------------------------------- */

interface CartContextValue extends CartState {
  add: (sessionId: string) => void;
  remove: (sessionId: string) => void;
  clear: () => void;
  has: (sessionId: string) => boolean;
  secondsRemaining: number;
  isExpired: boolean;
  itemCount: number;
  hydrated: boolean;
  preview: boolean;
}

const CartContext = createContext<CartContextValue | null>(null);

/* -------------------------------------------------------------------------- */
/* Provider                                                                    */
/* -------------------------------------------------------------------------- */

export function CartProvider({
  semesterId,
  preview = false,
  children,
}: {
  semesterId: string;
  preview?: boolean;
  children: React.ReactNode;
}) {
  const storageKey = `${STORAGE_KEY_PREFIX}${semesterId}`;

  console.log(`[Cart] mounted semesterId=${semesterId} key=${storageKey}`);

  const [state, dispatch] = useReducer(reducer, semesterId, freshCart);

  // stateRef is kept in sync after every render so that add/remove callbacks can
  // compute the next state synchronously and write it to localStorage immediately.
  // This prevents the common pattern of dispatch + navigate causing the persist
  // useEffect to be skipped when the component unmounts before it can fire.
  const stateRef = useRef<CartState>(freshCart(semesterId));
  stateRef.current = state;

  // null = timer hasn't fired yet (distinct from "truly zero / expired")
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  // Preview carts skip localStorage entirely and are immediately ready.
  const [hydrated, setHydrated] = useState(preview);

  /* ---------------------------------------------------------------------- */
  /* Hydrate                                                                */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (preview) return;

    console.log(`[Cart] hydrate start key=${storageKey}`);

    try {
      const raw = localStorage.getItem(storageKey);

      if (raw) {
        const parsed: CartState = JSON.parse(raw);
        const expired = isExpired(parsed);
        const versionOk =
          parsed.version === CART_VERSION && parsed.semesterId === semesterId;

        console.log(
          `[Cart] localStorage raw found: ${parsed.sessionIds?.length ?? 0} items, expired=${expired}, versionOk=${versionOk}`,
        );

        if (versionOk && !expired) {
          dispatch({ type: "LOAD", payload: parsed });
        } else {
          console.warn(
            `[Cart] cart invalid (versionOk=${versionOk} expired=${expired}) → removing`,
          );
          localStorage.removeItem(storageKey);
        }
      } else {
        console.log("[Cart] no cart found in localStorage");
      }
    } catch (err) {
      console.warn("[Cart] hydration error — corrupt entry removed", err);
      localStorage.removeItem(storageKey);
    }

    console.log("[Cart] hydration complete");
    setHydrated(true);
  }, [semesterId, storageKey, preview]);

  /* ---------------------------------------------------------------------- */
  /* Persist                                                                */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (preview) return;
    if (!hydrated) return;

    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
      console.log(
        `[Cart] persisted ${state.sessionIds.length} items to ${storageKey}`,
      );
    } catch (err) {
      console.warn("[Cart] persist error", err);
    }
  }, [state, storageKey, preview, hydrated]);

  /* ---------------------------------------------------------------------- */
  /* Cross-tab sync                                                         */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (preview) return;

    const handler = (e: StorageEvent) => {
      if (e.key !== storageKey || !e.newValue) return;

      try {
        const parsed = JSON.parse(e.newValue);
        dispatch({ type: "LOAD", payload: parsed });
      } catch (err) {
        console.warn("[Cart] cross-tab parse error", err);
      }
    };

    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [storageKey, preview]);

  /* ---------------------------------------------------------------------- */
  /* Expiry timer                                                           */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (state.sessionIds.length === 0) {
      setSecondsRemaining(null); // reset — timer hasn't computed a real value
      return;
    }

    const tick = () => {
      const ms = new Date(state.expiresAt).getTime() - Date.now();
      const secs = Math.max(0, Math.floor(ms / 1000));
      if (secs === 0)
        console.warn(`[Cart] EXPIRED — ${state.sessionIds.length} items lost`);
      setSecondsRemaining(secs);
    };

    tick();
    const initialMs = new Date(state.expiresAt).getTime() - Date.now();
    console.log(
      `[Cart] timer started, secondsRemaining=${Math.max(0, Math.floor(initialMs / 1000))}`,
    );

    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state.expiresAt, state.sessionIds.length]);

  /* ---------------------------------------------------------------------- */
  /* Actions                                                                */
  /* ---------------------------------------------------------------------- */

  const add = useCallback(
    (sessionId: string) => {
      const next = reducer(stateRef.current, { type: "ADD", sessionId });
      stateRef.current = next;
      dispatch({ type: "ADD", sessionId });
      if (!preview) {
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {}
      }
    },
    [storageKey, preview],
  );

  const remove = useCallback(
    (sessionId: string) => {
      const next = reducer(stateRef.current, { type: "REMOVE", sessionId });
      stateRef.current = next;
      dispatch({ type: "REMOVE", sessionId });
      if (!preview) {
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {}
      }
    },
    [storageKey, preview],
  );

  const clear = useCallback(() => {
    console.log("[Cart] clear called");
    dispatch({ type: "CLEAR" });

    if (!preview) {
      localStorage.removeItem(storageKey);
    }
  }, [storageKey, preview]);

  const has = useCallback(
    (sessionId: string) => state.sessionIds.includes(sessionId),
    [state.sessionIds],
  );

  // null means the timer hasn't ticked yet — never treat that as expired
  const expired =
    secondsRemaining !== null &&
    secondsRemaining === 0 &&
    state.sessionIds.length > 0;

  return (
    <CartContext.Provider
      value={{
        ...state,
        add,
        remove,
        clear,
        has,
        hydrated,
        secondsRemaining: secondsRemaining ?? 0,
        isExpired: expired,
        itemCount: state.sessionIds.length,
        preview,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

/* -------------------------------------------------------------------------- */
/* Hook                                                                        */
/* -------------------------------------------------------------------------- */

export function useCart() {
  const ctx = useContext(CartContext);

  if (!ctx) {
    throw new Error("useCart must be used inside CartProvider");
  }

  return ctx;
}

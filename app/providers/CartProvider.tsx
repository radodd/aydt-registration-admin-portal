"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useCallback,
  useState,
  useRef,
} from "react";
import type { CartItem, CartItemMode, CartState } from "@/types/public";

const CART_TTL_MS = 20 * 60 * 1000;
const STORAGE_KEY_PREFIX = "aydt_cart_";
// Preview carts persist to sessionStorage under their own prefix so an admin's
// preview walkthrough survives navigation/reload but never collides with a real
// family's localStorage cart, and auto-clears when the tab closes.
const PREVIEW_STORAGE_KEY_PREFIX = "aydt_preview_cart_";
const CART_VERSION = 2;

/** Which Web Storage backs the cart: sessionStorage for preview, else localStorage. */
function cartStore(preview: boolean): Storage | null {
  if (typeof window === "undefined") return null;
  return preview ? window.sessionStorage : window.localStorage;
}

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Argument shape accepted by `add()`. Two forms:
 *
 *   - string  → legacy standard-class add. Wraps the sessionId in a minimal
 *               CartItem (mode: "standard"). Preserves the pre-3b-ii API so
 *               existing callers (SessionAddButton, ScCard, etc.) keep working.
 *   - object  → richer Phase 3b-ii add: caller supplies mode + tier/dates.
 *               The provider stamps `id` and `addedAt`.
 */
export type AddCartItemInput =
  | string
  | (Omit<CartItem, "id" | "addedAt"> & { id?: string; addedAt?: string });

type CartAction =
  | { type: "LOAD"; payload: CartState }
  | { type: "ADD"; item: CartItem }
  | { type: "REMOVE_BY_SESSION"; sessionId: string }
  | { type: "REMOVE_BY_ID"; itemId: string }
  | { type: "UPDATE"; itemId: string; patch: Partial<CartItem> }
  | { type: "CLEAR" };

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function freshCart(semesterId: string): CartState {
  return {
    version: CART_VERSION,
    semesterId,
    items: [],
    expiresAt: new Date(Date.now() + CART_TTL_MS).toISOString(),
  };
}

function bumpExpiry(cart: CartState): CartState {
  return {
    ...cart,
    expiresAt: new Date(Date.now() + CART_TTL_MS).toISOString(),
  };
}

function newId(): string {
  // crypto.randomUUID is available in modern browsers + Node 19+; fall back if missing.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `c_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function normalizeAdd(input: AddCartItemInput, semesterId: string): CartItem {
  if (typeof input === "string") {
    return {
      id: newId(),
      semesterId,
      classId: "",
      sessionId: input,
      className: "",
      mode: "standard",
      addedAt: new Date().toISOString(),
    };
  }
  return {
    ...input,
    id: input.id ?? newId(),
    addedAt: input.addedAt ?? new Date().toISOString(),
  };
}

/**
 * Back-compat flattening: returns the list of session IDs that a v1 consumer
 * would have seen. Standard/tiered items contribute their single sessionId;
 * drop-in items contribute every entry in selectedDateIds (with the
 * representative sessionId as fallback when the list is empty).
 */
function deriveSessionIds(items: CartItem[]): string[] {
  const out: string[] = [];
  for (const it of items) {
    if (it.mode === "drop-in") {
      const ids = it.selectedDateIds ?? [];
      if (ids.length === 0 && it.sessionId) out.push(it.sessionId);
      else out.push(...ids);
    } else if (it.sessionId) {
      out.push(it.sessionId);
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Reducer                                                                     */
/* -------------------------------------------------------------------------- */

function reducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "LOAD":
      console.log(
        `[Cart] action: LOAD ${action.payload.items.length} items`,
      );
      return action.payload;

    case "ADD": {
      // Dedupe: standard/tiered → match by sessionId; drop-in → match by classId.
      const exists = state.items.some((it) => {
        if (action.item.mode === "drop-in") return it.classId === action.item.classId && it.mode === "drop-in";
        return it.sessionId === action.item.sessionId;
      });
      if (exists) return state;

      const next = bumpExpiry({
        ...state,
        items: [...state.items, action.item],
      });

      console.log(
        `[Cart] action: ADD ${action.item.mode} ${action.item.sessionId} → ${next.items.length} items`,
      );
      return next;
    }

    case "REMOVE_BY_SESSION": {
      // Match standard/tiered by sessionId; also strip the date from any
      // drop-in item that has it selected (and drop the item if empty).
      const nextItems: CartItem[] = [];
      for (const it of state.items) {
        if (it.mode === "drop-in") {
          const dates = (it.selectedDateIds ?? []).filter((d) => d !== action.sessionId);
          if (dates.length === 0) continue; // empty drop-in item is removed
          nextItems.push({ ...it, selectedDateIds: dates });
        } else if (it.sessionId !== action.sessionId) {
          nextItems.push(it);
        }
      }
      const next = bumpExpiry({ ...state, items: nextItems });
      console.log(
        `[Cart] action: REMOVE_BY_SESSION ${action.sessionId} → ${next.items.length} items`,
      );
      return next;
    }

    case "REMOVE_BY_ID": {
      const next = bumpExpiry({
        ...state,
        items: state.items.filter((it) => it.id !== action.itemId),
      });
      console.log(
        `[Cart] action: REMOVE_BY_ID ${action.itemId} → ${next.items.length} items`,
      );
      return next;
    }

    case "UPDATE": {
      const next = bumpExpiry({
        ...state,
        items: state.items.map((it) =>
          it.id === action.itemId ? { ...it, ...action.patch } : it,
        ),
      });
      console.log(`[Cart] action: UPDATE ${action.itemId}`);
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

interface CartContextValue {
  semesterId: string;
  items: CartItem[];
  /** Back-compat flattened view used by pre-3b-ii consumers. */
  sessionIds: string[];
  expiresAt: string;

  add: (input: AddCartItemInput) => void;
  remove: (sessionId: string) => void;
  removeItem: (itemId: string) => void;
  updateItem: (itemId: string, patch: Partial<CartItem>) => void;
  clear: () => void;
  has: (sessionId: string) => boolean;
  hasClass: (classId: string, mode?: CartItemMode) => boolean;

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
  const storageKey = `${
    preview ? PREVIEW_STORAGE_KEY_PREFIX : STORAGE_KEY_PREFIX
  }${semesterId}`;

  console.log(`[Cart] mounted semesterId=${semesterId} key=${storageKey}`);

  const [state, dispatch] = useReducer(reducer, semesterId, freshCart);

  // stateRef is kept in sync after every render so that add/remove callbacks
  // can compute the next state synchronously and write it to localStorage
  // immediately — preventing the persist effect from being skipped when the
  // component unmounts (e.g. dispatch + navigate) before it can fire.
  const stateRef = useRef<CartState>(freshCart(semesterId));
  // eslint-disable-next-line react-hooks/refs
  stateRef.current = state;

  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  // Both live and preview hydrate from their respective Web Storage on mount.
  const [hydrated, setHydrated] = useState(false);

  /* ---------------------------------------------------------------------- */
  /* Hydrate                                                                */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    const store = cartStore(preview);
    if (!store) return;

    console.log(`[Cart] hydrate start key=${storageKey}`);

    try {
      const raw = store.getItem(storageKey);

      if (raw) {
        const parsed = JSON.parse(raw) as Partial<CartState> & {
          version?: number;
        };
        const expired = parsed.expiresAt
          ? new Date(parsed.expiresAt).getTime() < Date.now()
          : true;
        const versionOk =
          parsed.version === CART_VERSION && parsed.semesterId === semesterId;

        console.log(
          `[Cart] storage raw found: items=${(parsed as CartState).items?.length ?? "?"}, expired=${expired}, versionOk=${versionOk}`,
        );

        if (versionOk && !expired && Array.isArray((parsed as CartState).items)) {
          dispatch({ type: "LOAD", payload: parsed as CartState });
        } else {
          console.warn(
            `[Cart] cart invalid (versionOk=${versionOk} expired=${expired}) → removing`,
          );
          store.removeItem(storageKey);
        }
      } else {
        console.log("[Cart] no cart found in storage");
      }
    } catch (err) {
      console.warn("[Cart] hydration error — corrupt entry removed", err);
      store.removeItem(storageKey);
    }

    console.log("[Cart] hydration complete");
    setHydrated(true);
  }, [semesterId, storageKey, preview]);

  /* ---------------------------------------------------------------------- */
  /* Persist                                                                */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (!hydrated) return;
    const store = cartStore(preview);
    if (!store) return;

    try {
      store.setItem(storageKey, JSON.stringify(state));
      console.log(
        `[Cart] persisted ${state.items.length} items to ${storageKey}`,
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
        const parsed = JSON.parse(e.newValue) as CartState;
        if (parsed.version === CART_VERSION) dispatch({ type: "LOAD", payload: parsed });
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
    if (state.items.length === 0) {
      setSecondsRemaining(null);
      return;
    }

    const tick = () => {
      const ms = new Date(state.expiresAt).getTime() - Date.now();
      const secs = Math.max(0, Math.floor(ms / 1000));
      if (secs === 0)
        console.warn(`[Cart] EXPIRED — ${state.items.length} items lost`);
      setSecondsRemaining(secs);
    };

    tick();
    const initialMs = new Date(state.expiresAt).getTime() - Date.now();
    console.log(
      `[Cart] timer started, secondsRemaining=${Math.max(0, Math.floor(initialMs / 1000))}`,
    );

    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state.expiresAt, state.items.length]);

  /* ---------------------------------------------------------------------- */
  /* Actions                                                                */
  /* ---------------------------------------------------------------------- */

  const persistNext = useCallback(
    (next: CartState) => {
      stateRef.current = next;
      const store = cartStore(preview);
      if (!store) return;
      try {
        store.setItem(storageKey, JSON.stringify(next));
        // Live-only: NavCartButton listens for this to refresh its badge.
        if (!preview) window.dispatchEvent(new Event("aydt-cart-change"));
      } catch {}
    },
    [preview, storageKey],
  );

  const add = useCallback(
    (input: AddCartItemInput) => {
      const item = normalizeAdd(input, semesterId);
      const next = reducer(stateRef.current, { type: "ADD", item });
      persistNext(next);
      dispatch({ type: "ADD", item });
    },
    [persistNext, semesterId],
  );

  const remove = useCallback(
    (sessionId: string) => {
      const next = reducer(stateRef.current, { type: "REMOVE_BY_SESSION", sessionId });
      persistNext(next);
      dispatch({ type: "REMOVE_BY_SESSION", sessionId });
    },
    [persistNext],
  );

  const removeItem = useCallback(
    (itemId: string) => {
      const next = reducer(stateRef.current, { type: "REMOVE_BY_ID", itemId });
      persistNext(next);
      dispatch({ type: "REMOVE_BY_ID", itemId });
    },
    [persistNext],
  );

  const updateItem = useCallback(
    (itemId: string, patch: Partial<CartItem>) => {
      const next = reducer(stateRef.current, { type: "UPDATE", itemId, patch });
      persistNext(next);
      dispatch({ type: "UPDATE", itemId, patch });
    },
    [persistNext],
  );

  const clear = useCallback(() => {
    console.log("[Cart] clear called");
    dispatch({ type: "CLEAR" });
    cartStore(preview)?.removeItem(storageKey);
  }, [storageKey, preview]);

  const sessionIds = useMemo(() => deriveSessionIds(state.items), [state.items]);

  const has = useCallback(
    (sessionId: string) => sessionIds.includes(sessionId),
    [sessionIds],
  );

  const hasClass = useCallback(
    (classId: string, mode?: CartItemMode) =>
      state.items.some((it) => it.classId === classId && (!mode || it.mode === mode)),
    [state.items],
  );

  const expired =
    secondsRemaining !== null &&
    secondsRemaining === 0 &&
    state.items.length > 0;

  return (
    <CartContext.Provider
      value={{
        semesterId: state.semesterId,
        items: state.items,
        sessionIds,
        expiresAt: state.expiresAt,
        add,
        remove,
        removeItem,
        updateItem,
        clear,
        has,
        hasClass,
        hydrated,
        secondsRemaining: secondsRemaining ?? 0,
        isExpired: expired,
        itemCount: state.items.length,
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

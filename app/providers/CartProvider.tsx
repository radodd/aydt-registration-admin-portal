"use client";

import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useCallback,
  useState,
} from "react";

const CART_TTL_MS = 2 * 60 * 60 * 1000;
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
      return action.payload;

    case "ADD": {
      if (state.sessionIds.includes(action.sessionId)) return state;

      return bumpExpiry({
        ...state,
        sessionIds: [...state.sessionIds, action.sessionId],
      });
    }

    case "REMOVE": {
      return bumpExpiry({
        ...state,
        sessionIds: state.sessionIds.filter((id) => id !== action.sessionId),
      });
    }

    case "CLEAR":
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

  const [state, dispatch] = useReducer(reducer, semesterId, freshCart);

  const [secondsRemaining, setSecondsRemaining] = useState(0);

  /* ---------------------------------------------------------------------- */
  /* Hydrate                                                                  */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (preview) return;

    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;

      const parsed: CartState = JSON.parse(raw);

      if (
        parsed.version === CART_VERSION &&
        parsed.semesterId === semesterId &&
        !isExpired(parsed)
      ) {
        dispatch({ type: "LOAD", payload: parsed });
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {
      localStorage.removeItem(storageKey);
    }
  }, [semesterId, storageKey, preview]);

  /* ---------------------------------------------------------------------- */
  /* Persist                                                                  */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (preview) return;

    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // ignore quota errors
    }
  }, [state, storageKey, preview]);

  /* ---------------------------------------------------------------------- */
  /* Cross-tab sync                                                           */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (preview) return;

    const handler = (e: StorageEvent) => {
      if (e.key !== storageKey || !e.newValue) return;
      try {
        const parsed = JSON.parse(e.newValue);
        dispatch({ type: "LOAD", payload: parsed });
      } catch {}
    };

    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [storageKey, preview]);

  /* ---------------------------------------------------------------------- */
  /* Expiry timer                                                             */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (state.sessionIds.length === 0) {
      setSecondsRemaining(0);
      return;
    }

    const tick = () => {
      const ms = new Date(state.expiresAt).getTime() - Date.now();
      setSecondsRemaining(Math.max(0, Math.floor(ms / 1000)));
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state.expiresAt, state.sessionIds.length]);

  /* ---------------------------------------------------------------------- */
  /* Actions                                                                  */
  /* ---------------------------------------------------------------------- */

  const add = useCallback((sessionId: string) => {
    dispatch({ type: "ADD", sessionId });
  }, []);

  const remove = useCallback((sessionId: string) => {
    dispatch({ type: "REMOVE", sessionId });
  }, []);

  const clear = useCallback(() => {
    dispatch({ type: "CLEAR" });
    if (!preview) {
      localStorage.removeItem(storageKey);
    }
  }, [storageKey, preview]);

  const has = useCallback(
    (sessionId: string) => state.sessionIds.includes(sessionId),
    [state.sessionIds],
  );

  const expired = secondsRemaining === 0 && state.sessionIds.length > 0;

  return (
    <CartContext.Provider
      value={{
        ...state,
        add,
        remove,
        clear,
        has,
        secondsRemaining,
        isExpired: expired,
        itemCount: state.sessionIds.length,
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

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
import { holdSeat, releaseSeat } from "@/app/(user-facing)/register/actions/seatHolds";

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
  | { type: "SET_ADDONS"; ids: string[] }
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

      // Meeting-plan #28: the cart timer runs from the FIRST add and is NOT reset
      // on subsequent adds (so the seat-hold deadlines stay fixed and can't be
      // extended indefinitely by adding/removing).
      const next: CartState = {
        ...state,
        items: [...state.items, action.item],
        expiresAt:
          state.items.length === 0
            ? new Date(Date.now() + CART_TTL_MS).toISOString()
            : state.expiresAt,
      };

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
      const next = { ...state, items: nextItems };
      console.log(
        `[Cart] action: REMOVE_BY_SESSION ${action.sessionId} → ${next.items.length} items`,
      );
      return next;
    }

    case "REMOVE_BY_ID": {
      const next = {
        ...state,
        items: state.items.filter((it) => it.id !== action.itemId),
      };
      console.log(
        `[Cart] action: REMOVE_BY_ID ${action.itemId} → ${next.items.length} items`,
      );
      return next;
    }

    case "UPDATE": {
      const next = {
        ...state,
        items: state.items.map((it) =>
          it.id === action.itemId ? { ...it, ...action.patch } : it,
        ),
      };
      console.log(`[Cart] action: UPDATE ${action.itemId}`);
      return next;
    }

    case "SET_ADDONS": {
      // Meeting-plan #33: optional add-on opt-in set. Items are untouched.
      const next = { ...state, selectedAddOnIds: action.ids };
      console.log(`[Cart] action: SET_ADDONS → ${action.ids.length} selected`);
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

  /**
   * Meeting-plan #28: add now RESERVES a seat server-side before adding, so it
   * is async and can fail. Resolves to { ok:false, reason } on needs_auth /
   * at_capacity / error. Callers may ignore the result — auth redirect + the
   * `addError` surface are handled centrally.
   */
  add: (
    input: AddCartItemInput,
    opts?: { skipHold?: boolean },
  ) => Promise<{ ok: boolean; reason?: "needs_auth" | "at_capacity" | "error" }>;
  remove: (sessionId: string) => void;
  removeItem: (itemId: string) => void;
  updateItem: (itemId: string, patch: Partial<CartItem>) => void;
  clear: () => void;
  has: (sessionId: string) => boolean;
  hasClass: (classId: string, mode?: CartItemMode) => boolean;
  /**
   * Meeting-plan #33: optional add-on opt-in, persisted with the cart. Holds
   * representative class_meeting_options.id values; availability is still
   * derived per-page from PricingQuote.availableAddOns.
   */
  selectedAddOnIds: string[];
  toggleAddOn: (optionId: string) => void;
  setSelectedAddOnIds: (ids: string[]) => void;
  /** Transient "couldn't reserve" feedback (e.g. class just filled). */
  addError: { message: string; reason: "at_capacity" | "error"; classId?: string } | null;
  dismissAddError: () => void;

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
  // Meeting-plan #28: transient feedback when a seat hold can't be created
  // (e.g. the class just filled). The catalog surfaces this near the class card.
  const [addError, setAddError] = useState<
    { message: string; reason: "at_capacity" | "error"; classId?: string } | null
  >(null);

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

  const itemExists = useCallback((item: CartItem) => {
    return stateRef.current.items.some((it) =>
      item.mode === "drop-in"
        ? it.classId === item.classId && it.mode === "drop-in"
        : it.sessionId === item.sessionId,
    );
  }, []);

  // Release the server seat-holds of any items present in `prev` but gone in `next`.
  const releaseRemoved = useCallback(
    (prev: CartItem[], next: CartItem[]) => {
      if (preview) return;
      const nextIds = new Set(next.map((it) => it.id));
      const gone = prev.filter((it) => !nextIds.has(it.id)).flatMap((it) => it.holdIds ?? []);
      if (gone.length) void releaseSeat(gone);
    },
    [preview],
  );

  // Meeting-plan #28: add now RESERVES a seat (server hold) before adding. It is
  // async and can fail — `needs_auth` (routes to sign-in), `at_capacity` (just
  // filled → surfaced via addError), or `error`. Preview carts skip holds.
  const add = useCallback(
    async (
      input: AddCartItemInput,
      opts?: { skipHold?: boolean },
    ): Promise<{ ok: boolean; reason?: "needs_auth" | "at_capacity" | "error" }> => {
      const item = normalizeAdd(input, semesterId);

      // Preview carts are simulated; the #5 waitlist-join path is capacity-neutral
      // (joining a waitlist reserves nothing). Both add WITHOUT a server hold.
      if (preview || opts?.skipHold) {
        const next = reducer(stateRef.current, { type: "ADD", item });
        persistNext(next);
        dispatch({ type: "ADD", item });
        return { ok: true };
      }

      if (itemExists(item)) return { ok: true }; // already held — no duplicate

      const res = await holdSeat({
        semesterId,
        classId: item.classId,
        mode: item.mode,
        sessionId: item.sessionId,
        selectedDateIds: item.selectedDateIds,
        // Reuse the cart-wide deadline once the cart has items (timer = from first add).
        cartExpiresAt:
          stateRef.current.items.length > 0 ? stateRef.current.expiresAt : undefined,
      });

      if (!res.ok) {
        if (res.reason === "needs_auth") {
          if (typeof window !== "undefined") {
            const next = encodeURIComponent(window.location.pathname + window.location.search);
            window.location.href = `/auth/login?next=${next}`;
          }
          return { ok: false, reason: "needs_auth" };
        }
        setAddError({
          reason: res.reason,
          classId: item.classId,
          message:
            res.reason === "at_capacity"
              ? "This class just filled up — you can join the waitlist instead."
              : res.message ?? "Could not add this class. Please try again.",
        });
        return { ok: false, reason: res.reason };
      }

      const held: CartItem = { ...item, holdIds: res.holdIds };
      const next = reducer(stateRef.current, { type: "ADD", item: held });
      persistNext(next);
      dispatch({ type: "ADD", item: held });
      setAddError(null);
      return { ok: true };
    },
    [persistNext, semesterId, preview, itemExists],
  );

  const remove = useCallback(
    (sessionId: string) => {
      const next = reducer(stateRef.current, { type: "REMOVE_BY_SESSION", sessionId });
      releaseRemoved(stateRef.current.items, next.items);
      persistNext(next);
      dispatch({ type: "REMOVE_BY_SESSION", sessionId });
    },
    [persistNext, releaseRemoved],
  );

  const removeItem = useCallback(
    (itemId: string) => {
      const next = reducer(stateRef.current, { type: "REMOVE_BY_ID", itemId });
      releaseRemoved(stateRef.current.items, next.items);
      persistNext(next);
      dispatch({ type: "REMOVE_BY_ID", itemId });
    },
    [persistNext, releaseRemoved],
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
    // Release any outstanding holds. After a successful checkout the holds were
    // already converted to enrollments (deleted server-side), so this is a no-op
    // there; on cart abandonment it frees the seats immediately.
    if (!preview) {
      const allHolds = stateRef.current.items.flatMap((it) => it.holdIds ?? []);
      if (allHolds.length) void releaseSeat(allHolds);
    }
    dispatch({ type: "CLEAR" });
    cartStore(preview)?.removeItem(storageKey);
  }, [storageKey, preview]);

  const dismissAddError = useCallback(() => setAddError(null), []);

  // Meeting-plan #33: optional add-on opt-in, lifted into the cart so the
  // selection persists across the cart → checkout navigation (and reload) and
  // can be toggled from either surface.
  const setSelectedAddOnIds = useCallback(
    (ids: string[]) => {
      const next = reducer(stateRef.current, { type: "SET_ADDONS", ids });
      persistNext(next);
      dispatch({ type: "SET_ADDONS", ids });
    },
    [persistNext],
  );

  const toggleAddOn = useCallback(
    (id: string) => {
      const cur = stateRef.current.selectedAddOnIds ?? [];
      const ids = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      const next = reducer(stateRef.current, { type: "SET_ADDONS", ids });
      persistNext(next);
      dispatch({ type: "SET_ADDONS", ids });
    },
    [persistNext],
  );

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
        selectedAddOnIds: state.selectedAddOnIds ?? [],
        toggleAddOn,
        setSelectedAddOnIds,
        addError,
        dismissAddError,
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

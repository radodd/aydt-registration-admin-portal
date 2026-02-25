"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
} from "react";
import type {
  ParticipantAssignment,
  RegistrationAction,
  RegistrationState,
  RegistrationStep,
} from "@/types/public";

const STORAGE_KEY_PREFIX = "aydt_registration_";

/* -------------------------------------------------------------------------- */
/* Initial state factory                                                       */
/* -------------------------------------------------------------------------- */

function initialState(semesterId: string, preview: boolean): RegistrationState {
  return {
    step: "email",
    email: "",
    isExistingParent: false,
    parentId: null,
    participants: [],
    formData: {},
    paymentIntentId: null,
    batchId: null,
    isPreview: preview,
    errors: {},
  };
}

/* -------------------------------------------------------------------------- */
/* Reducer                                                                     */
/* -------------------------------------------------------------------------- */

function registrationReducer(
  state: RegistrationState,
  action: RegistrationAction,
): RegistrationState {
  switch (action.type) {
    case "SET_EMAIL":
      return { ...state, email: action.payload };

    case "SET_PARENT_CHECK":
      return {
        ...state,
        isExistingParent: action.payload.isExisting,
        parentId: action.payload.parentId,
      };

    case "SET_PARTICIPANTS":
      return { ...state, participants: action.payload };

    case "SET_FORM_DATA":
      return { ...state, formData: action.payload };

    case "SET_PAYMENT_INTENT":
      return {
        ...state,
        paymentIntentId: action.payload.intentId,
        batchId: action.payload.batchId,
      };

    case "SET_STEP":
      return { ...state, step: action.payload };

    case "SET_ERRORS":
      return { ...state, errors: { ...state.errors, ...action.payload } };

    case "RESET":
      return initialState("", state.isPreview);

    default:
      return state;
  }
}

/* -------------------------------------------------------------------------- */
/* Context                                                                     */
/* -------------------------------------------------------------------------- */

interface RegistrationContextValue {
  state: RegistrationState;
  goToStep: (step: RegistrationStep) => void;
  setEmail: (email: string) => void;
  setParentCheck: (isExisting: boolean, parentId: string | null) => void;
  setParticipants: (participants: ParticipantAssignment[]) => void;
  setFormData: (data: Record<string, unknown>) => void;
  setPaymentIntent: (intentId: string, batchId: string) => void;
  setErrors: (errors: Partial<Record<RegistrationStep, string[]>>) => void;
  reset: () => void;
}

const RegistrationContext = createContext<RegistrationContextValue | null>(
  null,
);

/* -------------------------------------------------------------------------- */
/* Provider                                                                    */
/* -------------------------------------------------------------------------- */

interface RegistrationProviderProps {
  semesterId: string;
  preview?: boolean;
  children: React.ReactNode;
}

export function RegistrationProvider({
  semesterId,
  preview = false,
  children,
}: RegistrationProviderProps) {
  const storageKey = `${STORAGE_KEY_PREFIX}${semesterId}`;

  const [state, dispatch] = useReducer(
    registrationReducer,
    undefined,
    () => initialState(semesterId, preview),
  );

  /* Hydrate from sessionStorage on mount */
  useEffect(() => {
    if (preview) return;
    console.log("[Registration] Hydrating — key:", storageKey);
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) {
        console.log("[Registration] Nothing in sessionStorage.");
        return;
      }
      const saved: RegistrationState = JSON.parse(raw);
      console.log("[Registration] Stored state found:", {
        step: saved.step,
        email: saved.email,
        isExistingParent: saved.isExistingParent,
        parentId: saved.parentId,
        participantCount: saved.participants?.length ?? 0,
        batchId: saved.batchId,
      });
      // Don't restore a completed or payment success state
      if (saved.step === "success") {
        console.log("[Registration] Skipping restore — step is 'success'.");
        return;
      }
      dispatch({ type: "SET_EMAIL", payload: saved.email });
      dispatch({
        type: "SET_PARENT_CHECK",
        payload: {
          isExisting: saved.isExistingParent,
          parentId: saved.parentId,
        },
      });
      dispatch({ type: "SET_PARTICIPANTS", payload: saved.participants });
      dispatch({ type: "SET_FORM_DATA", payload: saved.formData });
      dispatch({ type: "SET_STEP", payload: saved.step });
      console.log("[Registration] State restored to step:", saved.step);
    } catch (e) {
      console.error("[Registration] Failed to parse sessionStorage state:", e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Persist on every state change */
  useEffect(() => {
    if (preview) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // ignore
    }
  }, [state, storageKey, preview]);

  /* -------------------------------------------------------------------- */
  /* Stable action creators                                                 */
  /* -------------------------------------------------------------------- */

  const goToStep = useCallback(
    (step: RegistrationStep) => dispatch({ type: "SET_STEP", payload: step }),
    [],
  );

  const setEmail = useCallback((email: string) => {
    console.log("[Registration] setEmail:", email);
    dispatch({ type: "SET_EMAIL", payload: email });
  }, []);

  const setParentCheck = useCallback(
    (isExisting: boolean, parentId: string | null) => {
      console.log("[Registration] setParentCheck — isExisting:", isExisting, "parentId:", parentId);
      dispatch({
        type: "SET_PARENT_CHECK",
        payload: { isExisting, parentId },
      });
    },
    [],
  );

  const setParticipants = useCallback((participants: ParticipantAssignment[]) => {
    console.log("[Registration] setParticipants — count:", participants.length, participants);
    dispatch({ type: "SET_PARTICIPANTS", payload: participants });
  }, []);

  const setFormData = useCallback(
    (data: Record<string, unknown>) =>
      dispatch({ type: "SET_FORM_DATA", payload: data }),
    [],
  );

  const setPaymentIntent = useCallback(
    (intentId: string, batchId: string) =>
      dispatch({
        type: "SET_PAYMENT_INTENT",
        payload: { intentId, batchId },
      }),
    [],
  );

  const setErrors = useCallback(
    (errors: Partial<Record<RegistrationStep, string[]>>) =>
      dispatch({ type: "SET_ERRORS", payload: errors }),
    [],
  );

  const reset = useCallback(() => {
    dispatch({ type: "RESET" });
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  }, [storageKey]);

  return (
    <RegistrationContext.Provider
      value={{
        state,
        goToStep,
        setEmail,
        setParentCheck,
        setParticipants,
        setFormData,
        setPaymentIntent,
        setErrors,
        reset,
      }}
    >
      {children}
    </RegistrationContext.Provider>
  );
}

/* -------------------------------------------------------------------------- */
/* Hook                                                                        */
/* -------------------------------------------------------------------------- */

export function useRegistration(): RegistrationContextValue {
  const ctx = useContext(RegistrationContext);
  if (!ctx) {
    throw new Error(
      "useRegistration must be used inside <RegistrationProvider>",
    );
  }
  return ctx;
}

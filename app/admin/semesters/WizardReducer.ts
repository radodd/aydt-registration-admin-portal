import { SemesterDraft } from "@/types";

export function semesterReducer(
  state: SemesterDraft,
  action: any,
): SemesterDraft {
  switch (action.type) {
    case "SET_DETAILS":
      return { ...state, details: action.payload };

    case "SET_SESSIONS":
      return { ...state, sessions: action.payload };

    case "SET_PAYMENT":
      return { ...state, paymentPlan: action.payload };

    case "SET_DISCOUNTS":
      return { ...state, discounts: action.payload };

    default:
      return state;
  }
}

import { z } from "zod";
import type { RegistrationFormElement } from "@/types";

/* -------------------------------------------------------------------------- */
/* Utility                                                                     */
/* -------------------------------------------------------------------------- */

/** Returns age in whole years as of today */
export function computeAge(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

/* -------------------------------------------------------------------------- */
/* Step 0 — Email entry                                                        */
/* -------------------------------------------------------------------------- */

export const emailStepSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
});

export type EmailStepData = z.infer<typeof emailStepSchema>;

/* -------------------------------------------------------------------------- */
/* Step 1 — New dancer creation                                               */
/* -------------------------------------------------------------------------- */

export const newDancerSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  dateOfBirth: z
    .string()
    .min(1, "Date of birth is required")
    .refine((d) => {
      const parsed = new Date(d);
      return !isNaN(parsed.getTime());
    }, "Enter a valid date")
    .refine((d) => {
      const age = computeAge(d);
      return age >= 2 && age <= 30;
    }, "Age must be between 2 and 30"),
  gender: z
    .enum(["male", "female", "non_binary", "prefer_not_to_say"])
    .optional(),
});

export type NewDancerInput = z.infer<typeof newDancerSchema>;

/* -------------------------------------------------------------------------- */
/* Step 2 — Dynamic form schema builder                                        */
/* -------------------------------------------------------------------------- */

/**
 * Builds a Zod schema at runtime from the semester's registration form
 * elements. Called on both client (for RHF resolver) and server (for
 * action-level validation).
 */
export function buildDynamicFormSchema(elements: RegistrationFormElement[]) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const el of elements) {
    if (el.type !== "question" || !el.id) continue;

    let base: z.ZodTypeAny;

    switch (el.inputType) {
      case "date":
        base = z.string().date("Enter a valid date");
        break;
      case "phone_number":
        base = z
          .string()
          .regex(/^\+?[\d\s\-().]{7,}$/, "Enter a valid phone number");
        break;
      case "checkbox":
        base = z.array(z.string());
        break;
      case "long_answer":
      case "short_answer":
      default:
        base = z.string();
    }

    if (el.required) {
      if (el.inputType === "checkbox") {
        shape[el.id] = (base as z.ZodArray<z.ZodString>).min(
          1,
          `${el.label ?? "This field"} is required`,
        );
      } else {
        shape[el.id] = (base as z.ZodString).min(
          1,
          `${el.label ?? "This field"} is required`,
        );
      }
    } else {
      shape[el.id] = base.optional();
    }
  }

  return z.object(shape);
}

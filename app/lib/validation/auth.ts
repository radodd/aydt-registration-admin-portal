import z from "zod";

export const signUpSchema = z.object({
  first_name: z.string().min(1, "Name is required"),
  last_name: z.string().min(1, "Last name is required"),
  email: z.email({
    pattern:
      /^(?!\.)(?!.*\.\.)([a-z0-9_'+\-\.]*)[a-z0-9_+-]@([a-z0-9][a-z0-9\-]*\.)+[a-z]{2,}$/i,
    message: "Invalid email address",
  }),
  password: z.string().min(6, "Password must be at least 6 characters long"),
});

export type SignUpFormValues = z.infer<typeof signUpSchema>;

type TreeifiedError = {
  errors: unknown[];
  properties?: Record<
    string,
    {
      errors: string[];
    }
  >;
};

// Convert treeified Zod error object → simple { field: message }
export function extractMessages(tree: TreeifiedError): Record<string, string> {
  const out: Record<string, string> = {};

  console.log("🔍 extractMessages(): treeified error object:", tree);

  if (!tree.properties) {
    console.log("⚠ No properties found in treeified error.");
    return out;
  }
  for (const [key, value] of Object.entries(tree.properties)) {
    console.log(`   ↳ processing field "${key}" →`, value);

    if (value.errors?.length) {
      console.log(`     ✔ found error for "${key}":`, value.errors[0]);
      out[key] = value.errors[0];
    } else {
      console.log(`     ✔ "${key}" has no errors`);
    }
  }

  console.log("📦 extractMessages(): returning simplified errors:", out);
  return out;
}

export function formDataToObject(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

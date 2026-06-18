/**
 * scripts/teardown-demo-registrations.mjs   ↩︎ removes everything the demo seed created
 *
 * Scoped entirely by the two fixed anchor IDs (ORDER_ID, FAMILY_ID) from the shared
 * config — touches nothing else. Deleting the order cascades its section_enrollments
 * (batch_id ON DELETE CASCADE); we also delete them explicitly first, defensively.
 *
 * Run:  node scripts/teardown-demo-registrations.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { FAMILY_ID, ORDER_ID } from "./_demo-registrations.config.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(`▶ Tearing down DEMO registrations in ${process.env.NEXT_PUBLIC_SUPABASE_URL}`);

const step = async (label, q) => {
  const { error, count } = await q;
  if (error) console.warn(`  ! ${label}: ${error.message}`);
  else console.log(`  ✓ ${label}${typeof count === "number" ? ` (${count})` : ""}`);
};

// 1. enrollments tied to our fake order (explicit; also cascades on order delete)
await step("section_enrollments", sb.from("section_enrollments").delete({ count: "exact" }).eq("batch_id", ORDER_ID));
// 2. the fake order
await step("registration_orders", sb.from("registration_orders").delete({ count: "exact" }).eq("id", ORDER_ID));
// 3. fake dancers under the fake family
await step("dancers", sb.from("dancers").delete({ count: "exact" }).eq("family_id", FAMILY_ID));
// 4. the fake family
await step("families", sb.from("families").delete({ count: "exact" }).eq("id", FAMILY_ID));

console.log("\n✅ Demo data removed.");

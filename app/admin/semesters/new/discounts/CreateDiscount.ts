import { createClient } from "@/utils/supabase/client";
import { CreateDiscountInput } from "@/types";

export async function createDiscount({
  name,
  category,
  eligibleSessionsMode,
  giveSessionScope,
  recipientScope,
  rules,
  sessionIds,
}: CreateDiscountInput): Promise<string> {
  const supabase = createClient();

  console.group("🆕 createDiscount");
  console.log("Payload:", {
    name,
    category,
    eligibleSessionsMode,
    giveSessionScope,
    recipientScope,
    rules,
    sessionIds,
  });

  const { data: discount, error: discountError } = await supabase
    .from("discounts")
    .insert({
      name,
      category,
      eligible_sessions_mode: eligibleSessionsMode,
      give_session_scope: giveSessionScope,
      recipient_scope:
        category === "multi_person"
          ? (recipientScope ?? "threshold_only")
          : null,
    })
    .select("id")
    .single();

  if (discountError) {
    console.error("Failed to create discount.", discountError);
    throw new Error(discountError?.message ?? "Unknown discount error");
  }

  const discountId = discount.id;

  /* -------------------------------------------------------------------------- */
  /* Insert Rules                                                                    */
  /* -------------------------------------------------------------------------- */
  const rulesPayload = rules.map((r) => ({
    discount_id: discountId,
    rule_type: category,
    threshold: r.threshold,
    threshold_unit: category === "multi_person" ? "person" : "session",
    value: r.value,
    value_type: r.valueType,
  }));

  const { error: rulesError } = await supabase
    .from("discount_rules")
    .insert(rulesPayload);
  console.log("✅ Rules inserted for:", discountId);
  if (rulesError) {
    console.error("Failed to create discount rules.", rulesError);
    throw new Error(rulesError.message);
  }

  /* -------------------------------------------------------------------------- */
  /* Insert Session Restrictions                                                    */
  /* -------------------------------------------------------------------------- */

  if (eligibleSessionsMode === "selected") {
    const validSessionIds = (sessionIds ?? []).filter(
      (id) => typeof id === "string" && id.trim() !== "",
    );

    if (validSessionIds.length > 0) {
      const sessionPayload = validSessionIds.map((sessionId) => ({
        discount_id: discountId,
        session_id: sessionId,
      }));

      const { error: sessionsError } = await supabase
        .from("discount_rule_sessions")
        .insert(sessionPayload);

      if (sessionsError) {
        console.error(
          "Failed to create discount session restrictions.",
          sessionsError,
        );
        throw new Error(sessionsError.message);
      }
    }
    console.log("✅ Session restrictions inserted (if any)");
  }

  console.groupEnd();
  return discountId;
}

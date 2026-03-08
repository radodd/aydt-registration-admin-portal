import { createClient } from "@/utils/supabase/client";
import { CreateDiscountInput } from "@/types";

export async function updateDiscount(
  discountId: string,
  {
    name,
    category,
    eligibleSessionsMode,
    giveSessionScope,
    recipientScope,
    rules,
    sessionIds,
  }: CreateDiscountInput,
): Promise<void> {
  const supabase = createClient();

  const { error: discountError } = await supabase
    .from("discounts")
    .update({
      name,
      category,
      eligible_sessions_mode: eligibleSessionsMode,
      give_session_scope: giveSessionScope,
      recipient_scope:
        category === "multi_person"
          ? (recipientScope ?? "threshold_only")
          : null,
    })
    .eq("id", discountId);

  if (discountError) throw new Error(discountError.message);

  // Replace rules: delete existing, re-insert
  const { error: deleteRulesError } = await supabase
    .from("discount_rules")
    .delete()
    .eq("discount_id", discountId);

  if (deleteRulesError) throw new Error(deleteRulesError.message);

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

  if (rulesError) throw new Error(rulesError.message);

  // Replace session restrictions
  const { error: deleteSessionsError } = await supabase
    .from("discount_rule_sessions")
    .delete()
    .eq("discount_id", discountId);

  if (deleteSessionsError) throw new Error(deleteSessionsError.message);

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

      if (sessionsError) throw new Error(sessionsError.message);
    }
  }
}

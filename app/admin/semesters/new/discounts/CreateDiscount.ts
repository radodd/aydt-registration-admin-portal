import { createClient } from "@/utils/supabase/client";
import { DiscountRule } from "@/types";

type CreateDiscountInput = {
  name: string;
  category: "multi_person" | "multi_session" | "custom";
  eligibleSessionsMode: "all" | "selected";
  giveSessionScope: string;
  recipientScope?: string;
  rules: DiscountRule[];
  sessionIds?: string[];
};

export async function createDiscount(input: CreateDiscountInput) {
  const supabase = createClient();

  const { data: discount, error } = await supabase
    .from("discounts")
    .insert({
      name: input.name,
      category: input.category,
      eligible_sessions_mode: input.eligibleSessionsMode,
      give_session_scope: input.giveSessionScope,
      recipient_scope:
        input.category === "multi_person"
          ? (input.recipientScope ?? "threshold_only")
          : null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to create discount.", error);
    throw new Error(`Failed to create discount: ${error.message}`);
  }

  const discountId = discount.id;

  // Insert rules
  const rulesPayload = input.rules.map((r) => ({
    discount_id: discountId,
    rule_type: input.category,
    threshold: r.threshold,
    threshold_unit: input.category === "multi_person" ? "person" : "session",
    value: r.value,
    value_type: r.valueType,
  }));

  const { error: rulesError } = await supabase
    .from("discount_rules")
    .insert(rulesPayload);

  if (rulesError) throw new Error(rulesError.message);

  // Insert session restrictions (if applicable)
  if (input.eligibleSessionsMode === "selected" && input.sessionIds?.length) {
    const sessionPayload = input.sessionIds.map((id) => ({
      discount_id: discountId,
      session_id: id,
    }));

    const { error: sessionsError } = await supabase
      .from("discount_rule_sessions")
      .insert(sessionPayload);

    if (sessionsError) throw new Error(sessionsError.message);
  }

  return discountId;
}

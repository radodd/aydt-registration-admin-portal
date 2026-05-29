/**
 * Seed helpers for the preview-flow harness.
 *
 * - ensureSuperAdmin(): a dedicated super_admin test login (the preview tree is
 *   gated to super_admin). Never touches real admin accounts.
 * - buildSeed(semesterId): derives a realistic preview CartState + RegistrationState
 *   from real DB rows so each preview step renders with data, without driving the
 *   per-mode add-to-cart UI by hand. Keys match CartProvider/RegistrationProvider's
 *   preview sessionStorage keys.
 */
import { db } from "../shared/db";

export const SUPER_ADMIN = {
  email: "preview-harness@aydt.test",
  password: "PreviewHarness!2026",
  firstName: "Preview",
  lastName: "Harness",
};

export async function ensureSuperAdmin(): Promise<string> {
  // Find existing auth user
  const { data: list } = await db().auth.admin.listUsers({ perPage: 200 });
  let id = list?.users.find((u) => u.email === SUPER_ADMIN.email)?.id ?? null;

  if (!id) {
    const { data, error } = await db().auth.admin.createUser({
      email: SUPER_ADMIN.email,
      password: SUPER_ADMIN.password,
      email_confirm: true,
      user_metadata: { role: "super_admin", first_name: SUPER_ADMIN.firstName, last_name: SUPER_ADMIN.lastName },
    });
    if (error) throw new Error(`createUser: ${error.message}`);
    id = data.user!.id;
  } else {
    // Ensure password is the known one
    await db().auth.admin.updateUserById(id, { password: SUPER_ADMIN.password, email_confirm: true });
  }

  // handle_new_user may attach a throwaway family; clear it so the user is a pure admin
  const { data: row } = await db().from("users").select("family_id").eq("id", id).maybeSingle();
  if (row?.family_id) await db().from("families").delete().eq("id", row.family_id as string).then(() => undefined, () => undefined);

  await db().from("users").upsert(
    {
      id,
      email: SUPER_ADMIN.email,
      first_name: SUPER_ADMIN.firstName,
      last_name: SUPER_ADMIN.lastName,
      role: "super_admin",
      status: "active",
      family_id: null,
    },
    { onConflict: "id" },
  );
  return id;
}

export type SeedMode = "standard" | "tiered" | "drop-in";

export interface PreviewSeed {
  semesterId: string;
  mode: SeedMode;
  className: string;
  cartKey: string;
  regKey: string;
  cartValue: string; // JSON
  regValue: string; // JSON
}

function firstOf<T>(rel: T | T[] | null | undefined): T | null {
  return Array.isArray(rel) ? (rel[0] ?? null) : (rel ?? null);
}

/**
 * Build a preview cart + registration seed for one semester by reading a real
 * representative meeting. Returns null if the semester has no meetings.
 */
export async function buildSeed(semesterId: string): Promise<PreviewSeed | null> {
  const { data: meetings } = await db()
    .from("class_meetings")
    .select(
      "id, drop_in_price, class_id, schedule_date, class_sections(is_drop_in), classes(id, name, is_tiered)",
    )
    .eq("semester_id", semesterId)
    .order("schedule_date", { ascending: true })
    .limit(5);

  const m = (meetings ?? [])[0];
  if (!m) return null;

  const cs = firstOf((m as any).class_sections) as { is_drop_in?: boolean } | null;
  const cl = firstOf((m as any).classes) as { id: string; name: string; is_tiered?: boolean } | null;
  const className = cl?.name ?? "Class";
  const classId = (m as any).class_id ?? cl?.id ?? "";
  const sessionId = (m as any).id as string;

  let mode: SeedMode = "standard";
  if (cs?.is_drop_in) mode = "drop-in";
  else if (cl?.is_tiered) mode = "tiered";

  // Tiered: pick a default/first tier for snapshot.
  let classTierId: string | undefined;
  let tierLabel: string | undefined;
  let priceSnapshot: number | undefined;
  if (mode === "tiered" && classId) {
    const { data: tiers } = await db()
      .from("class_tiers")
      .select("id, label, price_cents, is_default, sort_order")
      .eq("class_id", classId)
      .order("sort_order", { ascending: true })
      .limit(5);
    const tier = (tiers ?? []).find((t) => (t as any).is_default) ?? (tiers ?? [])[0];
    if (tier) {
      classTierId = (tier as any).id;
      tierLabel = (tier as any).label ?? "Tier";
      priceSnapshot =
        (tier as any).price_cents != null ? Number((tier as any).price_cents) / 100 : undefined;
    }
  }
  if (mode === "drop-in") {
    priceSnapshot = (m as any).drop_in_price != null ? Number((m as any).drop_in_price) : undefined;
  }

  const cartItem: Record<string, unknown> = {
    id: `seed-${sessionId}`,
    semesterId,
    classId,
    sessionId,
    className,
    mode,
    addedAt: new Date(0).toISOString(),
  };
  if (mode === "tiered") {
    cartItem.classTierId = classTierId;
    cartItem.tierLabel = tierLabel;
    cartItem.priceSnapshot = priceSnapshot;
  }
  if (mode === "drop-in") {
    cartItem.selectedDateIds = [sessionId];
    cartItem.priceSnapshot = priceSnapshot;
  }

  const cartState = {
    version: 2,
    semesterId,
    items: [cartItem],
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  };

  const registrationState = {
    step: "payment",
    email: "preview@example.com",
    isExistingParent: false,
    parentId: null,
    participants: [
      {
        sessionId,
        // Mirrors the real preview flow: a client-side dancerId + newDancer name
        // (set by the participants step) so the payment quote resolves a name.
        dancerId: "11111111-1111-4111-8111-111111111111",
        newDancer: {
          firstName: "Preview",
          lastName: "Dancer",
          dateOfBirth: "2015-01-01",
          gender: "female",
        },
        ageStatus: "unchecked",
        ...(mode === "drop-in" ? { selectedDayIds: [sessionId] } : {}),
      },
    ],
    formData: {},
    paymentIntentId: null,
    batchId: null,
    isPreview: true,
    errors: {},
  };

  return {
    semesterId,
    mode,
    className,
    cartKey: `aydt_preview_cart_${semesterId}`,
    regKey: `aydt_preview_registration_${semesterId}`,
    cartValue: JSON.stringify(cartState),
    regValue: JSON.stringify(registrationState),
  };
}

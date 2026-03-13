import { Resend } from "resend";
import { wrapEmailLayout } from "@/utils/prepareEmailHtml";
import type { PricingQuote, AdminAdjustment } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";

function fmt$$(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

function fmt12(time: string | null): string {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function cap(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

type Session = {
  id: string;
  day_of_week: string | null;
  start_time: string | null;
  end_time: string | null;
  classes: { name: string } | null;
};

function buildReceiptHtml(params: {
  parentFirstName: string;
  dancerName: string;
  semesterName: string;
  sessions: Session[];
  quote: PricingQuote | null;
  adjustments: AdminAdjustment[];
  effectiveTotal: number;
  amountCollected: number;
  paymentMethod: string;
  paymentPlanType: "pay_in_full" | "monthly";
}): string {
  const {
    parentFirstName,
    dancerName,
    semesterName,
    sessions,
    quote,
    adjustments,
    effectiveTotal,
    amountCollected,
    paymentMethod,
    paymentPlanType,
  } = params;

  const balanceDue = Math.max(0, effectiveTotal - amountCollected);

  // Classes rows
  const classRows = sessions
    .map((s) => {
      const className = s.classes?.name ?? "Class";
      const day = s.day_of_week ? cap(s.day_of_week) : "";
      const time =
        s.start_time && s.end_time
          ? `${fmt12(s.start_time)}–${fmt12(s.end_time)}`
          : "";
      const schedule = [day, time].filter(Boolean).join(" · ");
      return `
        <tr>
          <td style="padding:8px 0 4px 0;font-size:14px;color:#333;border-bottom:1px solid #f0f0f0;">
            ${className}
          </td>
          <td style="padding:8px 0 4px 0;font-size:13px;color:#666;text-align:right;border-bottom:1px solid #f0f0f0;">
            ${schedule}
          </td>
        </tr>`;
    })
    .join("");

  // Pricing rows from quote
  const quoteRows = quote
    ? quote.lineItems
        .filter((li) => li.amount !== 0)
        .map(
          (li) => `
        <tr>
          <td style="padding:5px 0;font-size:14px;color:#555;">${li.label}</td>
          <td style="padding:5px 0;font-size:14px;text-align:right;color:${li.amount < 0 ? "#16a34a" : "#333"};">
            ${li.amount < 0 ? `-${fmt$$(Math.abs(li.amount))}` : fmt$$(li.amount)}
          </td>
        </tr>`,
        )
        .join("")
    : "";

  // Adjustment rows
  const adjRows = adjustments
    .map(
      (adj) => `
        <tr>
          <td style="padding:5px 0;font-size:14px;color:#555;">
            ${adj.type === "credit" ? "Credit" : "Tuition Adjustment"}: ${adj.label}
          </td>
          <td style="padding:5px 0;font-size:14px;text-align:right;color:#16a34a;">
            -${fmt$$(adj.amount)}
          </td>
        </tr>`,
    )
    .join("");

  const monthlyNote =
    paymentPlanType === "monthly"
      ? `<p style="margin:16px 0 0 0;font-size:13px;color:#64748b;font-style:italic;">
           Your payment plan is monthly. Our team will be in touch to arrange billing.
         </p>`
      : "";

  const balanceRow =
    balanceDue > 0
      ? `<tr>
          <td style="padding:5px 0;font-size:14px;color:#555;">Balance Remaining</td>
          <td style="padding:5px 0;font-size:14px;text-align:right;color:#b45309;font-weight:600;">${fmt$$(balanceDue)}</td>
        </tr>`
      : "";

  return wrapEmailLayout(`
    <h2 style="color:#7B1F1A;margin:0 0 16px 0;font-size:20px;">Registration Confirmation</h2>
    <p style="margin:0 0 6px 0;font-size:15px;">Hi ${parentFirstName},</p>
    <p style="margin:0 0 24px 0;font-size:15px;">
      <strong>${dancerName}</strong> has been registered for <strong>${semesterName}</strong>.
    </p>

    <!-- Classes -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border-collapse:collapse;">
      <tr>
        <td colspan="2" style="padding:0 0 8px 0;font-weight:bold;font-size:13px;color:#7B1F1A;border-bottom:2px solid #7B1F1A;text-transform:uppercase;letter-spacing:0.05em;">
          Classes Enrolled
        </td>
      </tr>
      ${classRows || `<tr><td colspan="2" style="padding:8px 0;font-size:14px;color:#999;">No class details available.</td></tr>`}
    </table>

    <!-- Pricing -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;border-collapse:collapse;">
      <tr>
        <td colspan="2" style="padding:0 0 8px 0;font-weight:bold;font-size:13px;color:#7B1F1A;border-bottom:2px solid #7B1F1A;text-transform:uppercase;letter-spacing:0.05em;">
          Pricing Summary
        </td>
      </tr>
      ${quoteRows}
      ${adjRows}
      <tr>
        <td style="padding:10px 0 5px 0;font-size:15px;font-weight:bold;border-top:1px solid #e5e7eb;color:#111;">
          Total Due
        </td>
        <td style="padding:10px 0 5px 0;font-size:15px;font-weight:bold;text-align:right;border-top:1px solid #e5e7eb;color:#111;">
          ${fmt$$(effectiveTotal)}
        </td>
      </tr>
      <tr>
        <td style="padding:5px 0;font-size:14px;color:#555;">
          Amount Collected (${cap(paymentMethod)})
        </td>
        <td style="padding:5px 0;font-size:14px;text-align:right;color:#16a34a;">
          ${fmt$$(amountCollected)}
        </td>
      </tr>
      ${balanceRow}
    </table>

    ${monthlyNote}

    <p style="margin:24px 0 0 0;font-size:13px;color:#64748b;">
      If you have any questions, please contact AYDT directly.
    </p>
  `);
}

export async function sendRegistrationReceipt(params: {
  supabase: SupabaseClient;
  batchId: string;
  dancerName: string;
  semesterId: string;
  semesterName: string;
  sessionIds: string[];
  quote: PricingQuote | null;
  adjustments: AdminAdjustment[];
  effectiveTotal: number;
  amountCollected: number;
  paymentMethod: string;
  paymentPlanType: "pay_in_full" | "monthly";
  notes?: string;
  familyId: string | null;
  parentUserId: string | null;
}): Promise<void> {
  const {
    supabase,
    dancerName,
    semesterName,
    sessionIds,
    quote,
    adjustments,
    effectiveTotal,
    amountCollected,
    paymentMethod,
    paymentPlanType,
    familyId,
    parentUserId,
  } = params;

  try {
    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      console.warn("[sendRegistrationReceipt] RESEND_API_KEY not set — skipping email.");
      return;
    }

    // Fetch parent email
    let parentEmail: string | null = null;
    let parentFirstName = "there";

    if (parentUserId) {
      const { data: user } = await supabase
        .from("users")
        .select("email, first_name")
        .eq("id", parentUserId)
        .single();
      if (user) {
        parentEmail = (user as any).email ?? null;
        parentFirstName = (user as any).first_name || "there";
      }
    }

    if (!parentEmail && familyId) {
      const { data: user } = await supabase
        .from("users")
        .select("email, first_name")
        .eq("family_id", familyId)
        .eq("is_primary_parent", true)
        .maybeSingle();
      if (user) {
        parentEmail = (user as any).email ?? null;
        parentFirstName = (user as any).first_name || "there";
      }
    }

    if (!parentEmail && !adminEmail) {
      console.warn("[sendRegistrationReceipt] No recipient email available — skipping.");
      return;
    }

    // Fetch session details
    const { data: sessionRows } = await supabase
      .from("class_sessions")
      .select("id, day_of_week, start_time, end_time, classes(name)")
      .in("id", sessionIds);

    const sessions: Session[] = ((sessionRows ?? []) as any[]).map((s) => ({
      id: s.id,
      day_of_week: s.day_of_week ?? null,
      start_time: s.start_time ?? null,
      end_time: s.end_time ?? null,
      classes: s.classes
        ? { name: Array.isArray(s.classes) ? s.classes[0]?.name : s.classes.name }
        : null,
    }));

    const html = buildReceiptHtml({
      parentFirstName,
      dancerName,
      semesterName,
      sessions,
      quote,
      adjustments,
      effectiveTotal,
      amountCollected,
      paymentMethod,
      paymentPlanType,
    });

    const fromEmail = process.env.RESEND_FROM_EMAIL ?? "noreply@aydt.com";
    const resend = new Resend(apiKey);

    const to: string[] = parentEmail ? [parentEmail] : [adminEmail!];
    const bcc: string[] = parentEmail && adminEmail ? [adminEmail] : [];

    await resend.emails.send({
      from: `AYDT Registration <${fromEmail}>`,
      to,
      ...(bcc.length > 0 ? { bcc } : {}),
      subject: `Registration Confirmation — ${dancerName} for ${semesterName}`,
      html,
    });
  } catch (err) {
    console.warn("[sendRegistrationReceipt] Failed to send receipt email:", err);
  }
}

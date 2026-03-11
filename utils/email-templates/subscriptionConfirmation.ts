/**
 * Builds the confirmation email sent immediately when a user subscribes for
 * pre-registration notifications on the semester landing page.
 *
 * Uses inline CSS only — email clients strip <style> tags.
 */
export function buildSubscriptionConfirmationEmail(params: {
  name: string | null;
  semesterName: string;
  registrationOpenAt: string | null;
}): { subject: string; html: string } {
  const { name, semesterName, registrationOpenAt } = params;

  const greeting = name ? `Hi ${name}!` : "Hi there!";

  const openDateLine = registrationOpenAt
    ? `<p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.6;">
        Registration opens <strong style="color:#1f2937;">${formatOpenDate(registrationOpenAt)}</strong>.
        We'll send you a reminder the moment enrollment is live.
      </p>`
    : `<p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.6;">
        We'll send you an email the moment enrollment is live.
      </p>`;

  const subject = `You're on the list — ${semesterName}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="padding-bottom:24px;text-align:center;">
              <span style="display:inline-block;background-color:#4f46e5;color:#ffffff;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;padding:6px 16px;border-radius:100px;">
                AYDT
              </span>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:#ffffff;border-radius:16px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

              <!-- Checkmark icon -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom:24px;">
                    <div style="display:inline-block;width:56px;height:56px;background-color:#ede9fe;border-radius:50%;text-align:center;line-height:56px;font-size:24px;">
                      ✓
                    </div>
                  </td>
                </tr>
              </table>

              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;text-align:center;">
                You're on the list!
              </h1>
              <p style="margin:0 0 28px;font-size:15px;color:#6b7280;text-align:center;">
                ${semesterName}
              </p>

              <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.6;">
                ${greeting} You've been added to the notification list for
                <strong style="color:#1f2937;">${semesterName}</strong>.
              </p>

              ${openDateLine}

              <p style="margin:0;color:#4b5563;font-size:15px;line-height:1.6;">
                Keep an eye on your inbox — registration spots fill up quickly!
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:24px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
                AYDT &middot; You received this because you signed up for registration notifications.<br />
                If this wasn't you, you can safely ignore this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

function formatOpenDate(isoString: string): string {
  return new Date(isoString).toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

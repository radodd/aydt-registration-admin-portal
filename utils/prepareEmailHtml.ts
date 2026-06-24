/**
 * Prepares email HTML for delivery via Resend.
 *
 * 1. Ensures every <img> tag carries explicit `width` and (for banners) `height`
 *    HTML attributes. Outlook ignores CSS dimensions entirely — only HTML
 *    attributes control rendered size in Outlook 2007–2019.
 *
 *    Width rules:
 *      - data-layout="banner"  → width="600"  (full email width)
 *      - data-layout="inline"  → width="400"
 *      - no layout attr        → width="600"  (safe default)
 *      - already has width=    → left unchanged
 *
 *    Banner height rules (data-banner-height):
 *      - "small"   → height="160"
 *      - "medium"  → height="240"  (default)
 *      - "large"   → height="320"
 *      - absent    → height="240"  (safe default for banners)
 *      - inline images get no height attribute (natural height)
 *
 * 2. Wraps the content in a production-safe 3-layer email layout:
 *      <html> → <body> (gray background) → outer table → 600px white card
 *    This ensures a centered, fixed-width email on every client, with
 *    automatic 100% scaling on mobile.
 */

const BANNER_HEIGHT_MAP: Record<string, number> = {
  small: 160,
  medium: 240,
  large: 320,
};

const IMAGE_WIDTH_MAP: Record<string, number> = {
  small: 200,
  medium: 400,
  large: 600,
};

function processImages(html: string): string {
  return html.replace(/<img([^>]*?)>/gi, (match, attrs: string) => {
    const isBanner =
      /data-layout="banner"/i.test(attrs) || !/data-layout=/i.test(attrs);

    let result = attrs;

    // Add width if missing
    if (!/\bwidth=/i.test(result)) {
      let px: number;
      if (isBanner) {
        px = 600;
      } else {
        const sizeKey =
          /data-image-size="(\w+)"/i.exec(result)?.[1] ?? "medium";
        px = IMAGE_WIDTH_MAP[sizeKey] ?? 400;
      }
      result += ` width="${px}"`;
    }

    // Add height for banners if missing
    if (isBanner && !/\bheight=/i.test(result)) {
      const heightKey =
        /data-banner-height="(\w+)"/i.exec(result)?.[1] ?? "medium";
      const px = BANNER_HEIGHT_MAP[heightKey] ?? 240;
      result += ` height="${px}"`;

      // Add object-fit via style if not already present — supported in modern email clients
      // and gracefully ignored by Outlook (which uses width/height attrs instead)
      if (!/\bstyle=/i.test(result)) {
        result += ` style="object-fit:cover;display:block;"`;
      }
    }

    return `<img${result}>`;
  });
}

const SITE_URL =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_SITE_URL) ||
  // Fallback must be the live Next app (serves /brand assets); the apex
  // aydt.nyc is the marketing site and 404s on /brand.
  "https://register.aydt.nyc";

// Horizontal brand lockup (dancer mark + "American Youth" / "Dance Theater"
// in the brand fonts). Served from /public/brand — an image is used instead
// of live web fonts because Outlook and Gmail strip @font-face entirely.
const LOGO_URL = `${SITE_URL}/brand/logo-primary-blush-cherry.png`;

/**
 * Brand palette for emails. The single source of truth so every email —
 * and the reusable button below — stays on-brand without copy/paste drift.
 */
export const EMAIL_COLORS = {
  cherry: "#691F19", // header rule + footer background
  mauve: "#AA6260", // primary call-to-action button
  cream: "#FFFBF9", // header background
  pageBg: "#EFE7E3", // outer page background
  textPrimary: "#1F1513",
  footerText: "#F4DDD9",
  footerMuted: "#E3BFBA",
} as const;

/**
 * Reusable branded call-to-action button.
 *
 * Use this everywhere a primary action link is needed so the button color and
 * shape stay consistent across every email. Padding lives on the <a> to match
 * the existing email-button convention in this codebase.
 *
 * @example
 *   wrapEmailLayout(`<p>Your spot is ready.</p>${emailButton(url, "Accept invite")}`)
 */
export function emailButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;font-family:Arial,Helvetica,sans-serif;font-weight:600;font-size:14px;color:#ffffff;background-color:${EMAIL_COLORS.mauve};padding:13px 30px;border-radius:8px;text-decoration:none;">${label}</a>`;
}

export function wrapEmailLayout(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>AYDT Email</title>
</head>
<body style="margin:0;padding:0;background-color:${EMAIL_COLORS.pageBg};font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${EMAIL_COLORS.pageBg}" style="background-color:${EMAIL_COLORS.pageBg};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;">

   <!-- HEADER — cream background, centered brand lockup -->
<tr>
  <td align="center" bgcolor="${EMAIL_COLORS.cream}" style="background-color:${EMAIL_COLORS.cream};padding:28px 24px 24px;">
    <img
      src="${LOGO_URL}"
      width="260"
      alt="American Youth Dance Theater"
      style="display:block;width:260px;max-width:72%;height:auto;border:0;margin:0 auto;">
  </td>
</tr>

   <!-- CHERRY RULE -->
<tr>
  <td bgcolor="${EMAIL_COLORS.cherry}" style="height:3px;line-height:3px;font-size:0;background-color:${EMAIL_COLORS.cherry};">&nbsp;</td>
</tr>

        <!-- CONTENT -->
        <tr>
          <td style="padding:36px 40px 40px;color:${EMAIL_COLORS.textPrimary};font-size:16px;line-height:1.65;font-family:Arial,Helvetica,sans-serif;">
            ${content}
          </td>
        </tr>

        <!-- WINE FOOTER -->
<tr>
  <td bgcolor="${EMAIL_COLORS.cherry}" style="background-color:${EMAIL_COLORS.cherry};padding:28px;color:${EMAIL_COLORS.footerText};font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;">

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>

        <!-- LOCATION 1 -->
        <td style="vertical-align:top;width:50%;padding-right:12px;color:${EMAIL_COLORS.footerMuted};">
          <strong style="font-size:14px;color:#ffffff;">Upper East Side</strong><br>
          428 E 75th Street<br>
          New York, NY 10021<br><br>

          O: (212) 717-5419<br>
          F: (866) 679-8943<br><br>

          Mon – Fri 9:00 am – 8:30 pm<br>
          Sat 9:00 am – 3:00 pm
        </td>

        <!-- LOCATION 2 -->
        <td style="vertical-align:top;width:50%;padding-left:12px;color:${EMAIL_COLORS.footerMuted};">
          <strong style="font-size:14px;color:#ffffff;">Washington Heights</strong><br>
          4140 Broadway, Fl 2 @ NoMAA<br>
          New York, NY 10033<br><br>

          O: (212) 717-5419<br>
          Español: (646) 586-8661<br><br>

          Tues 3:00 pm – 5:45 pm<br>
          Sat 10:00 am – 1:00 pm
        </td>

      </tr>
    </table>

    <!-- FOOTER LINKS -->
    <div style="margin-top:22px;text-align:center;">
      <a href="${SITE_URL}" style="color:${EMAIL_COLORS.footerText};text-decoration:none;">Visit Website</a>
      &nbsp;|&nbsp;
      <a href="${SITE_URL}/contact" style="color:${EMAIL_COLORS.footerText};text-decoration:none;">Contact Us</a>
    </div>

  </td>
</tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export function prepareEmailHtml(html: string): string {
  return wrapEmailLayout(processImages(html));
}

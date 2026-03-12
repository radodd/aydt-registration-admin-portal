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

function processImages(html: string): string {
  return html.replace(/<img([^>]*?)>/gi, (match, attrs: string) => {
    const isBanner =
      /data-layout="banner"/i.test(attrs) || !/data-layout=/i.test(attrs);

    let result = attrs;

    // Add width if missing
    if (!/\bwidth=/i.test(result)) {
      const px = isBanner ? 600 : 400;
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

const LOGO_URL =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/email-logo.png`
    : "https://aydt.com/email-logo.png");

const SITE_URL =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_APP_URL) ||
  "https://aydt.com";

export function wrapEmailLayout(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>AYDT Email</title>
</head>
<body style="margin:0;padding:0;background-color:#F2E7E4;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#F2E7E4" style="background-color:#F2E7E4;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;">

        <!-- HEADER -->
        <tr>
          <td bgcolor="#7B1F1A" style="background-color:#7B1F1A;padding:24px;text-align:center;">
            <img src="${LOGO_URL}" width="160" style="display:block;margin:0 auto;width:160px;height:auto;" alt="AYDT Logo">
          </td>
        </tr>

        <!-- CONTENT -->
        <tr>
          <td style="padding:32px;color:#333333;font-size:16px;line-height:1.6;">
            ${content}
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td bgcolor="#7B1F1A" style="background-color:#7B1F1A;color:#ffffff;padding:24px;text-align:center;font-size:13px;line-height:1.5;">
            <p style="margin:0 0 8px 0;font-weight:bold;">AYDT Dance Studio</p>
            <p style="margin:0 0 8px 0;">Raleigh, NC</p>
            <p style="margin:0;">
              <a href="${SITE_URL}" style="color:#E6D5D1;text-decoration:none;">Visit Website</a> &nbsp;|&nbsp;
              <a href="${SITE_URL}/contact" style="color:#E6D5D1;text-decoration:none;">Contact Us</a>
            </p>
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

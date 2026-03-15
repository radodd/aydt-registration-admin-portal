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

const LOGO_URL =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/email-logo.png`
    : "https://aydt.com/email-logo.png";

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
  <td bgcolor="#7B1F1A" style="background-color:#7B1F1A;padding:18px 24px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td style="vertical-align:middle;width:120px;">
          <img 
            src="https://bulplzknfbietpmdfwlk.supabase.co/storage/v1/object/public/email-assets/email-images/04d4ec78-727f-4f61-a6a1-372e9c1623b4.png"
            width="50"
            style="display:block;width:50px;height:auto;border:0;"
            alt="AYDT Logo">
        </td>
        <td style="vertical-align:middle;color:#ffffff;font-size:18px;font-weight:600;font-family:Arial,Helvetica,sans-serif;">
          American Youth Dance Theater
        </td>
      </tr>
    </table>
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
  <td bgcolor="#7B1F1A" style="background-color:#7B1F1A;padding:28px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;">
    
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>

        <!-- LOCATION 1 -->
        <td style="vertical-align:top;width:50%;padding-right:12px;">
          <strong style="font-size:14px;">Upper East Side</strong><br>
          428 E 75th Street<br>
          New York, NY 10021<br><br>

          O: (212) 717-5419<br>
          F: (866) 679-8943<br><br>

          Mon – Fri 9:00 am – 8:30 pm<br>
          Sat 9:00 am – 3:00 pm
        </td>

        <!-- LOCATION 2 -->
        <td style="vertical-align:top;width:50%;padding-left:12px;">
          <strong style="font-size:14px;">Washington Heights</strong><br>
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
      <a href="${SITE_URL}" style="color:#E6D5D1;text-decoration:none;">Visit Website</a>
      &nbsp;|&nbsp;
      <a href="${SITE_URL}/contact" style="color:#E6D5D1;text-decoration:none;">Contact Us</a>
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

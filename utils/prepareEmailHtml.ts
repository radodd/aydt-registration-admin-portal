/**
 * Prepares email HTML for delivery via Resend.
 *
 * Ensures every <img> tag carries explicit `width` and (for banners) `height`
 * HTML attributes. Outlook ignores CSS dimensions entirely — only HTML
 * attributes control rendered size in Outlook 2007–2019.
 *
 * Width rules:
 *   - data-layout="banner"  → width="600"  (full email width)
 *   - data-layout="inline"  → width="400"
 *   - no layout attr        → width="600"  (safe default)
 *   - already has width=    → left unchanged
 *
 * Banner height rules (data-banner-height):
 *   - "small"   → height="160"
 *   - "medium"  → height="240"  (default)
 *   - "large"   → height="320"
 *   - absent    → height="240"  (safe default for banners)
 *   - inline images get no height attribute (natural height)
 */

const BANNER_HEIGHT_MAP: Record<string, number> = {
  small: 160,
  medium: 240,
  large: 320,
};

export function prepareEmailHtml(html: string): string {
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

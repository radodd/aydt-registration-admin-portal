import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";
import {
  getWebhookLimiter,
  getUploadLimiter,
  getMediaLimiter,
  getRegisterLimiter,
} from "@/utils/ratelimit";

type LimiterFactory = () => ReturnType<typeof getWebhookLimiter>;

const RATE_LIMITED_PATHS: Array<[string, LimiterFactory]> = [
  ["/api/webhooks", getWebhookLimiter],
  ["/api/upload-image", getUploadLimiter],
  ["/api/media", getMediaLimiter],
  ["/api/register", getRegisterLimiter],
];

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  for (const [prefix, getLimiter] of RATE_LIMITED_PATHS) {
    if (pathname.startsWith(prefix)) {
      const ip =
        request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
        request.headers.get("x-real-ip") ??
        "unknown";

      const { success, reset } = await getLimiter().limit(ip);

      if (!success) {
        const retryAfterSeconds = Math.ceil((reset - Date.now()) / 1000);
        return new NextResponse("Too Many Requests", {
          status: 429,
          headers: {
            "Retry-After": String(retryAfterSeconds),
            "Content-Type": "text/plain",
          },
        });
      }

      break;
    }
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

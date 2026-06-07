import { type NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

const handleI18nRouting = createMiddleware(routing);

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function enforceSameOrigin(request: NextRequest): NextResponse | null {
  if (!MUTATING_METHODS.has(request.method)) {
    return null;
  }

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = request.headers.get("host");

  if (!origin && !referer) {
    return new NextResponse("Forbidden: missing origin/referer", { status: 403 });
  }

  const allowed = (value: string | null): boolean => {
    if (!value) return false;
    try {
      return new URL(value).host === host;
    } catch {
      return false;
    }
  };

  if (origin && !allowed(origin)) {
    return new NextResponse("Forbidden: cross-origin request blocked", { status: 403 });
  }
  if (!origin && referer && !allowed(referer)) {
    return new NextResponse("Forbidden: cross-origin referer", { status: 403 });
  }

  return null;
}

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return enforceSameOrigin(request) ?? NextResponse.next();
  }
  return handleI18nRouting(request);
}

export const config = {
  matcher: ["/api/:path*", "/((?!api|_next|_vercel|.*\\..*).*)"],
};

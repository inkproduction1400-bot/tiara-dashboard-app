import { NextResponse, type NextRequest } from "next/server";
import { isPhoneOnlyUserAgent } from "./src/lib/mobile-device";

function shouldSkip(pathname: string): boolean {
  return (
    pathname.startsWith("/m") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/icons") ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.json" ||
    pathname === "/sw.js"
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (shouldSkip(pathname)) {
    return NextResponse.next();
  }

  if (pathname !== "/") {
    return NextResponse.next();
  }

  const userAgent = request.headers.get("user-agent");
  if (!isPhoneOnlyUserAgent(userAgent)) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/m/chat";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: "/:path*",
};

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE_NAME = "session";

const PUBLIC_EXACT_PATHS = ["/", "/login", "/signup"];
const PUBLIC_PREFIX_PATHS = ["/api/auth/", "/reset-password"];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT_PATHS.includes(pathname)) {
    return true;
  }
  return PUBLIC_PREFIX_PATHS.some((prefix) => pathname.startsWith(prefix));
}

function isStaticPath(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.endsWith(".css") ||
    pathname.endsWith(".js") ||
    pathname.endsWith(".map") ||
    pathname.endsWith(".ico") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".svg")
  );
}

function isOnboardingPath(pathname: string): boolean {
  return pathname === "/onboarding" || pathname.startsWith("/onboarding/");
}

function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

interface SessionData {
  userId: string;
  onboardingComplete: boolean;
}

async function getSessionData(
  token: string
): Promise<SessionData | null> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    return null;
  }
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret)
    );
    if (typeof payload.userId !== "string") {
      return null;
    }
    return {
      userId: payload.userId,
      onboardingComplete: payload.onboardingComplete === true,
    };
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (isStaticPath(pathname) || isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const session = await getSessionData(token);

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Onboarding redirect logic:
  // - Non-onboarded users are redirected to /onboarding (except when already there or on API routes)
  // - Onboarded users on /onboarding are redirected to /dashboard
  if (!session.onboardingComplete && !isOnboardingPath(pathname) && !isApiPath(pathname)) {
    const onboardingUrl = new URL("/onboarding", request.url);
    return NextResponse.redirect(onboardingUrl);
  }

  if (session.onboardingComplete && isOnboardingPath(pathname)) {
    const dashboardUrl = new URL("/dashboard", request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};

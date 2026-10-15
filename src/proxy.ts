import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Conveniência apenas: sem cookie de sessão, áreas protegidas vão para /entrar.
 * NÃO é barreira de segurança (CVE-2025-29927): layouts, páginas e cada Server Action
 * revalidam sessão e permissão no servidor.
 */
export function proxy(request: NextRequest) {
  const cookie = getSessionCookie(request, { cookiePrefix: "vallur" });
  if (!cookie) {
    const destino = new URL("/entrar", request.url);
    return NextResponse.redirect(destino);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/ti/:path*", "/portal/:path*", "/conta/:path*"],
};

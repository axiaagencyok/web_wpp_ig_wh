import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";

/**
 * Inicia el flujo OAuth de Mercado Libre.
 *
 * - Genera un `state` aleatorio y lo persiste como cookie httpOnly (CSRF).
 * - Redirige al `authorization_url` de MELI con client_id + redirect_uri + state.
 *
 * `redirect_uri` se calcula como `${NEXT_PUBLIC_APP_URL}/api/auth/meli/callback`.
 * Tiene que matchear EXACTO con lo que está registrado en la app de MELI.
 */

const AUTH_BASE = "https://auth.mercadolibre.com.ar/authorization";
const STATE_COOKIE = "meli_oauth_state";
const STATE_TTL_SEC = 600; // 10 minutos

export async function GET() {
  const clientId = process.env.MELI_CLIENT_ID?.trim();
  if (!clientId) {
    return new NextResponse("MELI_CLIENT_ID no configurado", { status: 500 });
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!appUrl) {
    return new NextResponse("NEXT_PUBLIC_APP_URL no configurado", { status: 500 });
  }
  const redirectUri = `${appUrl.replace(/\/$/, "")}/api/auth/meli/callback`;

  const state = crypto.randomBytes(16).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: appUrl.startsWith("https://"),
    path: "/",
    maxAge: STATE_TTL_SEC,
  });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
  });

  return NextResponse.redirect(`${AUTH_BASE}?${params.toString()}`);
}

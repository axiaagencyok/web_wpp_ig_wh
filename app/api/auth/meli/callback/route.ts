import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { exchangeCodeForToken, getMeliRequest } from "@/lib/meli/client";
import type { MeliAccount } from "@/types/database.types";

/**
 * Callback OAuth de Mercado Libre.
 *
 * Pasos:
 *   1. Validar state contra la cookie (CSRF).
 *   2. Resolver tenant_id:
 *      a. Si hay sesión Supabase, usar el tenant del usuario logueado.
 *      b. Si no, fallback temporal a INSTAGRAM_TENANT_ID (la convención del
 *         resto del backend para "el tenant default de este deployment").
 *   3. exchangeCodeForToken → access/refresh tokens.
 *   4. GET /users/me con el access token → meli_user_id + nickname.
 *   5. Upsert en meli_accounts por (tenant_id, meli_user_id).
 *   6. Redirect a /meli con query de éxito o error.
 */

const STATE_COOKIE = "meli_oauth_state";

interface MeliUsersMe {
  id: number;
  nickname?: string;
}

export async function GET(req: NextRequest) {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const meliPanel = `${appUrl}/meli`;

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    console.error(`[meli/callback] OAuth error from MELI: ${error}`);
    return NextResponse.redirect(`${meliPanel}?meli=error&reason=${encodeURIComponent(error)}`);
  }
  if (!code || !state) {
    return NextResponse.redirect(`${meliPanel}?meli=error&reason=missing_params`);
  }

  // 1. Validar state
  const cookieStore = await cookies();
  const cookieState = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);
  if (!cookieState || cookieState !== state) {
    console.warn("[meli/callback] state mismatch — posible CSRF");
    return NextResponse.redirect(`${meliPanel}?meli=error&reason=state_mismatch`);
  }

  // 2. Resolver tenant_id
  const tenantId = await resolveTenantId();
  if (!tenantId) {
    return NextResponse.redirect(`${meliPanel}?meli=error&reason=tenant_unresolved`);
  }

  // 3. Intercambiar code → tokens
  const redirectUri = `${appUrl}/api/auth/meli/callback`;
  let tokens;
  try {
    tokens = await exchangeCodeForToken(code, redirectUri);
  } catch (e) {
    console.error("[meli/callback] exchangeCodeForToken:", (e as Error).message);
    return NextResponse.redirect(`${meliPanel}?meli=error&reason=exchange_failed`);
  }

  // 4. GET /users/me — construimos un MeliAccount "temporal" para usar el client
  const tempAccount: MeliAccount = {
    id: "temp-callback",
    tenant_id: tenantId,
    meli_user_id: 0,
    meli_nickname: null,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    scope: tokens.scope ?? null,
    status: "connected",
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  let me: MeliUsersMe;
  try {
    me = await getMeliRequest<MeliUsersMe>(tempAccount, "/users/me");
  } catch (e) {
    console.error("[meli/callback] users/me:", (e as Error).message);
    return NextResponse.redirect(`${meliPanel}?meli=error&reason=users_me_failed`);
  }

  // 5. Upsert en meli_accounts
  const expiresAtIso = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  const { error: upsertErr } = await adminClient.from("meli_accounts").upsert(
    {
      tenant_id: tenantId,
      meli_user_id: me.id,
      meli_nickname: me.nickname ?? null,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAtIso,
      scope: tokens.scope ?? null,
      status: "connected",
    },
    { onConflict: "tenant_id,meli_user_id" }
  );

  if (upsertErr) {
    console.error("[meli/callback] upsert error:", upsertErr.message);
    return NextResponse.redirect(`${meliPanel}?meli=error&reason=upsert_failed`);
  }

  return NextResponse.redirect(`${meliPanel}?meli=connected&user=${encodeURIComponent(me.nickname ?? String(me.id))}`);
}

async function resolveTenantId(): Promise<string | null> {
  // a. Usuario logueado en el panel → tenant del row en public.users
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: row } = await supabase
        .from("users")
        .select("tenant_id")
        .eq("id", user.id)
        .maybeSingle();
      if (row?.tenant_id) return row.tenant_id;
    }
  } catch {
    // ignore; pasamos al fallback
  }

  // b. Fallback temporal: INSTAGRAM_TENANT_ID — la convención existente del
  // backend para "el tenant default de este deployment" (un Vercel project
  // sirve a un solo cliente).
  const fallback = process.env.INSTAGRAM_TENANT_ID?.trim();
  return fallback ?? null;
}

import { adminClient } from "@/lib/supabase/admin";
import type { MeliAccount } from "@/types/database.types";

/**
 * Cliente HTTP de Mercado Libre.
 *
 * Responsabilidades:
 * - exchangeCodeForToken / refreshAccessToken: usan el endpoint OAuth de MELI.
 * - getMeliRequest / postMeliRequest: requests autenticadas con auto-refresh.
 *   Si `expires_at` ya pasó (con un buffer de 60s) refresca el token y
 *   persiste el nuevo `access_token`/`refresh_token`/`expires_at` en la row.
 *   Si vuelve un 401 después del request, intenta refresh + retry una vez;
 *   si vuelve a fallar marca la account como `needs_reauth`.
 * - Reintenta automáticamente 429 (rate limit) con backoff exponencial hasta
 *   3 intentos.
 */

export const OAUTH_BASE = "https://api.mercadolibre.com/oauth/token";
export const API_BASE = "https://api.mercadolibre.com";

const REFRESH_SAFETY_MS = 60_000; // refrescar 60s antes del expires_at real
const RATE_LIMIT_DELAYS_MS = [500, 1500, 4500];

export interface MeliTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
  scope?: string;
  user_id?: number;
  token_type?: string;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`[meli] env requerida no definida: ${name}`);
  }
  return v;
}

function nowMs(): number {
  return Date.now();
}

// ── OAuth ────────────────────────────────────────────────────────────────────

export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<MeliTokenResponse> {
  const clientId = requireEnv("MELI_CLIENT_ID");
  const clientSecret = requireEnv("MELI_CLIENT_SECRET");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  });

  const res = await fetch(OAUTH_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`[meli] exchangeCodeForToken failed: ${res.status} ${text}`);
  }
  return (await res.json()) as MeliTokenResponse;
}

export async function refreshAccessToken(refreshToken: string): Promise<MeliTokenResponse> {
  const clientId = requireEnv("MELI_CLIENT_ID");
  const clientSecret = requireEnv("MELI_CLIENT_SECRET");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const res = await fetch(OAUTH_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`[meli] refreshAccessToken failed: ${res.status} ${text}`);
  }
  return (await res.json()) as MeliTokenResponse;
}

// ── Token freshness ──────────────────────────────────────────────────────────

async function ensureFreshToken(account: MeliAccount): Promise<MeliAccount> {
  const expiresAtMs = new Date(account.expires_at).getTime();
  if (expiresAtMs - nowMs() > REFRESH_SAFETY_MS) return account;

  // Token expirado o muy cerca de expirar — refrescar.
  let refreshed: MeliTokenResponse;
  try {
    refreshed = await refreshAccessToken(account.refresh_token);
  } catch (e) {
    // El refresh token también puede expirar (6 meses sin uso) o haber sido revocado.
    await markNeedsReauth(account.id);
    throw new Error(`[meli] refresh failed for account ${account.id} — marked needs_reauth. ${(e as Error).message}`);
  }

  const newExpiresAt = new Date(nowMs() + refreshed.expires_in * 1000).toISOString();
  const { data, error } = await adminClient
    .from("meli_accounts")
    .update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_at: newExpiresAt,
      scope: refreshed.scope ?? account.scope,
      status: "connected",
    })
    .eq("id", account.id)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`[meli] no se pudo persistir el token refrescado: ${error?.message ?? "no row"}`);
  }
  return data;
}

async function markNeedsReauth(accountId: string): Promise<void> {
  await adminClient.from("meli_accounts").update({ status: "needs_reauth" }).eq("id", accountId);
}

// ── Autenticated requests ────────────────────────────────────────────────────

export interface MeliRequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

async function rawRequest<T>(
  account: MeliAccount,
  path: string,
  init: RequestInit
): Promise<{ ok: boolean; status: number; data: T | null; rawText: string }> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${account.access_token}`,
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });

  const rawText = await res.text();
  let data: T | null = null;
  if (rawText) {
    try {
      data = JSON.parse(rawText) as T;
    } catch {
      data = null;
    }
  }
  return { ok: res.ok, status: res.status, data, rawText };
}

function buildUrl(path: string, query?: MeliRequestOptions["query"]): string {
  if (!query) return path;
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    search.set(k, String(v));
  }
  const qs = search.toString();
  return qs ? `${path}${path.includes("?") ? "&" : "?"}${qs}` : path;
}

async function request<T>(
  account: MeliAccount,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  bodyJson?: unknown,
  options: MeliRequestOptions = {}
): Promise<T> {
  let acc = await ensureFreshToken(account);
  const url = buildUrl(path, options.query);
  const init: RequestInit = {
    method,
    headers: {
      ...(bodyJson !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
    body: bodyJson !== undefined ? JSON.stringify(bodyJson) : undefined,
    signal: options.signal,
  };

  // Primer intento + posibles reintentos por 429
  let lastErr: { status: number; rawText: string } | null = null;
  for (let attempt = 0; attempt < RATE_LIMIT_DELAYS_MS.length + 1; attempt++) {
    const { ok, status, data, rawText } = await rawRequest<T>(acc, url, init);
    if (ok && data !== null) return data;
    if (ok && data === null) {
      // 2xx con body vacío — devolvemos {} casteado
      return {} as T;
    }

    if (status === 401) {
      // Refresh + retry una vez. Si vuelve a fallar 401 → needs_reauth.
      try {
        acc = await ensureFreshToken({ ...acc, expires_at: new Date(0).toISOString() });
      } catch {
        throw new Error(`[meli] ${method} ${path} -> 401 + refresh failed (needs_reauth)`);
      }
      const second = await rawRequest<T>(acc, url, init);
      if (second.ok && second.data !== null) return second.data;
      if (second.status === 401) {
        await markNeedsReauth(acc.id);
        throw new Error(`[meli] ${method} ${path} -> 401 after refresh; account marked needs_reauth`);
      }
      lastErr = { status: second.status, rawText: second.rawText };
      throw new Error(`[meli] ${method} ${path} -> ${second.status} ${second.rawText.slice(0, 300)}`);
    }

    if (status === 429 && attempt < RATE_LIMIT_DELAYS_MS.length) {
      const delay = RATE_LIMIT_DELAYS_MS[attempt];
      console.warn(`[meli] 429 on ${method} ${path}, retry in ${delay}ms (attempt ${attempt + 1})`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    lastErr = { status, rawText };
    break;
  }

  throw new Error(
    `[meli] ${method} ${path} failed: ${lastErr?.status ?? "?"} ${lastErr?.rawText.slice(0, 300) ?? ""}`
  );
}

export function getMeliRequest<T>(account: MeliAccount, path: string, options?: MeliRequestOptions): Promise<T> {
  return request<T>(account, "GET", path, undefined, options);
}

export function postMeliRequest<T>(
  account: MeliAccount,
  path: string,
  body: unknown,
  options?: MeliRequestOptions
): Promise<T> {
  return request<T>(account, "POST", path, body, options);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export async function getMeliAccountByUserId(meliUserId: number): Promise<MeliAccount | null> {
  const { data, error } = await adminClient
    .from("meli_accounts")
    .select("*")
    .eq("meli_user_id", meliUserId)
    .maybeSingle();
  if (error) {
    console.error(`[meli] getMeliAccountByUserId(${meliUserId}) error:`, error.message);
    return null;
  }
  return data ?? null;
}

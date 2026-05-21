// Endpoint de salud — usado por el smoke test post-deploy del CI.
// Retorna 200 con { status: "ok", version, dbConnected: true } si la app
// arrancó bien y puede tocar la DB. Cualquier error → 500.
//
// La versión es el SHA de git del deploy; Vercel inyecta
// `VERCEL_GIT_COMMIT_SHA` automáticamente. En otros entornos cae a
// `GIT_SHA` si está definido, o "unknown".

import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function getVersion(): string {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.GIT_SHA ??
    "unknown"
  ).slice(0, 12);
}

export async function GET() {
  const version = getVersion();

  try {
    // HEAD count contra `tenants` — query barato, no devuelve filas, solo
    // confirma que el SERVICE_ROLE puede pegarle a la DB y que la tabla
    // existe.
    const { error } = await adminClient
      .from("tenants")
      .select("*", { count: "exact", head: true });

    if (error) {
      return NextResponse.json(
        { status: "error", version, dbConnected: false, error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ status: "ok", version, dbConnected: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { status: "error", version, dbConnected: false, error: msg },
      { status: 500 },
    );
  }
}

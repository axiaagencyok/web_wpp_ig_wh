import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

/**
 * POST /api/settings/catalog-pdf
 * Body: multipart/form-data with field `file` (application/pdf).
 *
 * - Sube el PDF al bucket `catalogs` en el path `{tenant_id}/catalog.pdf`
 *   (sobreescribe el existente).
 * - Actualiza `tenants.catalog_pdf_path` con esa key.
 * - NO toca `catalog_source` (el cliente lo configura aparte vía /settings).
 * - Invalida el cache: setea `catalog_text_cache = NULL` y
 *   `catalog_text_cached_at = NULL` para que el próximo turno del agente
 *   re-extraiga.
 *
 * Límites:
 * - El runtime de Vercel tiene un cap de ~4.5MB para el body de un Route
 *   Handler. Catálogos típicos están por debajo de 2MB; si el PDF excede,
 *   devolvemos 413 con un mensaje claro.
 */

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  // Resolver tenant del usuario
  const { data: userRow, error: userErr } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();
  if (userErr || !userRow?.tenant_id) {
    return NextResponse.json({ error: "tenant-unresolved" }, { status: 403 });
  }
  const tenantId = userRow.tenant_id;

  // Parse form data
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid-form-data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "file-missing" }, { status: 400 });
  }

  // Validaciones básicas
  if (file.type && !file.type.includes("pdf")) {
    return NextResponse.json(
      { error: "invalid-content-type", detail: `Esperaba application/pdf, recibí "${file.type}".` },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "file-too-large", detail: `El PDF supera ${MAX_BYTES / 1024 / 1024} MB.` },
      { status: 413 }
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "file-empty" }, { status: 400 });
  }

  const path = `${tenantId}/catalog.pdf`;
  const buffer = Buffer.from(await file.arrayBuffer());

  // Upload con upsert (sobreescribe el existente).
  const { error: uploadErr } = await adminClient.storage
    .from("catalogs")
    .upload(path, buffer, { upsert: true, contentType: "application/pdf" });

  if (uploadErr) {
    console.error("[/api/settings/catalog-pdf] storage upload error:", uploadErr.message);
    return NextResponse.json({ error: "upload-failed", detail: uploadErr.message }, { status: 500 });
  }

  // Persistir el path en el tenant + invalidar cache de texto extraído.
  const { error: updateErr } = await adminClient
    .from("tenants")
    .update({
      catalog_pdf_path: path,
      catalog_text_cache: null,
      catalog_text_cached_at: null,
    })
    .eq("id", tenantId);

  if (updateErr) {
    console.error("[/api/settings/catalog-pdf] tenant update error:", updateErr.message);
    return NextResponse.json(
      { error: "db-update-failed", detail: updateErr.message, uploaded_path: path },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    path,
    size_bytes: file.size,
    uploaded_at: new Date().toISOString(),
  });
}

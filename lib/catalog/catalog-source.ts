import { adminClient } from "@/lib/supabase/admin";
import { getCatalog, searchCatalogFullText } from "@/lib/google/sheets";
import { extractPdfText } from "./pdf-extractor";
import type { Tenant } from "@/types/database.types";

/**
 * Abstracción de la fuente del catálogo. Esconde si el catálogo vive en
 * Google Sheets o en un PDF en Supabase Storage. Devuelve siempre el texto
 * listo para inyectar al system prompt del agente.
 *
 * Para sheets, mantiene la lógica previa de `getCatalog` / `searchCatalogFullText`.
 * Para pdf, devuelve el texto completo (la búsqueda la hace el modelo en contexto).
 *
 * Path en Storage: bucket `catalogs`, key = `tenant.catalog_pdf_path`
 * (convención: `{tenant_id}/catalog.pdf`).
 *
 * Cache: `tenants.catalog_text_cache` + `catalog_text_cached_at`.
 *   Se reutiliza si el `updated_at` del archivo en Storage es <= al cached_at.
 *   Si el archivo es más nuevo, se re-extrae y se actualiza la cache.
 */

const STORAGE_BUCKET = "catalogs";

export interface GetCatalogTextOptions {
  /** Término de búsqueda. Sólo aplica a fuente 'sheets'; para 'pdf' se ignora y se devuelve el texto completo. */
  search?: string;
}

export async function getCatalogText(
  tenant: Tenant,
  options: GetCatalogTextOptions = {}
): Promise<string> {
  if (tenant.catalog_source === "pdf") {
    return getPdfCatalogText(tenant);
  }

  // Default + 'sheets'
  if (!tenant.google_sheet_id) {
    return "No hay catálogo configurado para este negocio.";
  }
  const range = tenant.google_sheet_range;
  const trimmed = options.search?.trim();
  return trimmed
    ? searchCatalogFullText(tenant.google_sheet_id, range, trimmed)
    : getCatalog(tenant.google_sheet_id, range);
}

// ── PDF source ────────────────────────────────────────────────────────────────

async function getPdfCatalogText(tenant: Tenant): Promise<string> {
  const pdfPath = tenant.catalog_pdf_path?.trim();
  if (!pdfPath) {
    throw new Error(
      `[catalog-source] Tenant ${tenant.id} tiene catalog_source='pdf' pero catalog_pdf_path está vacío.`
    );
  }

  const storageUpdatedAt = await getStorageObjectUpdatedAt(pdfPath);
  if (!storageUpdatedAt) {
    throw new Error(
      `[catalog-source] No se encontró el PDF en Storage (${STORAGE_BUCKET}/${pdfPath}). Subilo antes de procesar mensajes para este tenant.`
    );
  }

  // Cache hit: cache existe Y es al menos tan reciente como el archivo en Storage.
  const cached = tenant.catalog_text_cache?.trim();
  const cachedAt = tenant.catalog_text_cached_at;
  if (cached && cachedAt && new Date(cachedAt).getTime() >= new Date(storageUpdatedAt).getTime()) {
    return cached;
  }

  // Cache miss: descargar, extraer, guardar.
  const buffer = await downloadPdf(pdfPath);
  const text = await extractPdfText(buffer);

  const now = new Date().toISOString();
  const { error: updateErr } = await adminClient
    .from("tenants")
    .update({ catalog_text_cache: text, catalog_text_cached_at: now })
    .eq("id", tenant.id);
  if (updateErr) {
    // No bloqueamos la respuesta del agente por un fallo de escritura de cache.
    console.error(
      `[catalog-source] Falló actualizar cache para tenant ${tenant.id}:`,
      updateErr.message
    );
  }

  return text;
}

async function getStorageObjectUpdatedAt(pdfPath: string): Promise<string | null> {
  // Storage `list` espera el folder y filtra con `search`. Convención `{tenant_id}/catalog.pdf`:
  const lastSlash = pdfPath.lastIndexOf("/");
  const folder = lastSlash > 0 ? pdfPath.slice(0, lastSlash) : "";
  const filename = lastSlash > 0 ? pdfPath.slice(lastSlash + 1) : pdfPath;

  const { data, error } = await adminClient.storage
    .from(STORAGE_BUCKET)
    .list(folder, { search: filename, limit: 1 });

  if (error) {
    throw new Error(`[catalog-source] Error listando ${STORAGE_BUCKET}/${folder}: ${error.message}`);
  }
  const file = data?.find((f) => f.name === filename);
  return file?.updated_at ?? null;
}

async function downloadPdf(pdfPath: string): Promise<Buffer> {
  const { data, error } = await adminClient.storage.from(STORAGE_BUCKET).download(pdfPath);
  if (error || !data) {
    throw new Error(
      `[catalog-source] Error descargando ${STORAGE_BUCKET}/${pdfPath}: ${error?.message ?? "blob vacío"}`
    );
  }
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

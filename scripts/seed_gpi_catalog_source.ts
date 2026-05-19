/**
 * Marca al tenant de GPI con catalog_source='pdf' y catalog_pdf_path apuntando
 * a `{tenant_id}/catalog.pdf` en el bucket `catalogs`.
 *
 * Pre-requisitos:
 *   1. Migración 012 corrida en el Supabase de GPI.
 *   2. Bucket `catalogs` creado en el Dashboard de Supabase (privado, sin RLS
 *      pública — el service_role bypasea RLS).
 *   3. PDF subido a `catalogs/{tenant_id}/catalog.pdf` (a mano, en el Dashboard
 *      o vía API). Si todavía no está, el script igualmente persiste el path —
 *      el agente fallará ruidoso recién al primer mensaje.
 *
 * Uso:
 *   cd agentewpp
 *   npx tsx --env-file=.env.gpi.local scripts/seed_gpi_catalog_source.ts
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("❌ Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.");
  process.exit(1);
}

const supabase = createClient<Database>(supabaseUrl, serviceRoleKey);

const TENANT_NAME = "GPI Todo en Pisos";

async function run() {
  const { data: tenant, error: fetchErr } = await supabase
    .from("tenants")
    .select("id, name, catalog_source, catalog_pdf_path")
    .eq("name", TENANT_NAME)
    .maybeSingle();

  if (fetchErr) {
    console.error(`❌ Error consultando tenant "${TENANT_NAME}":`, fetchErr.message);
    process.exit(1);
  }
  if (!tenant) {
    console.error(`❌ No se encontró tenant con name="${TENANT_NAME}". Corré primero seed_gpi_tenant.ts.`);
    process.exit(1);
  }

  const pdfPath = `${tenant.id}/catalog.pdf`;
  console.log(`→ Tenant: ${tenant.name} (${tenant.id})`);
  console.log(`  catalog_source actual:    ${tenant.catalog_source}`);
  console.log(`  catalog_pdf_path actual:  ${tenant.catalog_pdf_path ?? "(null)"}`);
  console.log(`  catalog_pdf_path objetivo: ${pdfPath}`);

  const { error: updateErr } = await supabase
    .from("tenants")
    .update({
      catalog_source: "pdf",
      catalog_pdf_path: pdfPath,
      // Limpiamos cache para que el primer turno relea desde Storage.
      catalog_text_cache: null,
      catalog_text_cached_at: null,
    })
    .eq("id", tenant.id);

  if (updateErr) {
    console.error("❌ Error actualizando tenant:", updateErr.message);
    process.exit(1);
  }

  console.log(`\n✅ Tenant ${tenant.name} marcado con catalog_source='pdf' y path '${pdfPath}'.`);
  console.log(
    `   Recordá subir el PDF a catalogs/${pdfPath} antes del primer mensaje del cliente.`
  );
}

run();

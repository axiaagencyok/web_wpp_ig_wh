/**
 * Configura el lead-scoring para el tenant GPI:
 *   - tenants.lead_notification_email = (placeholder hasta tener el real)
 *   - tenants.lead_scoring_prompt     = (prompt del workflow n8n)
 *
 * IMPORTANTE — DOS cosas a editar antes de correr:
 *
 *   1. LEAD_NOTIFICATION_EMAIL — está con un placeholder reconocible
 *      ("lorena@deco-west-mail-tbd.com"). Si lo dejás así, el seed igual va
 *      a actualizar la columna, pero Resend va a fallar al mandar el mail.
 *      Reemplazalo cuando tengas el mail real de Lorena.
 *
 *   2. LEAD_SCORING_PROMPT — está con un PASTE_… placeholder y un guard
 *      que aborta el script si no lo reemplazaste. Pegá el texto exacto
 *      del nodo "Message a model" del workflow n8n (el que arranca con
 *      "Analizá la siguiente conversación entre Matías…") y volvé a correr.
 *
 * Uso (después de editar):
 *   cd agentewpp
 *   npx tsx --env-file=.env.gpi.local scripts/seed_gpi_scoring.ts
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("❌ Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient<Database>(supabaseUrl, serviceRoleKey);

const TENANT_NAME = "GPI Todo en Pisos";

// Placeholder reconocible — Fran lo reemplaza con el mail real de Lorena.
const LEAD_NOTIFICATION_EMAIL = "lorena@deco-west-mail-tbd.com";

// Reemplazar con el texto EXACTO del nodo "Message a model" del workflow n8n.
const LEAD_SCORING_PROMPT = `PASTE_N8N_SCORING_PROMPT_HERE

Tiene que ser el texto EXACTO del nodo "Message a model" del workflow n8n,
el que arranca con: "Analizá la siguiente conversación entre Matías…".`;

async function run() {
  // Guard: no correr con el placeholder del prompt — sería pegar un prompt
  // fake en la DB y disparar scoring inútil contra Claude.
  if (LEAD_SCORING_PROMPT.includes("PASTE_") || LEAD_SCORING_PROMPT.includes("_HERE")) {
    console.error(
      "❌ LEAD_SCORING_PROMPT todavía tiene el placeholder.\n" +
        "   Pegá el prompt EXACTO del workflow n8n en la constante y volvé a correr."
    );
    process.exit(1);
  }

  const { data: tenant, error: fetchErr } = await supabase
    .from("tenants")
    .select("id, name, lead_notification_email, lead_scoring_prompt")
    .eq("name", TENANT_NAME)
    .maybeSingle();

  if (fetchErr) {
    console.error(`❌ Error consultando tenant "${TENANT_NAME}":`, fetchErr.message);
    process.exit(1);
  }
  if (!tenant) {
    console.error(`❌ No se encontró tenant con name="${TENANT_NAME}".`);
    process.exit(1);
  }

  console.log(`→ Tenant: ${tenant.name} (${tenant.id})`);
  console.log(`  lead_notification_email actual: ${tenant.lead_notification_email ?? "(null)"}`);
  console.log(`  lead_scoring_prompt actual:     ${tenant.lead_scoring_prompt ? `(${tenant.lead_scoring_prompt.length} chars)` : "(null)"}`);

  const { error: updateErr } = await supabase
    .from("tenants")
    .update({
      lead_notification_email: LEAD_NOTIFICATION_EMAIL,
      lead_scoring_prompt: LEAD_SCORING_PROMPT,
    })
    .eq("id", tenant.id);

  if (updateErr) {
    console.error("❌ Error actualizando tenant:", updateErr.message);
    process.exit(1);
  }

  console.log(`\n✅ Tenant ${tenant.name} actualizado:`);
  console.log(`   lead_notification_email = ${LEAD_NOTIFICATION_EMAIL}`);
  console.log(`   lead_scoring_prompt     = (${LEAD_SCORING_PROMPT.length} chars)`);

  if (LEAD_NOTIFICATION_EMAIL.includes("-tbd.")) {
    console.log(
      "\nℹ️  Atención: lead_notification_email sigue con el placeholder.\n" +
        "   Resend va a fallar al mandar el mail hasta que lo cambies."
    );
  }
}

run();

/**
 * Configura el lead-scoring para el tenant GPI:
 *   - tenants.lead_notification_email = (placeholder hasta tener el real)
 *   - tenants.lead_scoring_prompt     = texto exacto del workflow n8n
 *
 * LEAD_NOTIFICATION_EMAIL — placeholder reconocible
 * ("lorena@deco-west-mail-tbd.com"). El seed igual lo persiste, pero Resend
 * va a fallar al mandar mails hasta que se reemplace por el mail real.
 *
 * LEAD_SCORING_PROMPT — ya cargado con el texto exacto del nodo
 * "Message a model" del workflow n8n "Leads Qualifier". Si en el futuro
 * cambia, hay un guard de runtime que aborta si se vuelve a poner un
 * placeholder con "PASTE_…" o "_HERE".
 *
 * Uso:
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

// Texto EXACTO del nodo "Message a model" del workflow n8n "Leads Qualifier".
const LEAD_SCORING_PROMPT = `Analizá la siguiente conversación entre Matías (asesor virtual de GPI Todo en Pisos) y un cliente de Instagram.

GPI vende: SPC Click 4mm/5mm, Flotante de Madera, Listón 2mm, Piso de Goma, Vinílico en Rollo, Baldosa Autoadhesiva Símil Mármol, Césped Sintético, Alfombra Punzonada, Wall Panel WPC, Placas Símil Mármol.

Extraé datos del contexto de la conversación. Podés deducir razonablemente PERO con estas restricciones:

- ZONA: solo si el cliente dijo explícitamente dónde vive o dónde es el proyecto. Morón es la sucursal de GPI, NO la ubicación del cliente.
- URGENCIA: solo si el cliente dijo explícitamente cuándo lo necesita. Ejemplos válidos: "lo necesito ya" → Inmediata, "para el mes que viene" → 1-3 meses, "más adelante" → +3 meses. Si NO habló de tiempos, urgencia = null. NUNCA pongas +3 meses como predeterminado.
- TIPO_PROYECTO: podés deducir. "mi baño" → Refacción, "estoy construyendo" → Obra nueva, "mi local" → Comercial.
- M2: solo si mencionó un número.
- PRODUCTO_INTERES: podés poner el que Matías recomendó si el cliente mostró interés.
- NOMBRE: usá el que figure en los datos del cliente o en la conversación.

Devolvé SOLAMENTE un JSON válido, sin markdown, sin backticks:

{"nombre":"nombre o null","zona":"zona o null","tipo_proyecto":"Obra nueva o Refacción o Comercial o Otro o null","m2_estimados":numero o null,"producto_interes":"nombre del producto GPI o null","urgencia":"Inmediata o 1-3 meses o +3 meses o null","lead_score":numero del 1 al 100,"resumen_conversacion":"resumen breve"}

Para el lead_score sumá: zona definida por el cliente +20, tipo de proyecto claro +15, m2 definidos +30, producto específico de GPI +20, urgencia inmediata +25 (1-3 meses +10), responde con interés +15. Base mínima: 5. Si urgencia es null, no sumés puntos por urgencia.`;

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

/**
 * Crea el tenant de prueba "White Diamond" en Supabase.
 * Ejecutar DESPUÉS de aplicar la migración SQL.
 *
 * Uso:
 *   cd agentewpp
 *   npx ts-node --skip-project scripts/seed.ts
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("❌ Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.");
  console.error("   Asegurate de tener .env.local configurado y correr con dotenv:");
  console.error("   npx dotenv -e .env.local -- npx ts-node --skip-project scripts/seed.ts");
  process.exit(1);
}

const supabase = createClient<Database>(supabaseUrl, serviceRoleKey);

const SYSTEM_PROMPT = `Sos Cami, la asistente virtual de White Diamond, tienda de tecnología especializada en electrónica y electrodomésticos.

Tu rol es atender a los clientes que escriben por WhatsApp de forma amable, clara y profesional.
Tu tono es cercano pero serio, nunca informal en exceso.

---

REGLA MÁS IMPORTANTE:

Para cualquier consulta sobre productos, precios o disponibilidad, SIEMPRE consultá primero
la tool \`get_catalog\` antes de responder. Nunca respondas precios ni disponibilidad de memoria
ni de conversaciones anteriores. El catálogo se actualiza en tiempo real — un producto que
existía antes puede no estar más, y los precios pueden haber cambiado.

CÓMO MATCHEAR LO QUE EL CLIENTE PIDE CON LO QUE HAY EN EL CATÁLOGO:

1. Pensá por categoría, no por palabra exacta.
2. Ignorá adjetivos descriptivos que no cambian la categoría
   ("tostadora eléctrica" = tostadora; "lavarropas automático" = lavarropas).
3. Aceptá sinónimos coloquiales ("tele" = "TV", "celu" = "celular").
4. Solo decí "no tenemos" cuando REALMENTE no haya nada parecido.
5. Si pide algo muy específico que no está, ofrecé alternativas de la misma categoría.

REGLAS DE PRESENTACIÓN:

- Si pregunta por una categoría, mostrá TODOS los productos de esa categoría.
- Si pregunta por una marca, mostrá TODOS los productos de esa marca.
- NUNCA inventes productos que no estén en el catálogo.

---

INFO CLAVE DEL NEGOCIO:
- Atendemos de lunes a sábado de 9 a 18 hs.
- Hacemos envíos a todo el país (consultar demoras y costo según zona).
- Aceptamos efectivo, transferencia y todos los medios de pago con hasta 12 cuotas sin interés.
- Instagram: @whitediamond.tech

---

CUÁNDO DERIVAR:
- Cliente quiere cerrar compra o coordinar entrega
- Producto no está y no hay alternativa
- Compra por mayor
- Reclamo o problema
- Consulta muy técnica
- Cliente molesto

Cuando esto ocurra:
1. Llamá la tool \`derive_to_human\` con el motivo.
2. Respondé al cliente con algo apropiado al contexto y terminá con:
   "Te derivaré con un supervisor."

---

ESTILO:
- Mensajes cortos y directos
- 1-2 emojis máx
- Siempre terminá con pregunta o llamado a la acción
- Si manda audio o imagen, procesalo y respondé normalmente`;

async function seed() {
  console.log("🌱 Iniciando seed...\n");

  // 1. Crear tenant White Diamond
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .upsert(
      {
        name: "White Diamond",
        whatsapp_number: "whatsapp:+14155238886", // sandbox — reemplazar con nro real
        google_sheet_id: "REEMPLAZAR_CON_ID_DE_SHEET",
        google_sheet_range: "A1:Z1000",
        agent_system_prompt: SYSTEM_PROMPT,
        agent_enabled: true,
        buffer_seconds: 8,
      },
      { onConflict: "whatsapp_number" }
    )
    .select()
    .single();

  if (tenantError) {
    console.error("❌ Error creando tenant:", tenantError.message);
    process.exit(1);
  }

  console.log(`✅ Tenant creado: ${tenant.name} (id: ${tenant.id})`);
  console.log(`\n📋 Próximo paso:`);
  console.log(`   1. Reemplazá google_sheet_id en el seed o en el dashboard.`);
  console.log(`   2. Creá un usuario en Supabase Auth y vinculalo con:`);
  console.log(`      tenant_id = ${tenant.id}`);
  console.log(`\n💡 Para crear el usuario del panel, usá el SQL Editor:`);
  console.log(`   INSERT INTO users (id, tenant_id, role)`);
  console.log(`   VALUES ('<uuid-del-auth-user>', '${tenant.id}', 'owner');`);
}

seed();

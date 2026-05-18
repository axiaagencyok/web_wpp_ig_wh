/**
 * Aplica supabase/migrations/001_initial.sql al proyecto Supabase.
 * Usa la Management API (requiere SUPABASE_ACCESS_TOKEN).
 * Si no tenés el token, pegá el SQL directo en el SQL Editor del dashboard.
 *
 * Uso:
 *   SUPABASE_ACCESS_TOKEN=sbp_xxx npx ts-node --skip-project scripts/migrate.ts
 *
 * El project ref se resuelve en este orden:
 *   1. process.env.SUPABASE_PROJECT_REF
 *   2. subdominio de NEXT_PUBLIC_SUPABASE_URL (https://<ref>.supabase.co)
 */

import fs from "fs";
import path from "path";

function resolveProjectRef(): string {
  const explicit = process.env.SUPABASE_PROJECT_REF?.trim();
  if (explicit) return explicit;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (url) {
    const match = url.match(/^https?:\/\/([^.]+)\.supabase\.co/i);
    if (match?.[1]) return match[1];
  }

  console.error(
    "❌ No se pudo resolver el project ref. Definí SUPABASE_PROJECT_REF o NEXT_PUBLIC_SUPABASE_URL."
  );
  process.exit(1);
}

const PROJECT_REF = resolveProjectRef();
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

if (!ACCESS_TOKEN) {
  console.log("\n⚠️  Sin SUPABASE_ACCESS_TOKEN. Opciones:\n");
  console.log("  A) Obtenelo en https://supabase.com/dashboard/account/tokens");
  console.log(
    "     SUPABASE_ACCESS_TOKEN=sbp_xxx npx ts-node --skip-project scripts/migrate.ts\n"
  );
  console.log("  B) Pegá el SQL manualmente en el SQL Editor del dashboard:");
  console.log(
    `     https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new\n`
  );
  process.exit(1);
}

async function run() {
  const sqlPath = path.join(__dirname, "..", "supabase", "migrations", "001_initial.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");

  console.log(`Aplicando migración a proyecto ${PROJECT_REF}...`);

  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error("❌ Error aplicando migración:", res.status, text);
    process.exit(1);
  }

  console.log("✅ Migración aplicada exitosamente.");
}

run();

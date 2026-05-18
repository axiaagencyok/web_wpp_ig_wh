/**
 * Aplica TODAS las migraciones de supabase/migrations/*.sql al proyecto
 * Supabase, en orden lexicográfico (001_..., 002_..., ..., 011_..., etc.).
 * Usa la Management API (requiere SUPABASE_ACCESS_TOKEN).
 * Si no tenés el token, pegá los SQL directo en el SQL Editor del dashboard.
 *
 * Uso:
 *   SUPABASE_ACCESS_TOKEN=sbp_xxx npx ts-node --skip-project scripts/migrate.ts
 *   # o con tsx + un .env específico por entorno:
 *   npx tsx --env-file=.env.gpi.local scripts/migrate.ts
 *
 * El project ref se resuelve en este orden:
 *   1. process.env.SUPABASE_PROJECT_REF
 *   2. subdominio de NEXT_PUBLIC_SUPABASE_URL (https://<ref>.supabase.co)
 *
 * IMPORTANTE: las migraciones se aplican secuencialmente. Si una falla, el
 * script aborta inmediatamente — Supabase no rollbackea las anteriores, así
 * que vas a tener que arreglar el archivo problemático y volver a correr
 * (las migraciones bien escritas son idempotentes con IF NOT EXISTS).
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

async function applyOne(filename: string, sql: string): Promise<void> {
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
    console.error(`\n❌ Error aplicando ${filename}: HTTP ${res.status}`);
    console.error(text);
    process.exit(1);
  }
}

async function run() {
  const migrationsDir = path.join(__dirname, "..", "supabase", "migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // lexicográfico → 001, 002, ..., 011, ...

  if (files.length === 0) {
    console.error(`❌ No se encontraron archivos .sql en ${migrationsDir}`);
    process.exit(1);
  }

  console.log(`Aplicando ${files.length} migración(es) a proyecto ${PROJECT_REF}...\n`);

  for (const filename of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, filename), "utf8");
    console.log(`▶ Aplicando ${filename}...`);
    await applyOne(filename, sql);
    console.log(`✓ ${filename} OK`);
  }

  console.log(`\n✅ ${files.length} migración(es) aplicadas exitosamente.`);
}

run();

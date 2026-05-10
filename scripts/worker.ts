/**
 * Worker de desarrollo — llama al buffer worker cada 5 segundos.
 * Solo usar en local. En producción usá Vercel Cron (vercel.json).
 *
 * Uso:
 *   npx dotenv -e .env.local -- npx ts-node --skip-project scripts/worker.ts
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const SECRET = process.env.INTERNAL_WORKER_SECRET;
const INTERVAL_MS = 5000;

if (!SECRET) {
  console.error("❌ INTERNAL_WORKER_SECRET no definido");
  process.exit(1);
}

console.log(`[worker] Iniciando — polling cada ${INTERVAL_MS / 1000}s → ${APP_URL}`);

async function tick() {
  try {
    const res = await fetch(`${APP_URL}/api/internal/run-buffer-worker`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SECRET}` },
    });

    if (res.ok) {
      const data = await res.json() as { processed: number; failed?: number };
      if (data.processed > 0) {
        console.log(`[worker] Procesadas ${data.processed} conversaciones`);
      }
    } else {
      console.error(`[worker] HTTP ${res.status}`);
    }
  } catch (e) {
    // Servidor no levantado todavía — silencioso
    if ((e as NodeJS.ErrnoException).code !== "ECONNREFUSED") {
      console.error("[worker] Error:", (e as Error).message);
    }
  }
}

setInterval(tick, INTERVAL_MS);
tick(); // llamada inicial inmediata

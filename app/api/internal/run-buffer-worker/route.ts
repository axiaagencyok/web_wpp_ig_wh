import { NextRequest, NextResponse } from "next/server";
import { claimReadyEntries, deleteBufferEntry } from "@/lib/ai/buffer";

function isAuthorized(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const workerSecret = process.env.INTERNAL_WORKER_SECRET;
  const cronSecret = process.env.CRON_SECRET; // inyectado por Vercel en producción
  return (
    (!!workerSecret && auth === `Bearer ${workerSecret}`) ||
    (!!cronSecret && auth === `Bearer ${cronSecret}`)
  );
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const entries = await claimReadyEntries();

  if (entries.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const secret = process.env.INTERNAL_WORKER_SECRET!;

  const results = await Promise.allSettled(
    entries.map(async ({ bufferId, conversationId }) => {
      try {
        const res = await fetch(`${appUrl}/api/internal/process-message`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${secret}`,
          },
          body: JSON.stringify({ conversationId }),
        });

        if (!res.ok) {
          console.error(
            `[worker] process-message falló para conv ${conversationId}: ${res.status}`
          );
        }
      } finally {
        // Siempre borrar del buffer, incluso si el agente falla
        await deleteBufferEntry(bufferId);
      }
    })
  );

  const failed = results.filter((r) => r.status === "rejected").length;

  console.log(`[worker] Procesadas ${entries.length} entradas, ${failed} fallidas`);

  return NextResponse.json({ processed: entries.length, failed });
}

// Vercel Cron llama con GET
export async function GET(req: NextRequest) {
  return POST(req);
}

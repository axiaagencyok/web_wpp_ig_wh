import { NextRequest, NextResponse } from "next/server";
import { claimReadyEntries, deleteBufferEntry, releaseBufferEntry, requeueIfPendingMessages } from "@/lib/ai/buffer";

function isAuthorized(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const workerSecret = process.env.INTERNAL_WORKER_SECRET;
  const cronSecret = process.env.CRON_SECRET;
  return (
    (!!workerSecret && auth === `Bearer ${workerSecret}`) ||
    (!!cronSecret && auth === `Bearer ${cronSecret}`)
  );
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const entries = await claimReadyEntries(5);

  if (entries.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const secret = process.env.INTERNAL_WORKER_SECRET!;

  let processed = 0;
  let failed = 0;

  // Sequential to avoid bursting the Anthropic API with concurrent requests
  for (const { bufferId, conversationId, retryCount } of entries) {
    let success = false;
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
          `[worker] process-message failed for conv ${conversationId}: ${res.status}`
        );
      } else {
        success = true;
      }
    } catch (err) {
      console.error(
        `[worker] Unexpected error for conv ${conversationId}:`,
        (err as Error).message
      );
    }

    if (success) {
      await deleteBufferEntry(bufferId);
      await requeueIfPendingMessages(conversationId);
      processed++;
    } else {
      await releaseBufferEntry(bufferId, retryCount);
      failed++;
    }
  }

  console.log(`[worker] Processed ${processed} entries, ${failed} failed`);

  return NextResponse.json({ processed, failed });
}

// Vercel Cron calls with GET
export async function GET(req: NextRequest) {
  return POST(req);
}

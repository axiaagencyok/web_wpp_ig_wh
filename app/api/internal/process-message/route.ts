import { NextRequest, NextResponse } from "next/server";
import { processConversation } from "@/lib/ai/agent";
import { z } from "zod";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.INTERNAL_WORKER_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

const bodySchema = z.object({
  conversationId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "conversationId requerido" }, { status: 400 });
  }

  const { conversationId } = parsed.data;

  try {
    const result = await processConversation(conversationId);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[process-message] Error inesperado:", (err as Error).message);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

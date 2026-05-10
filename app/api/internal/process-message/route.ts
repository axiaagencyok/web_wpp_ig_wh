import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { processConversation } from "@/lib/ai/agent";
import { processAdminConversation } from "@/lib/ai/admin-agent";
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
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "conversationId requerido" }, { status: 400 });
  }

  const { conversationId } = parsed.data;

  try {
    // Determine if this is an admin conversation to route to the correct agent
    const { data: conv } = await adminClient
      .from("conversations")
      .select("is_admin")
      .eq("id", conversationId)
      .single();

    if (conv?.is_admin) {
      await processAdminConversation(conversationId);
      return NextResponse.json({ ok: true, agent: "admin" });
    }

    const result = await processConversation(conversationId);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[process-message] Error:", (err as Error).message);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

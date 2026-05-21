import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getMessagingProvider } from "@/lib/messaging";
import { sendInstagramMessage } from "@/lib/instagram/manychat";
import { z } from "zod";

const bodySchema = z.object({
  conversationId: z.string().uuid(),
  message: z.string().min(1).max(4096),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      console.error("[/api/messages/send] auth error:", authError.message);
      return new NextResponse("Unauthorized", { status: 401 });
    }
    if (!user) return new NextResponse("Unauthorized", { status: 401 });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", detail: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { conversationId, message } = parsed.data;

    const { data: conv, error: convError } = await supabase
      .from("conversations")
      .select("id, contact_phone, tenant_id, channel")
      .eq("id", conversationId)
      .single();

    if (convError) {
      console.error("[/api/messages/send] conversation query error:", convError.message);
      return NextResponse.json({ error: convError.message }, { status: 500 });
    }
    if (!conv) return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });

    const isInstagram = conv.channel === "instagram";

    const { data: tenant, error: tenantError } = await adminClient
      .from("tenants")
      .select("whatsapp_number, manychat_api_key")
      .eq("id", conv.tenant_id)
      .single();

    if (tenantError) {
      console.error("[/api/messages/send] tenant query error:", tenantError.message);
      return NextResponse.json({ error: tenantError.message }, { status: 500 });
    }
    if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });

    const { data: savedMsg, error: insertError } = await adminClient
      .from("messages")
      .insert({
        conversation_id: conversationId,
        tenant_id: conv.tenant_id,
        direction: "outbound",
        sender: "human",
        body: message,
        status: "queued",
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("[/api/messages/send] insert error:", insertError.message, insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    await adminClient
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId);

    if (isInstagram) {
      const subscriberId = conv.contact_phone.replace(/^instagram:/, "");
      try {
        await sendInstagramMessage(subscriberId, message, tenant.manychat_api_key);
        await adminClient
          .from("messages")
          .update({ status: "sent" })
          .eq("id", savedMsg!.id);
        return NextResponse.json({ success: true, messageId: savedMsg!.id });
      } catch (err) {
        const msg = (err as Error).message;
        console.error("[/api/messages/send] manychat send error:", msg);
        await adminClient
          .from("messages")
          .update({ status: "failed", error_message: msg })
          .eq("id", savedMsg!.id);
        return NextResponse.json({ error: msg }, { status: 502 });
      }
    }

    try {
      const messaging = getMessagingProvider();
      const { sid, status } = await messaging.send({
        from: tenant.whatsapp_number,
        to: conv.contact_phone,
        body: message,
      });

      await adminClient
        .from("messages")
        .update({ twilio_sid: sid, status: status as "sent" | "queued" })
        .eq("id", savedMsg!.id);

      return NextResponse.json({ success: true, messageId: savedMsg!.id });
    } catch (err) {
      const msg = (err as Error).message;
      console.error("[/api/messages/send] twilio send error:", msg);
      await adminClient
        .from("messages")
        .update({ status: "failed", error_message: msg })
        .eq("id", savedMsg!.id);
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/messages/send] unexpected error:", msg, err instanceof Error ? err.stack : "");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

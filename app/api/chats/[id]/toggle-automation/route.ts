import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pauseInstagramBot, resumeInstagramBot } from "@/lib/instagram/manychat";

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;

  // Leer estado actual
  const { data: conv } = await supabase
    .from("conversations")
    .select("automation_paused, channel, contact_phone")
    .eq("id", id)
    .single();

  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const newPaused = !conv.automation_paused;

  const { data, error } = await supabase
    .from("conversations")
    .update({
      automation_paused: newPaused,
      paused_reason: newPaused ? "manual" : null,
    })
    .eq("id", id)
    .select("id, automation_paused, paused_reason")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sync pause/resume state with ManyChat for Instagram conversations
  if (conv.channel === "instagram") {
    const subscriberId = conv.contact_phone.replace("instagram:", "");
    try {
      if (newPaused) {
        await pauseInstagramBot(subscriberId);
      } else {
        await resumeInstagramBot(subscriberId);
      }
    } catch (e) {
      // Non-fatal — Supabase state already updated
      console.error("[toggle-automation] ManyChat sync error:", (e as Error).message);
    }
  }

  return NextResponse.json(data);
}

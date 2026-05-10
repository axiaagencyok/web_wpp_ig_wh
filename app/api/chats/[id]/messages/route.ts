import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      console.error("[/api/chats/[id]/messages] auth error:", authError.message);
      return new NextResponse("Unauthorized", { status: 401 });
    }
    if (!user) return new NextResponse("Unauthorized", { status: 401 });

    const { id } = await params;

    const { data, error } = await supabase
      .from("messages")
      .select(
        "id, direction, sender, body, transcription, media_url, media_type, status, created_at, twilio_sid"
      )
      .eq("conversation_id", id)
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) {
      console.error("[/api/chats/[id]/messages] query error:", error.message, error);
      return NextResponse.json({ error: error.message, detail: error }, { status: 500 });
    }

    // Marcar como leída (no crítico — ignorar errores)
    adminClient
      .from("conversations")
      .update({ unread_count: 0 })
      .eq("id", id)
      .then(({ error: e }) => {
        if (e) console.error("[/api/chats/[id]/messages] unread reset error:", e.message);
      });

    return NextResponse.json(data ?? []);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/chats/[id]/messages] unexpected error:", msg, err instanceof Error ? err.stack : "");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

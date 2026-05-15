import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      console.error("[/api/chats] auth error:", authError.message);
      return new NextResponse("Unauthorized", { status: 401 });
    }
    if (!user) return new NextResponse("Unauthorized", { status: 401 });

    // Get user's tenant to resolve admin_phone
    const { data: userRow } = await supabase
      .from("users")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    const adminPhone = userRow?.tenant_id
      ? await supabase
          .from("tenants")
          .select("admin_phone")
          .eq("id", userRow.tenant_id)
          .single()
          .then(({ data }) => data?.admin_phone ?? null)
      : null;

    const { data: conversations, error: convError } = await supabase
      .from("conversations")
      .select("*")
      .order("last_message_at", { ascending: false });

    if (convError) {
      console.error("[/api/chats] conversations query error:", convError.message, convError);
      return NextResponse.json(
        { error: convError.message, detail: convError },
        { status: 500 }
      );
    }

    if (!conversations?.length) return NextResponse.json([]);

    const ids = conversations.map((c) => c.id);

    const { data: msgs, error: msgsError } = await supabase
      .from("messages")
      .select("conversation_id, body, sender, direction, created_at, media_type")
      .in("conversation_id", ids)
      .order("created_at", { ascending: false });

    if (msgsError) {
      console.error("[/api/chats] messages query error:", msgsError.message, msgsError);
      // No es fatal — devolvemos las conversaciones sin preview
    }

    type MsgRow = NonNullable<typeof msgs>[number];
    const lastMsgMap = new Map<string, MsgRow>();
    for (const m of msgs ?? []) {
      if (!lastMsgMap.has(m.conversation_id)) lastMsgMap.set(m.conversation_id, m);
    }

    const result = conversations.map((c) => ({
      ...c,
      // Re-evaluate is_admin based on current admin_phone to avoid stale data
      is_admin: adminPhone ? c.contact_phone === adminPhone : c.is_admin,
      last_message: lastMsgMap.get(c.id) ?? null,
    }));

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[/api/chats] unexpected error:", msg, stack);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

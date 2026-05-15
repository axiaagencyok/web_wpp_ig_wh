import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { resumeInstagramBot } from "@/lib/instagram/manychat";
import { z } from "zod";

const bodySchema = z.object({ subscriber_id: z.string().min(1) });

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "subscriber_id required" }, { status: 400 });

  const { subscriber_id } = parsed.data;

  try {
    await resumeInstagramBot(subscriber_id);

    await adminClient
      .from("conversations")
      .update({ automation_paused: false, paused_reason: null })
      .eq("contact_phone", `instagram:${subscriber_id}`);

    return NextResponse.json({ ok: true, status: "resumed" });
  } catch (e) {
    console.error("[resume-bot]", (e as Error).message);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

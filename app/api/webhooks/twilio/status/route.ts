import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";

async function parseFormBody(req: NextRequest): Promise<Record<string, string>> {
  const text = await req.text();
  return Object.fromEntries(new URLSearchParams(text));
}

const TWILIO_TO_DB_STATUS: Record<string, string> = {
  sent: "sent",
  delivered: "delivered",
  read: "read",
  failed: "failed",
  undelivered: "failed",
};

export async function POST(req: NextRequest) {
  const body = await parseFormBody(req);

  const messageSid = body["MessageSid"];
  const twilioStatus = body["MessageStatus"] ?? body["SmsStatus"];
  const errorCode = body["ErrorCode"];

  if (!messageSid || !twilioStatus) {
    return new NextResponse(null, { status: 204 });
  }

  const dbStatus = TWILIO_TO_DB_STATUS[twilioStatus] ?? "sent";

  await adminClient
    .from("messages")
    .update({
      status: dbStatus as "sent" | "delivered" | "read" | "failed",
      ...(errorCode ? { error_message: `Twilio error ${errorCode}` } : {}),
    })
    .eq("twilio_sid", messageSid);

  return new NextResponse(null, { status: 204 });
}

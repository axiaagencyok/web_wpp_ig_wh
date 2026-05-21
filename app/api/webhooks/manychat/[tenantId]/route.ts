import { NextRequest, NextResponse, after } from "next/server";
import { processIncoming, type ManyChatPayload } from "../route";

// Webhook ManyChat con tenantId en la URL: permite que múltiples cuentas
// de ManyChat (una por tenant con IG activo) apunten al mismo backend sin
// colisionar. Cada flow de ManyChat se configura con la URL específica de
// su tenant.
//
// URL: /api/webhooks/manychat/[tenantId]
// Ej:  /api/webhooks/manychat/2f8b1c3a-...

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await params;

  if (!UUID_RE.test(tenantId)) {
    console.warn("[ig-webhook] invalid tenantId in path:", tenantId);
    return new NextResponse("Bad Request", { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new NextResponse("Bad Request", { status: 400 });
  }

  console.log(
    `[ig-webhook] Received payload (tenant=${tenantId}):`,
    JSON.stringify(body).slice(0, 300),
  );

  after(async () => {
    try {
      await processIncoming(body as ManyChatPayload, tenantId);
    } catch (e) {
      console.error("[ig-webhook] Processing error:", (e as Error).message);
    }
  });

  return new NextResponse("OK", { status: 200 });
}

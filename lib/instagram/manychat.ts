const MANYCHAT_API_BASE = "https://api.manychat.com";

function apiKey(): string {
  const key = process.env.MANYCHAT_API_KEY;
  if (!key) throw new Error("MANYCHAT_API_KEY not set");
  return key;
}

export async function sendInstagramMessage(
  subscriberId: string,
  text: string
): Promise<void> {
  const res = await fetch(`${MANYCHAT_API_BASE}/fb/sending/sendContent`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      subscriber_id: subscriberId,
      data: {
        version: "v2",
        content: {
          type: "instagram",
          messages: [{ type: "text", text }],
        },
      },
    }),
  });

  const resBody = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`ManyChat sendContent failed ${res.status}: ${resBody}`);
  }
  console.log(`[manychat] sendContent OK for subscriber ${subscriberId}:`, resBody.slice(0, 200));
}

export async function pauseInstagramBot(subscriberId: string): Promise<void> {
  const res = await fetch(`${MANYCHAT_API_BASE}/instagram/subscriber/pause_bot`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ subscriber_id: subscriberId }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ManyChat pauseBot failed ${res.status}: ${body}`);
  }
}

export async function resumeInstagramBot(subscriberId: string): Promise<void> {
  const res = await fetch(`${MANYCHAT_API_BASE}/instagram/subscriber/resume_bot`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ subscriber_id: subscriberId }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ManyChat resumeBot failed ${res.status}: ${body}`);
  }
}

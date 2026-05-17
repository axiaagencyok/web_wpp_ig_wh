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

/**
 * Resets the story_reply custom field to false for a given subscriber.
 * Called fire-and-forget after processing a story reply so the flag is
 * consumed only once and doesn't bleed into subsequent messages.
 */
export async function clearStoryReplyFlag(subscriberId: string): Promise<void> {
  const key = process.env.MANYCHAT_API_KEY;
  if (!key) {
    console.error("[manychat] MANYCHAT_API_KEY not set — cannot clear story_reply flag");
    return;
  }

  const res = await fetch(`${MANYCHAT_API_BASE}/fb/subscriber/setCustomFieldByName`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      subscriber_id: subscriberId,
      field_name: "story_reply",
      field_value: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[manychat] clearStoryReplyFlag failed ${res.status}: ${body}`);
  } else {
    console.log(`[manychat] story_reply cleared for subscriber ${subscriberId}`);
  }
}

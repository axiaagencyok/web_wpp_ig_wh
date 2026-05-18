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

/**
 * Resets the ad_click custom field to false for a given subscriber.
 * Called fire-and-forget after processing an ad click so the flag is
 * consumed only once and doesn't bleed into subsequent messages.
 */
export async function clearAdClickFlag(subscriberId: string): Promise<void> {
  const key = process.env.MANYCHAT_API_KEY;
  if (!key) {
    console.error("[manychat] MANYCHAT_API_KEY not set — cannot clear ad_click flag");
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
      field_name: "ad_click",
      field_value: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[manychat] clearAdClickFlag failed ${res.status}: ${body}`);
  } else {
    console.log(`[manychat] ad_click cleared for subscriber ${subscriberId}`);
  }
}

/**
 * Resets post_comment to false and post_context to "-" for a given subscriber.
 * Called fire-and-forget after processing a post/reel comment so the flags are
 * consumed only once and don't bleed into subsequent messages.
 */
export async function clearPostContextFlag(subscriberId: string): Promise<void> {
  const key = process.env.MANYCHAT_API_KEY;
  if (!key) {
    console.error("[manychat] MANYCHAT_API_KEY not set — cannot clear post_comment flag");
    return;
  }

  const base = `${MANYCHAT_API_BASE}/fb/subscriber/setCustomFieldByName`;
  const headers = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };

  const [r1, r2] = await Promise.all([
    fetch(base, {
      method: "POST",
      headers,
      body: JSON.stringify({ subscriber_id: subscriberId, field_name: "post_comment", field_value: false }),
    }),
    fetch(base, {
      method: "POST",
      headers,
      body: JSON.stringify({ subscriber_id: subscriberId, field_name: "post_context", field_value: "-" }),
    }),
  ]);

  if (!r1.ok) {
    const body = await r1.text().catch(() => "");
    console.error(`[manychat] clearPostContextFlag (post_comment) failed ${r1.status}: ${body}`);
  }
  if (!r2.ok) {
    const body = await r2.text().catch(() => "");
    console.error(`[manychat] clearPostContextFlag (post_context) failed ${r2.status}: ${body}`);
  }
  if (r1.ok && r2.ok) {
    console.log(`[manychat] post_comment/post_context cleared for subscriber ${subscriberId}`);
  }
}

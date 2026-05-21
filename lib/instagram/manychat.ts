const MANYCHAT_API_BASE = "https://api.manychat.com";

// Resolver de API key: prefiere el valor pasado por el caller (de la fila
// del tenant), cae a la env var por compatibilidad con el setup de un solo
// ManyChat. Lanza si ninguno está disponible.
function resolveKey(apiKey?: string | null): string {
  const key = apiKey?.trim() || process.env.MANYCHAT_API_KEY;
  if (!key) throw new Error("MANYCHAT_API_KEY not set (tenant key missing and env var unset)");
  return key;
}

// Error tipado para que los callers distingan 404 (no-grave, ej. subscriber
// migrado al endpoint legacy) de errores graves (5xx, 401, timeout) y
// decidan si vale la pena derivar a humano.
export class ManyChatError extends Error {
  constructor(public readonly status: number, public readonly body: string, message: string) {
    super(message);
    this.name = "ManyChatError";
  }
  get isTransient(): boolean {
    return this.status >= 500 || this.status === 401 || this.status === 408 || this.status === 429;
  }
}

export async function sendInstagramMessage(
  subscriberId: string,
  text: string,
  apiKey?: string | null,
): Promise<void> {
  const res = await fetch(`${MANYCHAT_API_BASE}/fb/sending/sendContent`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resolveKey(apiKey)}`,
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

export async function pauseInstagramBot(subscriberId: string, apiKey?: string | null): Promise<void> {
  const res = await fetch(`${MANYCHAT_API_BASE}/instagram/subscriber/pause_bot`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resolveKey(apiKey)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ subscriber_id: subscriberId }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ManyChatError(res.status, body, `ManyChat pauseBot failed ${res.status}: ${body}`);
  }
}

export async function resumeInstagramBot(subscriberId: string, apiKey?: string | null): Promise<void> {
  const res = await fetch(`${MANYCHAT_API_BASE}/instagram/subscriber/resume_bot`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resolveKey(apiKey)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ subscriber_id: subscriberId }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ManyChatError(res.status, body, `ManyChat resumeBot failed ${res.status}: ${body}`);
  }
}

/**
 * Resets the story_reply custom field to false for a given subscriber.
 * Called fire-and-forget after processing a story reply so the flag is
 * consumed only once and doesn't bleed into subsequent messages.
 */
export async function clearStoryReplyFlag(subscriberId: string, apiKey?: string | null): Promise<void> {
  let key: string;
  try {
    key = resolveKey(apiKey);
  } catch {
    console.error("[manychat] no API key — cannot clear story_reply flag");
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
export async function clearAdClickFlag(subscriberId: string, apiKey?: string | null): Promise<void> {
  let key: string;
  try {
    key = resolveKey(apiKey);
  } catch {
    console.error("[manychat] no API key — cannot clear ad_click flag");
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
 * Resets the `contexto_comentario` custom field to "-" for a given subscriber.
 *
 * A diferencia de los otros clear*Flag (story / ad / post_comment), este se
 * llama SIEMPRE — no solo cuando había contexto. Replica el nodo
 * "HTTP Request2" del workflow viejo de n8n ("Leads Qualifier" /
 * iY8lXquuEE7F6HuI) que se disparaba en cada mensaje entrante, garantizando
 * que el custom_field queda en "-" después de cada turno y no contamina la
 * próxima conversación.
 *
 * `contexto_comentario` NO es una columna de nuestra DB: vive como
 * custom_field del subscriber EN MANYCHAT. Por eso borrar conversations en
 * Supabase NO lo limpia — sólo la API de ManyChat puede.
 *
 * Ver docs/MANYCHAT-CONTEXT-CLEANUP.md para el racional completo.
 */
export async function clearContextoComentarioFlag(
  subscriberId: string,
  apiKey?: string | null,
): Promise<void> {
  let key: string;
  try {
    key = resolveKey(apiKey);
  } catch {
    console.error(
      `[manychat-cleanup] no API key — cannot clear contexto_comentario for subscriber ${subscriberId}`,
    );
    return;
  }

  console.log(`[manychat-cleanup] start subscriber=${subscriberId}`);

  const res = await fetch(`${MANYCHAT_API_BASE}/fb/subscriber/setCustomFieldByName`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      subscriber_id: subscriberId,
      field_name: "contexto_comentario",
      field_value: "-",
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(
      `[manychat-cleanup] error subscriber=${subscriberId} status=${res.status} body=${body.slice(0, 200)}`,
    );
    return;
  }
  console.log(`[manychat-cleanup] ok subscriber=${subscriberId}`);
}

/**
 * Resets post_comment to false and post_context to "-" for a given subscriber.
 * Called fire-and-forget after processing a post/reel comment so the flags are
 * consumed only once and don't bleed into subsequent messages.
 */
export async function clearPostContextFlag(subscriberId: string, apiKey?: string | null): Promise<void> {
  let key: string;
  try {
    key = resolveKey(apiKey);
  } catch {
    console.error("[manychat] no API key — cannot clear post_comment flag");
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

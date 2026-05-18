import type { Tenant } from "@/types/database.types";

/**
 * Devuelve el system prompt del agente de WhatsApp para el tenant dado.
 *
 * El prompt vive en `tenants.agent_system_prompt`. Si falta o está vacío,
 * lanzamos error explícito — no hay fallback hardcoded para evitar que un
 * deployment quede usando el prompt de otro cliente por accidente.
 */
export function getLucasSystemPrompt(tenant: Pick<Tenant, "id" | "agent_system_prompt">): string {
  const prompt = tenant.agent_system_prompt?.trim();
  if (!prompt) {
    throw new Error(
      `Tenant ${tenant.id} no tiene agent_system_prompt configurado en DB.`
    );
  }
  return prompt;
}

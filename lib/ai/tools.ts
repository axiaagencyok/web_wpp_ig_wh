import type Anthropic from "@anthropic-ai/sdk";

// `get_catalog` quedó deprecada en la migración 023: el catálogo se inyecta
// como prefijo del system prompt directamente desde compose-prompt. Mati ya
// no necesita una tool para consultarlo. Mantenemos sólo `derive_to_human`.
export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "derive_to_human",
    description:
      "Llamá esta tool cuando necesites derivar la conversación a un humano. " +
      "Casos: el cliente quiere cerrar una compra, hay un reclamo, pregunta algo que no podés responder, " +
      "está molesto, o la conversación se complica. " +
      "Después de llamar esta tool, respondé al cliente avisándole que lo derivás.",
    input_schema: {
      type: "object" as const,
      properties: {
        reason: {
          type: "string",
          description: "Por qué derivás (para el log interno)",
        },
      },
      required: ["reason"],
    },
  },
];

export type ToolName = "derive_to_human";

export interface DeriveToHumanInput {
  reason: string;
}

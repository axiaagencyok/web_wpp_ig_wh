import type Anthropic from "@anthropic-ai/sdk";

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "get_catalog",
    description:
      "Catálogo de productos del negocio con precios actualizados en tiempo real. " +
      "Llamá esta tool SIEMPRE antes de responder sobre productos, precios o disponibilidad " +
      "— nunca respondas de memoria.\n\n" +
      "USO DEL PARÁMETRO category:\n" +
      "- Si el cliente pregunta por una categoría específica (celulares, lavarropas, TV, etc.), " +
      "pasá el término de búsqueda en `category` para obtener solo esos productos.\n" +
      "- Si la consulta es general o no sabés la categoría, no incluyas `category` " +
      "y recibirás el catálogo completo.\n" +
      "- Ejemplos: category='celular', category='lavarropas', category='TV', category='heladera'.",
    input_schema: {
      type: "object" as const,
      properties: {
        category: {
          type: "string",
          description:
            "Filtro opcional de categoría (substring, case-insensitive). " +
            "Ej: 'celular', 'lavarropas', 'TV', 'heladera', 'freezer'.",
        },
      },
      required: [],
    },
  },
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

export type ToolName = "get_catalog" | "derive_to_human";

export interface GetCatalogInput {
  category?: string;
}

export interface DeriveToHumanInput {
  reason: string;
}

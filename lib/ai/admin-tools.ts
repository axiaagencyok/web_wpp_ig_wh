import Anthropic from "@anthropic-ai/sdk";

export const ADMIN_TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "get_contacts_report",
    description: "Devuelve la lista de contactos del tenant con su último mensaje, fecha, tags y notas. Filtra por período y/o tags.",
    input_schema: {
      type: "object" as const,
      properties: {
        period: {
          type: "string",
          enum: ["24h", "7d", "30d", "all"],
          description: "Período de actividad reciente. Default: 7d",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Filtrar solo contactos con estos tags.",
        },
        limit: {
          type: "number",
          description: "Máximo de resultados. Default: 20.",
        },
      },
    },
  },
  {
    name: "get_messages_report",
    description: "Devuelve mensajes en una ventana de tiempo, opcionalmente filtrado por contacto.",
    input_schema: {
      type: "object" as const,
      properties: {
        period: {
          type: "string",
          enum: ["24h", "7d", "30d"],
          description: "Período a consultar.",
        },
        contact_phone: {
          type: "string",
          description: "Filtrar por número de contacto (formato whatsapp:+549...).",
        },
      },
      required: ["period"],
    },
  },
  {
    name: "get_stats",
    description: "Estadísticas del período: mensajes totales, % automatizados vs manuales, derivaciones, tokens consumidos, contactos únicos.",
    input_schema: {
      type: "object" as const,
      properties: {
        period: {
          type: "string",
          enum: ["24h", "7d", "30d"],
          description: "Período de estadísticas.",
        },
      },
      required: ["period"],
    },
  },
  {
    name: "update_catalog_price",
    description: "Actualiza el valor de una columna en la fila del catálogo que matchea row_match. REQUIERE confirmación del gerente antes de ejecutar (usa confirmed: true en la segunda llamada).",
    input_schema: {
      type: "object" as const,
      properties: {
        row_match: {
          type: "string",
          description: "Texto para identificar la fila del producto (ej: 'iPhone 14').",
        },
        column: {
          type: "string",
          description: "Nombre exacto de la columna a editar (ej: 'Precio Efectivo').",
        },
        new_value: {
          type: "string",
          description: "Nuevo valor a escribir.",
        },
        confirmed: {
          type: "boolean",
          description: "Debe ser true para ejecutar. Si es false/ausente, solo devuelve preview.",
        },
      },
      required: ["row_match", "column", "new_value"],
    },
  },
  {
    name: "add_catalog_item",
    description: "Agrega una fila nueva al catálogo en Google Sheets. REQUIERE confirmación.",
    input_schema: {
      type: "object" as const,
      properties: {
        row_data: {
          type: "object",
          description: "Objeto con los valores de cada columna. Las claves deben coincidir con los nombres de columna del Sheet.",
          additionalProperties: { type: "string" },
        },
        confirmed: {
          type: "boolean",
          description: "Debe ser true para ejecutar.",
        },
      },
      required: ["row_data"],
    },
  },
  {
    name: "delete_catalog_item",
    description: "Elimina (limpia el contenido de) la fila del catálogo que matchea row_match. REQUIERE confirmación.",
    input_schema: {
      type: "object" as const,
      properties: {
        row_match: {
          type: "string",
          description: "Texto para identificar la fila a eliminar.",
        },
        confirmed: {
          type: "boolean",
          description: "Debe ser true para ejecutar.",
        },
      },
      required: ["row_match"],
    },
  },
  {
    name: "send_message_to_contact",
    description: "Manda un mensaje de WhatsApp a un contacto. REQUIERE confirmación.",
    input_schema: {
      type: "object" as const,
      properties: {
        contact_phone: {
          type: "string",
          description: "Número del contacto (formato whatsapp:+549...).",
        },
        message: {
          type: "string",
          description: "Texto del mensaje a enviar.",
        },
        confirmed: {
          type: "boolean",
          description: "Debe ser true para ejecutar.",
        },
      },
      required: ["contact_phone", "message"],
    },
  },
  {
    name: "pause_conversation_automation",
    description: "Pausa o reanuda la IA para un chat específico.",
    input_schema: {
      type: "object" as const,
      properties: {
        contact_phone: {
          type: "string",
          description: "Número del contacto (formato whatsapp:+549...).",
        },
        paused: {
          type: "boolean",
          description: "true = pausar IA, false = reanudar.",
        },
      },
      required: ["contact_phone", "paused"],
    },
  },
  {
    name: "update_contact_info",
    description: "Actualiza la información CRM de un contacto (nombre, email, notas, tags).",
    input_schema: {
      type: "object" as const,
      properties: {
        contact_phone: {
          type: "string",
          description: "Número del contacto (formato whatsapp:+549...).",
        },
        fields: {
          type: "object",
          properties: {
            name:  { type: "string" },
            email: { type: "string" },
            notes: { type: "string" },
            tags:  { type: "array", items: { type: "string" } },
          },
          description: "Campos a actualizar.",
        },
      },
      required: ["contact_phone", "fields"],
    },
  },
];

// ── Input types ───────────────────────────────────────────────────────────────

export interface GetContactsReportInput {
  period?: "24h" | "7d" | "30d" | "all";
  tags?: string[];
  limit?: number;
}

export interface GetMessagesReportInput {
  period: "24h" | "7d" | "30d";
  contact_phone?: string;
}

export interface GetStatsInput {
  period: "24h" | "7d" | "30d";
}

export interface UpdateCatalogPriceInput {
  row_match: string;
  column: string;
  new_value: string;
  confirmed?: boolean;
}

export interface AddCatalogItemInput {
  row_data: Record<string, string>;
  confirmed?: boolean;
}

export interface DeleteCatalogItemInput {
  row_match: string;
  confirmed?: boolean;
}

export interface SendMessageToContactInput {
  contact_phone: string;
  message: string;
  confirmed?: boolean;
}

export interface PauseConversationInput {
  contact_phone: string;
  paused: boolean;
}

export interface UpdateContactInfoInput {
  contact_phone: string;
  fields: {
    name?: string;
    email?: string;
    notes?: string;
    tags?: string[];
  };
}

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string
          name: string
          whatsapp_number: string
          twilio_account_sid: string | null
          twilio_auth_token_encrypted: string | null
          google_sheet_id: string | null
          google_sheet_range: string
          agent_system_prompt: string
          agent_enabled: boolean
          buffer_seconds: number
          admin_phone: string | null
          admin_system_prompt: string | null
          ig_agent_system_prompt: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          whatsapp_number: string
          twilio_account_sid?: string | null
          twilio_auth_token_encrypted?: string | null
          google_sheet_id?: string | null
          google_sheet_range?: string
          agent_system_prompt: string
          agent_enabled?: boolean
          buffer_seconds?: number
          admin_phone?: string | null
          admin_system_prompt?: string | null
          ig_agent_system_prompt?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          whatsapp_number?: string
          twilio_account_sid?: string | null
          twilio_auth_token_encrypted?: string | null
          google_sheet_id?: string | null
          google_sheet_range?: string
          agent_system_prompt?: string
          agent_enabled?: boolean
          buffer_seconds?: number
          admin_phone?: string | null
          admin_system_prompt?: string | null
          ig_agent_system_prompt?: string | null
          created_at?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          id: string
          tenant_id: string
          role: 'owner' | 'agent'
          created_at: string
        }
        Insert: {
          id: string
          tenant_id: string
          role?: 'owner' | 'agent'
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          role?: 'owner' | 'agent'
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          }
        ]
      }
      conversations: {
        Row: {
          id: string
          tenant_id: string
          contact_phone: string
          contact_name: string | null
          contact_email: string | null
          notes: string | null
          tags: string[]
          custom_fields: Json
          is_admin: boolean
          pending_action: Json | null
          automation_paused: boolean
          paused_reason: 'manual' | 'derived_to_human' | 'error' | null
          deal_status: 'nuevo' | 'contactado' | 'esperando_pago' | 'pago_pendiente' | 'cerrado'
          channel: 'whatsapp' | 'instagram'
          last_message_at: string
          unread_count: number
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          contact_phone: string
          contact_name?: string | null
          contact_email?: string | null
          notes?: string | null
          tags?: string[]
          custom_fields?: Json
          is_admin?: boolean
          pending_action?: Json | null
          automation_paused?: boolean
          paused_reason?: 'manual' | 'derived_to_human' | 'error' | null
          deal_status?: 'nuevo' | 'contactado' | 'esperando_pago' | 'pago_pendiente' | 'cerrado'
          channel?: 'whatsapp' | 'instagram'
          last_message_at?: string
          unread_count?: number
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          contact_phone?: string
          contact_name?: string | null
          contact_email?: string | null
          notes?: string | null
          tags?: string[]
          custom_fields?: Json
          is_admin?: boolean
          pending_action?: Json | null
          automation_paused?: boolean
          paused_reason?: 'manual' | 'derived_to_human' | 'error' | null
          deal_status?: 'nuevo' | 'contactado' | 'esperando_pago' | 'pago_pendiente' | 'cerrado'
          channel?: 'whatsapp' | 'instagram'
          last_message_at?: string
          unread_count?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          }
        ]
      }
      messages: {
        Row: {
          id: string
          conversation_id: string
          tenant_id: string
          direction: 'inbound' | 'outbound'
          sender: 'contact' | 'ai' | 'human'
          body: string | null
          transcription: string | null
          media_url: string | null
          media_type: string | null
          twilio_sid: string | null
          status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed'
          error_message: string | null
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          tenant_id: string
          direction: 'inbound' | 'outbound'
          sender: 'contact' | 'ai' | 'human'
          body?: string | null
          transcription?: string | null
          media_url?: string | null
          media_type?: string | null
          twilio_sid?: string | null
          status?: 'queued' | 'sent' | 'delivered' | 'read' | 'failed'
          error_message?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          tenant_id?: string
          direction?: 'inbound' | 'outbound'
          sender?: 'contact' | 'ai' | 'human'
          body?: string | null
          transcription?: string | null
          media_url?: string | null
          media_type?: string | null
          twilio_sid?: string | null
          status?: 'queued' | 'sent' | 'delivered' | 'read' | 'failed'
          error_message?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          }
        ]
      }
      message_buffer: {
        Row: {
          id: string
          conversation_id: string
          process_after: string
          processing: boolean
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          process_after: string
          processing?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          process_after?: string
          processing?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_buffer_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          }
        ]
      }
      ai_logs: {
        Row: {
          id: string
          tenant_id: string
          conversation_id: string | null
          message_id: string | null
          prompt_tokens: number | null
          completion_tokens: number | null
          model: string | null
          latency_ms: number | null
          tool_calls: Json | null
          raw_request: Json | null
          raw_response: Json | null
          is_admin_action: boolean
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          conversation_id?: string | null
          message_id?: string | null
          prompt_tokens?: number | null
          completion_tokens?: number | null
          model?: string | null
          latency_ms?: number | null
          tool_calls?: Json | null
          raw_request?: Json | null
          raw_response?: Json | null
          is_admin_action?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          conversation_id?: string | null
          message_id?: string | null
          prompt_tokens?: number | null
          completion_tokens?: number | null
          model?: string | null
          latency_ms?: number | null
          tool_calls?: Json | null
          raw_request?: Json | null
          raw_response?: Json | null
          is_admin_action?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auth_tenant_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type Tenant = Database['public']['Tables']['tenants']['Row']
export type User = Database['public']['Tables']['users']['Row']
export type Conversation = Database['public']['Tables']['conversations']['Row']
export type Message = Database['public']['Tables']['messages']['Row']
export type MessageBuffer = Database['public']['Tables']['message_buffer']['Row']
export type AiLog = Database['public']['Tables']['ai_logs']['Row']

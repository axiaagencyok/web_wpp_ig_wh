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
          stories_context_general: string | null
          stories_context_keywords: string | null
          ads_context_general: string | null
          ads_context_keywords: string | null
          catalog_source: Database['public']['Enums']['catalog_source_type']
          catalog_pdf_path: string | null
          catalog_text_cache: string | null
          catalog_text_cached_at: string | null
          lead_notification_email: string | null
          lead_scoring_prompt: string | null
          lead_reset_after_days: number | null
          meli_agent_system_prompt: string | null
          meli_auto_answer: boolean
          meli_enabled: boolean
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
          stories_context_general?: string | null
          stories_context_keywords?: string | null
          ads_context_general?: string | null
          ads_context_keywords?: string | null
          catalog_source?: Database['public']['Enums']['catalog_source_type']
          catalog_pdf_path?: string | null
          catalog_text_cache?: string | null
          catalog_text_cached_at?: string | null
          lead_notification_email?: string | null
          lead_scoring_prompt?: string | null
          lead_reset_after_days?: number | null
          meli_agent_system_prompt?: string | null
          meli_auto_answer?: boolean
          meli_enabled?: boolean
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
          stories_context_general?: string | null
          stories_context_keywords?: string | null
          ads_context_general?: string | null
          ads_context_keywords?: string | null
          catalog_source?: Database['public']['Enums']['catalog_source_type']
          catalog_pdf_path?: string | null
          catalog_text_cache?: string | null
          catalog_text_cached_at?: string | null
          lead_notification_email?: string | null
          lead_scoring_prompt?: string | null
          lead_reset_after_days?: number | null
          meli_agent_system_prompt?: string | null
          meli_auto_answer?: boolean
          meli_enabled?: boolean
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
          last_context_trigger_at: string | null
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
          last_context_trigger_at?: string | null
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
          last_context_trigger_at?: string | null
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
      Leads: {
        Row: {
          id: number
          tenant_id: string
          conversation_id: string | null
          manychat_id: string | null
          instagram_user: string | null
          nombre: string | null
          zona: string | null
          tipo_proyecto: 'Obra nueva' | 'Refacción' | 'Comercial' | 'Otro' | null
          m2_estimados: number | null
          producto_interes: string | null
          urgencia: 'Inmediata' | '1-3 meses' | '+3 meses' | null
          lead_score: number | null
          resumen_conversacion: string | null
          estado: 'Nuevo' | 'Contactado' | 'Cerrado' | 'Descartado'
          notas: string | null
          es_recurrente: boolean
          compras_anteriores: number
          notificado_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          tenant_id: string
          conversation_id?: string | null
          manychat_id?: string | null
          instagram_user?: string | null
          nombre?: string | null
          zona?: string | null
          tipo_proyecto?: 'Obra nueva' | 'Refacción' | 'Comercial' | 'Otro' | null
          m2_estimados?: number | null
          producto_interes?: string | null
          urgencia?: 'Inmediata' | '1-3 meses' | '+3 meses' | null
          lead_score?: number | null
          resumen_conversacion?: string | null
          estado?: 'Nuevo' | 'Contactado' | 'Cerrado' | 'Descartado'
          notas?: string | null
          es_recurrente?: boolean
          compras_anteriores?: number
          notificado_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          tenant_id?: string
          conversation_id?: string | null
          manychat_id?: string | null
          instagram_user?: string | null
          nombre?: string | null
          zona?: string | null
          tipo_proyecto?: 'Obra nueva' | 'Refacción' | 'Comercial' | 'Otro' | null
          m2_estimados?: number | null
          producto_interes?: string | null
          urgencia?: 'Inmediata' | '1-3 meses' | '+3 meses' | null
          lead_score?: number | null
          resumen_conversacion?: string | null
          estado?: 'Nuevo' | 'Contactado' | 'Cerrado' | 'Descartado'
          notas?: string | null
          es_recurrente?: boolean
          compras_anteriores?: number
          notificado_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "Leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Leads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          }
        ]
      }
      meli_accounts: {
        Row: {
          id: string
          tenant_id: string
          meli_user_id: number
          meli_nickname: string | null
          access_token: string
          refresh_token: string
          expires_at: string
          scope: string | null
          status: 'connected' | 'needs_reauth'
          connected_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          meli_user_id: number
          meli_nickname?: string | null
          access_token: string
          refresh_token: string
          expires_at: string
          scope?: string | null
          status?: 'connected' | 'needs_reauth'
          connected_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          meli_user_id?: number
          meli_nickname?: string | null
          access_token?: string
          refresh_token?: string
          expires_at?: string
          scope?: string | null
          status?: 'connected' | 'needs_reauth'
          connected_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meli_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          }
        ]
      }
      meli_questions: {
        Row: {
          id: number
          tenant_id: string
          meli_account_id: string | null
          meli_question_id: number
          item_id: string
          item_title: string | null
          item_price: number | null
          item_thumbnail: string | null
          text: string
          from_user_id: number | null
          from_user_nickname: string | null
          status: 'pending' | 'answered' | 'deleted'
          ai_suggested_answer: string | null
          sent_answer: string | null
          answered_at: string | null
          sent_by: 'ai' | 'human' | null
          date_created: string
          received_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          tenant_id: string
          meli_account_id?: string | null
          meli_question_id: number
          item_id: string
          item_title?: string | null
          item_price?: number | null
          item_thumbnail?: string | null
          text: string
          from_user_id?: number | null
          from_user_nickname?: string | null
          status?: 'pending' | 'answered' | 'deleted'
          ai_suggested_answer?: string | null
          sent_answer?: string | null
          answered_at?: string | null
          sent_by?: 'ai' | 'human' | null
          date_created: string
          received_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          tenant_id?: string
          meli_account_id?: string | null
          meli_question_id?: number
          item_id?: string
          item_title?: string | null
          item_price?: number | null
          item_thumbnail?: string | null
          text?: string
          from_user_id?: number | null
          from_user_nickname?: string | null
          status?: 'pending' | 'answered' | 'deleted'
          ai_suggested_answer?: string | null
          sent_answer?: string | null
          answered_at?: string | null
          sent_by?: 'ai' | 'human' | null
          date_created?: string
          received_at?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meli_questions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meli_questions_meli_account_id_fkey"
            columns: ["meli_account_id"]
            isOneToOne: false
            referencedRelation: "meli_accounts"
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
      catalog_source_type: 'sheets' | 'pdf'
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
export type Lead = Database['public']['Tables']['Leads']['Row']
export type LeadInsert = Database['public']['Tables']['Leads']['Insert']
export type MeliAccount = Database['public']['Tables']['meli_accounts']['Row']
export type MeliAccountInsert = Database['public']['Tables']['meli_accounts']['Insert']
export type MeliQuestion = Database['public']['Tables']['meli_questions']['Row']
export type MeliQuestionInsert = Database['public']['Tables']['meli_questions']['Insert']

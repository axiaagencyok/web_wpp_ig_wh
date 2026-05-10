-- ─────────────────────────────────────────────────────────────────────────────
-- 001_initial.sql  –  Schema base del sistema WhatsApp AI Agent
-- ─────────────────────────────────────────────────────────────────────────────

-- Cliente final de la agencia (dueño del negocio)
create table if not exists tenants (
  id                          uuid primary key default gen_random_uuid(),
  name                        text not null,
  whatsapp_number             text not null unique,
  twilio_account_sid          text,
  twilio_auth_token_encrypted text,
  google_sheet_id             text,
  google_sheet_range          text not null default 'A1:Z1000',
  agent_system_prompt         text not null,
  agent_enabled               boolean not null default true,
  buffer_seconds              int not null default 8,
  created_at                  timestamptz not null default now()
);

-- Usuarios del panel (vinculados a auth.users de Supabase)
create table if not exists users (
  id         uuid primary key references auth.users on delete cascade,
  tenant_id  uuid not null references tenants on delete cascade,
  role       text not null default 'owner' check (role in ('owner', 'agent')),
  created_at timestamptz not null default now()
);

-- Conversaciones (una por número de contacto dentro de cada tenant)
create table if not exists conversations (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants on delete cascade,
  contact_phone     text not null,
  contact_name      text,
  automation_paused boolean not null default false,
  paused_reason     text check (paused_reason in ('manual', 'derived_to_human', 'error')),
  last_message_at   timestamptz not null default now(),
  unread_count      int not null default 0,
  created_at        timestamptz not null default now(),
  unique (tenant_id, contact_phone)
);

create index if not exists conversations_tenant_last_message_idx
  on conversations (tenant_id, last_message_at desc);

-- Mensajes
create table if not exists messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations on delete cascade,
  tenant_id       uuid not null references tenants,
  direction       text not null check (direction in ('inbound', 'outbound')),
  sender          text not null check (sender in ('contact', 'ai', 'human')),
  body            text,
  transcription   text,
  media_url       text,
  media_type      text,
  twilio_sid      text,
  status          text not null default 'sent'
                    check (status in ('queued', 'sent', 'delivered', 'read', 'failed')),
  error_message   text,
  created_at      timestamptz not null default now()
);

create index if not exists messages_conversation_created_idx
  on messages (conversation_id, created_at);

-- Buffer de mensajes pendientes (debounce antes de llamar al agente)
create table if not exists message_buffer (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations on delete cascade,
  process_after   timestamptz not null,
  processing      boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists message_buffer_process_after_idx
  on message_buffer (process_after)
  where processing = false;

-- Logs de IA (tokens, latencia, tool calls)
create table if not exists ai_logs (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants,
  conversation_id uuid references conversations,
  message_id      uuid references messages,
  prompt_tokens   int,
  completion_tokens int,
  model           text,
  latency_ms      int,
  tool_calls      jsonb,
  raw_request     jsonb,
  raw_response    jsonb,
  created_at      timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS (Row Level Security)
-- ─────────────────────────────────────────────────────────────────────────────

alter table tenants          enable row level security;
alter table users            enable row level security;
alter table conversations    enable row level security;
alter table messages         enable row level security;
alter table message_buffer   enable row level security;
alter table ai_logs          enable row level security;

-- Helper: tenant_id del usuario autenticado
create or replace function auth_tenant_id()
returns uuid
language sql stable
as $$
  select tenant_id from users where id = auth.uid()
$$;

-- tenants: el usuario solo ve su propio tenant
create policy "tenant_select" on tenants
  for select using (id = auth_tenant_id());

-- users: solo los del mismo tenant
create policy "users_select" on users
  for select using (tenant_id = auth_tenant_id());

-- conversations: solo las del tenant
create policy "conversations_select" on conversations
  for select using (tenant_id = auth_tenant_id());

create policy "conversations_update" on conversations
  for update using (tenant_id = auth_tenant_id());

-- messages: solo los del tenant
create policy "messages_select" on messages
  for select using (tenant_id = auth_tenant_id());

create policy "messages_insert" on messages
  for insert with check (tenant_id = auth_tenant_id());

-- message_buffer: solo el service role accede (sin política anon)
-- (el webhook y el worker usan service role que bypasa RLS)

-- ai_logs: solo el tenant propio
create policy "ai_logs_select" on ai_logs
  for select using (tenant_id = auth_tenant_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- Realtime: habilitar para el panel
-- ─────────────────────────────────────────────────────────────────────────────

alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table conversations;

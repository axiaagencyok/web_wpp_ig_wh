-- ─────────────────────────────────────────────────────────────────────────────
-- 002_fix_rls_recursion.sql
-- Corrige recursión infinita en RLS (Postgres 54001 stack depth limit).
--
-- Causa: auth_tenant_id() sin SECURITY DEFINER consultaba users con RLS activo,
-- que a su vez volvía a llamar auth_tenant_id() → loop infinito.
-- Fix: SECURITY DEFINER + SET search_path = public hace que la función corra
-- con privilegios del owner (bypasea RLS al leer users) rompiendo el ciclo.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Eliminar todas las policies existentes
DROP POLICY IF EXISTS "tenant_select"         ON tenants;
DROP POLICY IF EXISTS "users_select"          ON users;
DROP POLICY IF EXISTS "conversations_select"  ON conversations;
DROP POLICY IF EXISTS "conversations_update"  ON conversations;
DROP POLICY IF EXISTS "messages_select"       ON messages;
DROP POLICY IF EXISTS "messages_insert"       ON messages;
DROP POLICY IF EXISTS "ai_logs_select"        ON ai_logs;

-- 2. Recrear auth_tenant_id() con SECURITY DEFINER
--    Corre con privilegios del owner → no aplica RLS al leer users → sin recursión.
CREATE OR REPLACE FUNCTION auth_tenant_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT tenant_id FROM public.users WHERE id = auth.uid();
$$;

-- 3. tenants: el usuario solo ve su propio tenant
CREATE POLICY "tenant_isolation" ON tenants
  FOR ALL USING (id = auth_tenant_id());

-- 4. users: self only — sin referenciar otras tablas ni llamar auth_tenant_id()
CREATE POLICY "users_self" ON users
  FOR SELECT USING (id = auth.uid());

-- 5. conversations: aislamiento por tenant
CREATE POLICY "tenant_isolation" ON conversations
  FOR ALL USING (tenant_id = auth_tenant_id());

-- 6. messages: aislamiento por tenant
CREATE POLICY "tenant_isolation" ON messages
  FOR ALL USING (tenant_id = auth_tenant_id());

-- 7. ai_logs: aislamiento por tenant
CREATE POLICY "tenant_isolation" ON ai_logs
  FOR ALL USING (tenant_id = auth_tenant_id());

-- message_buffer no tiene policy — solo service role lo accede (bypasa RLS).

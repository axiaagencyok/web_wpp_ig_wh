// Setup global de Vitest — corre antes de cargar cualquier test.
// Inyecta env vars fake para que los módulos que validan en init
// (lib/supabase/*, lib/messaging/twilio-provider, etc.) no tiren.
// Los tests que necesitan comportamiento real de la DB usan el mock
// definido en tests/helpers/supabase-mock.ts.

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://ci.test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "eyJ.test.anon";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "eyJ.test.service";
process.env.ANTHROPIC_API_KEY ??= "sk-ant-test";
process.env.OPENAI_API_KEY ??= "sk-test-openai";
process.env.TWILIO_ACCOUNT_SID ??= "AC00000000000000000000000000000000";
process.env.TWILIO_AUTH_TOKEN ??= "test-twilio-token";
process.env.TWILIO_SKIP_VALIDATION ??= "true";
process.env.MANYCHAT_API_KEY ??= "test-manychat-key";
process.env.INTERNAL_WORKER_SECRET ??= "test-worker-secret";
process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ??= "ci@test.iam.gserviceaccount.com";
process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ??=
  "-----BEGIN PRIVATE KEY-----\\nTEST\\n-----END PRIVATE KEY-----";
process.env.RESEND_API_KEY ??= "re_test_dummy";
process.env.SUPERVISOR_EMAIL ??= "test@example.com";
process.env.INSTAGRAM_TENANT_ID ??= "00000000-0000-0000-0000-000000000001";

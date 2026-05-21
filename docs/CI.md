# CI & Branch Protection

Cómo funciona el CI de Fenoma y qué hay que configurar después de mergear este PR.

## Qué corre el CI

Dos workflows en `.github/workflows/`:

### `ci.yml` — gate de PRs

Se dispara en cada `pull_request` y `push` a `feature/crm-admin` (default branch) y `main`. Bloqueante para merge cuando branch protection está configurado contra el check **`validate`**.

Pasos en orden:

1. `npm ci` (cache de `package-lock.json`)
2. `npm run typecheck` → `tsc --noEmit`
3. `npm run test:run` → `vitest run` (tests en `tests/`)
4. `npm run build` → `next build` con heap de 4 GB

Si cualquiera falla, el check sale rojo → el PR no se puede mergear.

### `post-deploy-smoke.yml` — health check post-deploy

Se dispara en push a la default branch. Vercel auto-deploya desde ahí; el workflow espera 3 min para darle tiempo al deploy y después:

1. `curl https://${PROD_DOMAIN}/api/health` → debe ser 200.
2. Si NO es 200: ejecuta `npx vercel rollback --yes` y manda mail a `fran@fenoma.agency` via Resend.
3. Si es 200: success.

Se puede pausar a mano con repository variable `SMOKE_DISABLED=true`.

## Setup obligatorio antes de mergear

### Secrets en GitHub → Settings → Secrets and variables → Actions

| Secret | Origen | Para qué |
|---|---|---|
| `CI_SUPABASE_URL` | proyecto Supabase `fenoma-ci` (creá uno free tier) | tests + build pueden inicializar el cliente; CI corre contra esta DB aislada de WHD/GPI |
| `CI_SUPABASE_ANON_KEY` | mismo proyecto, settings → API | mismo motivo |
| `CI_SUPABASE_SERVICE_ROLE_KEY` | mismo proyecto, settings → API | mismo motivo, para el adminClient |
| `PROD_DOMAIN` | ej. `panel.fenoma.agency` | dominio público para el health check (sin `https://`) |
| `VERCEL_TOKEN` | Vercel → Account Settings → Tokens, crear uno con scope del team | rollback automático |
| `VERCEL_ORG_ID` | Vercel → Settings → General → Team ID | rollback |
| `VERCEL_PROJECT_ID` | Vercel → Project Settings → General → Project ID | rollback |
| `RESEND_API_KEY_PROD` | Resend → API Keys (puede ser la misma que ya usás para leads) | mail de notificación |

> Si alguno de estos secrets falta, el workflow no rompe en seco — emite un `::warning::` y saltea ese paso. Eso permite mergear el CI sin todos los secrets configurados y completar la lista incremental.

### Aplicar el schema completo a `fenoma-ci`

Una sola vez:

```bash
# desde la rama de este PR, dentro de agentewpp/:
psql "${CI_SUPABASE_DB_URL}" -f supabase/migrations/001_initial.sql
psql "${CI_SUPABASE_DB_URL}" -f supabase/migrations/002_fix_rls_recursion.sql
# … todas las migraciones en orden hasta 019.
```

O usar el script de sincronización idempotente que vive en
`scripts/whd_sync_tenants_columns.sql` para las columnas de `tenants`.

## Branch protection

Después de mergear este PR (para que el check `validate` aparezca en GitHub como existente), correr:

```bash
# Default branch — actualmente feature/crm-admin
gh api -X PUT \
  -H "Accept: application/vnd.github+json" \
  repos/axiaagencyok/web_wpp_ig_wh/branches/feature/crm-admin/protection \
  -f required_status_checks[strict]=true \
  -f required_status_checks[contexts][]='validate' \
  -f enforce_admins=false \
  -f required_pull_request_reviews[required_approving_review_count]=1 \
  -f restrictions=null

# main (cuando exista)
gh api -X PUT \
  -H "Accept: application/vnd.github+json" \
  repos/axiaagencyok/web_wpp_ig_wh/branches/main/protection \
  -f required_status_checks[strict]=true \
  -f required_status_checks[contexts][]='validate' \
  -f enforce_admins=false \
  -f required_pull_request_reviews[required_approving_review_count]=1 \
  -f restrictions=null
```

Lo mismo está empaquetado en `scripts/setup-branch-protection.sh` — corré ese
script desde una shell con `gh` autenticado.

## Cómo escribir un nuevo test

Los tests viven en `tests/*.test.ts`. Patrón:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "./helpers/supabase-mock";

const supabase = createSupabaseMock({
  tenants: { row: { id: "...", agent_enabled: true } },
});

vi.mock("@/lib/supabase/admin", () => ({ adminClient: supabase.client }));

beforeEach(() => { supabase.calls.length = 0; });

describe("…", () => {
  it("…", async () => {
    const { POST } = await import("@/app/api/…");
    const res = await POST(new Request("…", { method: "POST", body: "…" }) as never);
    expect(res.status).toBe(200);
  });
});
```

Mockear APIs externas (Anthropic, ManyChat, Resend, etc.) con `vi.mock` —
nunca llamar a la red real desde tests.

## Cómo correr el CI localmente

```bash
cd agentewpp
npm ci
npm run typecheck
npm run test:run
NODE_OPTIONS=--max-old-space-size=4096 npm run build
```

Tiempos esperados: typecheck ~5s, tests ~1s, build ~60s. Total < 2min.

## Cuando algo se rompe en prod sin que el CI lo cache

Significa que el tests/ no cubre ese path. Antes de hot-fix-ear, agregá el test
que reproduce el bug (sale rojo), después aplicá el fix (sale verde). Ese es el
loop que evita las regresiones que rompieron la semana del 2026-05-20.

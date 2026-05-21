#!/usr/bin/env bash
# Aplica branch protection a la default branch y a `main`.
# Requisitos: `gh` autenticado con permisos admin en el repo.
#
# Correr UNA SOLA VEZ después de mergear el PR de CI, para que GitHub
# ya tenga registrado el status check `validate` (creado por ci.yml).

set -euo pipefail

REPO="axiaagencyok/web_wpp_ig_wh"
CHECK_CONTEXT="validate"
DEFAULT_BRANCH="feature/crm-admin"
MAIN_BRANCH="main"

protect() {
  local branch="$1"
  echo "🔒 Protegiendo $branch …"

  # Cuerpo armado como JSON para evitar el quoting de gh api -f con arrays.
  local body
  body=$(cat <<EOF
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["${CHECK_CONTEXT}"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF
)

  echo "$body" | gh api \
    -X PUT \
    -H "Accept: application/vnd.github+json" \
    "repos/${REPO}/branches/${branch}/protection" \
    --input -

  echo "✅ $branch protegida."
}

protect "$DEFAULT_BRANCH"

# main puede no existir todavía — si gh devuelve 404 lo ignoramos.
if gh api "repos/${REPO}/branches/${MAIN_BRANCH}" >/dev/null 2>&1; then
  protect "$MAIN_BRANCH"
else
  echo "ℹ️  Branch ${MAIN_BRANCH} no existe en remote; skip."
fi

echo "Done."

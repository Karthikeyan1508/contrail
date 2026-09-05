#!/usr/bin/env bash
# ---------------------------------------------------------------------------
#  Contrail — one-shot setup (macOS / Linux / Git Bash / WSL)
#
#    bash scripts/setup.sh
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPONENTS=(accordion alert avatar badge breadcrumb button card dialog
            dropdown-menu input label progress scroll-area select separator
            sheet sidebar skeleton sonner switch table tabs tooltip)

step() { printf '\n\033[36m[%s] %s\033[0m\n' "$1" "$2"; }

step 0 'Checking Node'
MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$MAJOR" -ge 20 ] || { echo "Node 20+ required, found $(node -v)"; exit 1; }
echo "    node $(node -v)  npm $(npm -v)"

step 1 'Installing the API'
( cd apps/api && npm install --no-audit --no-fund )
[ -f apps/api/.env ] || cp apps/api/.env.example apps/api/.env

if [ -f apps/web/package.json ]; then
  step 2 'apps/web already exists — skipping scaffold'
else
  step 2 'Creating apps/web from your shadcn preset'
  echo -e "    \033[33mWhen asked for the project name, answer:  web\033[0m"
  pushd apps >/dev/null
  before="$(ls -d */ 2>/dev/null || true)"
  npx --yes shadcn@latest init --preset b1sAmW2JU --template next
  after="$(ls -d */ 2>/dev/null || true)"
  created="$(comm -13 <(echo "$before" | sort) <(echo "$after" | sort) | tr -d '/' | head -1)"
  if [ -n "$created" ] && [ "$created" != "web" ]; then
    echo "    Renaming '$created' to 'web'"
    mv "$created" web
  fi
  popd >/dev/null
  [ -f apps/web/package.json ] || {
    echo 'apps/web was not created. Run the shadcn init manually inside apps/, name it "web", then re-run.'; exit 1; }
fi

step 3 "Adding ${#COMPONENTS[@]} shadcn components"
( cd apps/web && npx --yes shadcn@latest add "${COMPONENTS[@]}" --yes --overwrite )

step 4 'Installing the Contrail frontend source'
cp -R overlay/web/app/. apps/web/app/
mkdir -p apps/web/lib && cp -R overlay/web/lib/. apps/web/lib/
mkdir -p apps/web/components && cp -R overlay/web/components/. apps/web/components/
cp overlay/web/next.config.mjs apps/web/next.config.mjs
rm -f apps/web/next.config.ts apps/web/app/page.module.css
[ -f apps/web/.env.local ] || cp overlay/web/.env.local.example apps/web/.env.local

step 5 'Installing workspace dependencies'
# The sidebar shell needs these two and the shadcn preset does not add them.
( cd apps/web && npm install --no-audit --no-fund next-themes geist )
npm install --no-audit --no-fund

step 6 'Seeding the variant store'
npm run seed

printf '\n\033[32m  Done. Start both apps with:\033[0m\n      npm run dev\n\n'
printf '  Web  http://localhost:3000\n  API  http://localhost:4000/api/health\n\n'

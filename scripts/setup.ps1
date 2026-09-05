# ---------------------------------------------------------------------------
#  Contrail — one-shot setup (Windows PowerShell)
#
#    powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1
#
#  Creates apps/web from your shadcn preset, installs every UI component the
#  app uses, drops the Contrail source over the top, installs the API, and
#  seeds the variant store.
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$Components = @(
  'accordion','alert','avatar','badge','breadcrumb','button','card','dialog',
  'dropdown-menu','input','label','progress','scroll-area','select','separator',
  'sheet','sidebar','skeleton','sonner','switch','table','tabs','tooltip'
)

function Step($n, $msg) { Write-Host "`n[$n] $msg" -ForegroundColor Cyan }

# --- 0. node -----------------------------------------------------------------
Step 0 'Checking Node'
$nodeVersion = (node -v) -replace 'v',''
if ([int]($nodeVersion.Split('.')[0]) -lt 20) {
  throw "Node 20 or newer required. Found $nodeVersion."
}
Write-Host "    node $nodeVersion  npm $(npm -v)"

# --- 1. API ------------------------------------------------------------------
Step 1 'Installing the API'
Push-Location "$Root\apps\api"
npm install --no-audit --no-fund
if (-not (Test-Path '.env')) { Copy-Item '.env.example' '.env' }
Pop-Location

# --- 2. scaffold apps/web from the preset ------------------------------------
if (Test-Path "$Root\apps\web\package.json") {
  Step 2 'apps/web already exists — skipping scaffold'
} else {
  Step 2 'Creating apps/web from your shadcn preset'
  Write-Host '    When asked for the project name, answer:  web' -ForegroundColor Yellow
  Push-Location "$Root\apps"
  $before = Get-ChildItem -Directory | Select-Object -ExpandProperty Name
  npx --yes shadcn@latest init --preset b1sAmW2JU --template next
  $after = Get-ChildItem -Directory | Select-Object -ExpandProperty Name
  $created = $after | Where-Object { $before -notcontains $_ }
  if ($created -and $created -ne 'web') {
    Write-Host "    Renaming '$created' to 'web'"
    Rename-Item -Path $created -NewName 'web'
  }
  Pop-Location
  if (-not (Test-Path "$Root\apps\web\package.json")) {
    throw 'apps/web was not created. Run the shadcn init manually inside apps/ and name the project "web", then re-run this script.'
  }
}

# --- 3. shadcn components ----------------------------------------------------
Step 3 "Adding $($Components.Count) shadcn components"
Push-Location "$Root\apps\web"
npx --yes shadcn@latest add $Components --yes --overwrite
Pop-Location

# --- 4. Contrail source over the top -----------------------------------------
Step 4 'Installing the Contrail frontend source'
Copy-Item -Path "$Root\overlay\web\app\*"  -Destination "$Root\apps\web\app"  -Recurse -Force
New-Item -ItemType Directory -Force -Path "$Root\apps\web\lib" | Out-Null
Copy-Item -Path "$Root\overlay\web\lib\*"  -Destination "$Root\apps\web\lib"  -Recurse -Force
New-Item -ItemType Directory -Force -Path "$Root\apps\web\components" | Out-Null
Copy-Item -Path "$Root\overlay\web\components\*" -Destination "$Root\apps\web\components" -Recurse -Force
Copy-Item -Path "$Root\overlay\web\next.config.mjs" -Destination "$Root\apps\web\next.config.mjs" -Force
Remove-Item "$Root\apps\web\next.config.ts" -ErrorAction SilentlyContinue
Remove-Item "$Root\apps\web\app\page.module.css" -ErrorAction SilentlyContinue
if (-not (Test-Path "$Root\apps\web\.env.local")) {
  Copy-Item "$Root\overlay\web\.env.local.example" "$Root\apps\web\.env.local"
}

# --- 5. workspace install ----------------------------------------------------
Step 5 'Installing workspace dependencies'
# The sidebar shell needs these two and the shadcn preset does not add them.
Push-Location "$Root\apps\web"
npm install --no-audit --no-fund next-themes geist
Pop-Location
npm install --no-audit --no-fund

# --- 6. seed -----------------------------------------------------------------
Step 6 'Seeding the variant store'
npm run seed

Write-Host "`n  Done. Start both apps with:" -ForegroundColor Green
Write-Host "      npm run dev`n"
Write-Host "  Web  http://localhost:3000"
Write-Host "  API  http://localhost:4000/api/health`n"

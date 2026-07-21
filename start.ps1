# start.ps1 — Launch both backend and frontend
# Run from the root of the project: .\start.ps1

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "  ⚖️  Legal RAG App — قانون العقوبات" -ForegroundColor Cyan
Write-Host "  ─────────────────────────────────────" -ForegroundColor DarkGray
Write-Host ""

# ── Start Backend ─────────────────────────────────────────────────────────────
$backendPath = Join-Path $Root "backend"
$venvPython  = Join-Path $backendPath ".venv\Scripts\python.exe"

if (-not (Test-Path $venvPython)) {
    Write-Host "  ❌ Backend venv not found." -ForegroundColor Red
    Write-Host "     Run: cd backend && python -m venv .venv && .\.venv\Scripts\Activate.ps1 && pip install -r requirements.txt" -ForegroundColor Yellow
    exit 1
}

$envFile = Join-Path $backendPath ".env"
if (-not (Test-Path $envFile)) {
    Write-Host "  ❌ backend/.env not found." -ForegroundColor Red
    Write-Host "     Copy backend/.env.example to backend/.env and add your API keys." -ForegroundColor Yellow
    exit 1
}

Write-Host "  🚀 Starting Python backend (port 8000)..." -ForegroundColor Green
$backendJob = Start-Process -FilePath $venvPython `
    -ArgumentList "-m", "uvicorn", "main:app", "--reload", "--port", "8000" `
    -WorkingDirectory $backendPath `
    -PassThru `
    -NoNewWindow

Start-Sleep -Seconds 2

# ── Start Frontend ────────────────────────────────────────────────────────────
$frontendPath = Join-Path $Root "frontend"
$nodeModules  = Join-Path $frontendPath "node_modules"

if (-not (Test-Path $nodeModules)) {
    Write-Host "  📦 Installing frontend dependencies..." -ForegroundColor Yellow
    Push-Location $frontendPath
    npm install
    Pop-Location
}

Write-Host "  🌐 Starting Next.js frontend (port 3001)..." -ForegroundColor Green
$frontendJob = Start-Process -FilePath "npm" `
    -ArgumentList "run", "dev" `
    -WorkingDirectory $frontendPath `
    -PassThru `
    -NoNewWindow

Write-Host ""
Write-Host "  ✅ Both servers started!" -ForegroundColor Green
Write-Host "  📍 Frontend: http://localhost:3001" -ForegroundColor Cyan
Write-Host "  📍 Backend:  http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Press Ctrl+C to stop all servers." -ForegroundColor DarkGray
Write-Host ""

# Wait for Ctrl+C
try {
    while ($true) { Start-Sleep -Seconds 1 }
} finally {
    Write-Host "`n  🛑 Stopping servers..." -ForegroundColor Yellow
    if ($backendJob  -and !$backendJob.HasExited)  { $backendJob.Kill()  }
    if ($frontendJob -and !$frontendJob.HasExited) { $frontendJob.Kill() }
    Write-Host "  Done." -ForegroundColor Green
}

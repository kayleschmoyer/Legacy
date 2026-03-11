# dev-web.ps1
# Auto-restarts the Vite dev server when the Nx daemon crashes mid-session
# (most commonly triggered by switching git branches while the server is running).

param(
    [int]$Port = 4200,
    [int]$RestartDelaySec = 2
)

$attempt = 0

while ($true) {
    $attempt++
    if ($attempt -gt 1) {
        Write-Host ""
        Write-Host "  Restarting dev server (attempt $attempt)..." -ForegroundColor Yellow
        Start-Sleep -Seconds $RestartDelaySec
    } else {
        Write-Host "  Starting web dev server on http://localhost:$Port" -ForegroundColor Cyan
    }

    if ($Port -ne 4200) {
        pnpm exec nx serve web --port=$Port
    } else {
        pnpm exec nx serve web
    }

    $exitCode = $LASTEXITCODE

    # Exit code 0 = clean shutdown (Ctrl+C) -- stop looping
    if ($exitCode -eq 0) {
        break
    }

    Write-Host ""
    Write-Host "  Dev server exited with code $exitCode (likely daemon restart after branch switch)." -ForegroundColor DarkYellow
}

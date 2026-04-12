# Shutdown Hygiene — Stale Process Detection & Cleanup

When running E2E locally, stale Playwright/static server processes can hold native `.node` addons loaded (`bufferutil.node`, `utf-8-validate.node`). Since worktrees share `node_modules` via symlinks, one stale process blocks installs for everyone.

## Detect stale processes

```powershell
$nmRoot='D:\code\legacy-sports\node_modules'; $nmEsc=[regex]::Escape($nmRoot)
Get-Process node -ErrorAction SilentlyContinue | Where-Object {
  try { ($_.Modules | Where-Object { $_.FileName -match ($nmEsc + '.*\.node$') }).Count -gt 0 } catch { $false }
} | Select-Object Id, ProcessName
```

## Stop stale processes

```powershell
$nmRoot='D:\code\legacy-sports\node_modules'; $nmEsc=[regex]::Escape($nmRoot)
Get-Process node -ErrorAction SilentlyContinue | Where-Object {
  try { ($_.Modules | Where-Object { $_.FileName -match ($nmEsc + '.*\.node$') }).Count -gt 0 } catch { $false }
} | ForEach-Object { Stop-Process -Id $_.Id -Force }
```

## Shortcut

```powershell
make kill-stale
```

The symptom of stale processes is usually: `ERR_PNPM_EPERM ... unlink ... node_modules\\bufferutil\\...\\bufferutil.node`.

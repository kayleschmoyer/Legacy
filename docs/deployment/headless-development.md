# Headless Development Server Methods

## Method 1: PowerShell Background Job

```powershell
# Start in background
$job = Start-Job -ScriptBlock { Set-Location "C:\code\legacy-sports"; npx nx dev web }

# Check status
Get-Job

# Get output
Receive-Job $job

# Stop background job
Stop-Job $job
Remove-Job $job
```

## Method 2: PowerShell Start-Process

```powershell
# Start detached process
Start-Process powershell -ArgumentList "-Command", "cd C:\code\legacy-sports; npx nx dev web" -WindowStyle Hidden

# Or visible in new window
Start-Process powershell -ArgumentList "-Command", "cd C:\code\legacy-sports; npx nx dev web"
```

## Method 3: Using nohup equivalent (Windows)

```powershell
# Using PowerShell background operator
npx nx dev web &

# Or using start command
start /b npx nx dev web
```

## Method 4: Nx Headless Task

```bash
# Use the new headless task
npx nx dev:headless web
```

## Method 5: Node.js Process Management

```bash
# Install pm2 for process management
npm install -g pm2

# Start in background with pm2
pm2 start "npx nx dev web" --name "web-dev"

# Check status
pm2 status

# Stop
pm2 stop web-dev
```

## Method 6: Docker Background

```bash
# Build and run in background
docker-compose up -d web-dev
```

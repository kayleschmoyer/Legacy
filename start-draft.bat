@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM Interactive draft launcher:
REM - Prompts for page number
REM - Starts backend/web only if not already running
REM - Opens only the selected page

set "ROOT=%~dp0"
set "API_HEALTH_URL=http://localhost:5000/health"
set "WEB_URL=http://localhost:4200"
set "BASEBALL_URL=http://localhost:4200/baseball"
set "GRAPHQL_UI_URL=http://localhost:5000/graphql"
set "ENV_GRAPHQL_HOST="
set "USE_LOCAL_API=1"

for /f "tokens=1,* delims==" %%A in ('findstr /b /c:"VITE_GRAPHQL_HOST=" "%ROOT%.env.local" 2^>nul') do set "ENV_GRAPHQL_HOST=%%B"

if not "%ENV_GRAPHQL_HOST%"=="" (
	set "GRAPHQL_UI_URL=%ENV_GRAPHQL_HOST%"
	echo %ENV_GRAPHQL_HOST% | findstr /i /c:"localhost:5000" /c:"127.0.0.1:5000" >nul
	if errorlevel 1 set "USE_LOCAL_API=0"
)

set "PAGE_CHOICE=%~1"
if "%PAGE_CHOICE%"=="" (
	echo.
	echo Choose page to open:
	echo   1^) Web Home
	echo   2^) Baseball Home
	echo   3^) Draft Board
	echo   4^) GraphQL UI
	set /p PAGE_CHOICE=Enter number [1-4]: 
)

set "TARGET_URL=%WEB_URL%"
if "%PAGE_CHOICE%"=="1" set "TARGET_URL=%WEB_URL%"
if "%PAGE_CHOICE%"=="2" set "TARGET_URL=%BASEBALL_URL%"
if "%PAGE_CHOICE%"=="4" set "TARGET_URL=%GRAPHQL_UI_URL%"

if "%PAGE_CHOICE%"=="3" (
	set "LEAGUE_ID=%~2"
	if "!LEAGUE_ID!"=="" set /p LEAGUE_ID=Enter league id for draft board: 
	if "!LEAGUE_ID!"=="" (
		echo No league id entered, opening baseball home instead.
		set "TARGET_URL=%BASEBALL_URL%"
	) else (
		set "TARGET_URL=http://localhost:4200/baseball/league/!LEAGUE_ID!/draft"
	)
)

if not "%PAGE_CHOICE%"=="1" if not "%PAGE_CHOICE%"=="2" if not "%PAGE_CHOICE%"=="3" if not "%PAGE_CHOICE%"=="4" (
	echo Invalid selection: %PAGE_CHOICE%
	exit /b 1
)

echo.
echo [1/4] Checking GraphQL API status...
if "%USE_LOCAL_API%"=="0" (
	echo     Remote GraphQL host detected in .env.local
	echo     Using: %GRAPHQL_UI_URL%
	echo     Skipping local GraphQL API startup.
) else (
	call :check_url "%API_HEALTH_URL%"
	if errorlevel 1 (
		echo     GraphQL API is not running. Starting dev:db...
		start "Legacy Sports - GraphQL API" cmd /k "cd /d ""%ROOT%"" && pnpm exec nx run db:serve"
		call :wait_for_url "%API_HEALTH_URL%" 60 "GraphQL API"
		if errorlevel 1 exit /b 1
	) else (
		echo     GraphQL API already running.
	)
)

echo [2/4] Checking Web app status...
call :check_url "%WEB_URL%"
if errorlevel 1 (
	echo     Web app is not running. Starting web app...
	start "Legacy Sports - Web" cmd /k "cd /d ""%ROOT%"" && pnpm exec nx run web:serve"
	call :wait_for_url "%WEB_URL%" 90 "Web app"
	if errorlevel 1 exit /b 1
) else (
	echo     Web app already running.
)

echo [3/4] Opening selected page...
echo     %TARGET_URL%
start "" "%TARGET_URL%"

echo [4/4] Done.
goto :eof

:check_url
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri '%~1' -TimeoutSec 2; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { exit 0 } else { exit 1 } } catch { exit 1 }"
exit /b %ERRORLEVEL%

:wait_for_url
set "WAIT_URL=%~1"
set "WAIT_TRIES_MAX=%~2"
set "WAIT_LABEL=%~3"
set /a WAIT_TRIES=0

:wait_loop
set /a WAIT_TRIES+=1
call :check_url "%WAIT_URL%"
if not errorlevel 1 (
	echo     %WAIT_LABEL% is up.
	exit /b 0
)

if %WAIT_TRIES% GEQ %WAIT_TRIES_MAX% (
	echo ERROR: %WAIT_LABEL% did not become ready in time.
	exit /b 1
)

timeout /t 2 /nobreak >nul
goto wait_loop

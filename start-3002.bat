@echo off
setlocal
rem ============================================================
rem  BLADNA - start the production web server on port 3002
rem  Usage: double-click start-3002.bat  (or run it from a shell)
rem
rem  Lifecycle rules:
rem    - requires a completed production build (npm run validate
rem      or npm run build at the repo root) - a half-written build
rem      makes `next start` fail with "destination stream closed early",
rem    - stop THIS server before running any build,
rem    - port 3000 is never touched (sadi_ai_pro lives there).
rem ============================================================

cd /d "%~dp0apps\web"

if not exist ".next\BUILD_ID" (
    echo [start-3002] No production build found in apps\web\.next
    echo [start-3002] Run "npm run validate" or "npm run build" at the repo root first.
    pause
    exit /b 1
)

netstat -ano -p tcp | findstr LISTENING | findstr /c:":3002 " >nul
if not errorlevel 1 (
    echo [start-3002] Port 3002 is already listening - the server is probably running.
    echo [start-3002] Open http://localhost:3002/ in your browser.
    pause
    exit /b 0
)

echo [start-3002] Starting BLADNA on http://localhost:3002/  (press Ctrl+C to stop)
call npm run start -- -p 3002
echo.
echo [start-3002] Server stopped (exit code %ERRORLEVEL%).
pause

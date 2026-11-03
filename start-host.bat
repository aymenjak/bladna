@echo off
setlocal
rem ============================================================
rem  BLADNA - Internet Host (Cloudflare named tunnel)
rem  Serves BLADNA at http://bladna.aymen-digital-studio.site/
rem    - local origin: port 3002 (port 3000 is sadi_ai_pro),
rem    - named tunnel "bladna" -> same permanent URL every time,
rem    - never touches C:\Users\aymen\Downloads\sadi_ai_pro.
rem  Usage: double-click start-host.bat
rem ============================================================

cd /d "%~dp0"

echo ========================================
echo   BLADNA - Internet Host
echo   http://bladna.aymen-digital-studio.site/
echo ========================================
echo.

rem --- Step 1: make sure the BLADNA web server is up on 3002 ---
netstat -ano -p tcp | findstr LISTENING | findstr /c:":3002 " >nul
if not errorlevel 1 (
    echo [1/2] BLADNA already running on http://localhost:3002/
) else (
    if not exist "apps\web\.next\BUILD_ID" (
        echo [1/2] No production build found in apps\web\.next
        echo       Run "npm run build" at the repo root first, then re-run this script.
        pause
        exit /b 1
    )
    echo [1/2] Starting BLADNA web server on port 3002...
    start "BLADNA Web" cmd /c "cd /d %~dp0apps\web && npm run start -- -p 3002"
    timeout /t 8 /nobreak >nul
)

rem --- Step 2: named Cloudflare tunnel (restarts itself if it drops) ---
echo [2/2] Starting Cloudflare tunnel "bladna"...
echo.
echo ========================================
echo   Public URL (always the same):
echo   http://bladna.aymen-digital-studio.site/
echo   Local URL: http://localhost:3002/
echo ========================================
echo.

:loop
echo [%date% %time%] Starting tunnel...
cd /d "%~dp0"
cloudflared.exe tunnel run bladna
echo [%date% %time%] Tunnel died. Restarting in 3 seconds...
timeout /t 3 /nobreak >nul
goto loop

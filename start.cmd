@echo off
echo Starting Ludik Telegram App with ngrok...
echo.

REM Check if ngrok is installed
where ngrok >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] ngrok is not installed or not in PATH
    echo.
    echo Please install ngrok from: https://ngrok.com/download
    echo.
    pause
    exit /b 1
)

REM Check if node_modules exists
if not exist "node_modules\" (
    echo [INFO] Installing dependencies...
    call npm install
    echo.
)

REM Start the Node.js server in the background
echo [INFO] Starting Node.js server on port 3000...
start /B node src\server.js

REM Wait a bit for server to start
timeout /t 3 /nobreak >nul

REM Start ngrok
echo [INFO] Starting ngrok tunnel...
echo.
echo ========================================
echo Your app will be available at the HTTPS URL below
echo Copy this URL and add it to your .env file as WEB_APP_URL
echo Also update it in @BotFather using /newapp or /editapp
echo ========================================
echo.

ngrok http 3000

REM When ngrok is closed, this will clean up
echo.
echo [INFO] Shutting down server...
taskkill /F /IM node.exe /FI "WINDOWTITLE eq start*" >nul 2>nul

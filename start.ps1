# PowerShell script to start Ludik Telegram App with ngrok

Write-Host "Starting Ludik Telegram App with ngrok..." -ForegroundColor Cyan
Write-Host ""

# Check if ngrok is installed
$ngrokExists = Get-Command ngrok -ErrorAction SilentlyContinue
if (-not $ngrokExists) {
    Write-Host "[ERROR] ngrok is not installed or not in PATH" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install ngrok from: https://ngrok.com/download" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

# Check if node_modules exists
if (-not (Test-Path "node_modules")) {
    Write-Host "[INFO] Installing dependencies..." -ForegroundColor Yellow
    npm install
    Write-Host ""
}

# Start the Node.js server
Write-Host "[INFO] Starting Node.js server on port 3000..." -ForegroundColor Green
$serverProcess = Start-Process node -ArgumentList "src\server.js" -PassThru -WindowStyle Hidden

# Wait for server to start
Start-Sleep -Seconds 3

# Start ngrok
Write-Host "[INFO] Starting ngrok tunnel..." -ForegroundColor Green
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Your app will be available at the HTTPS URL below" -ForegroundColor Yellow
Write-Host "Copy this URL and add it to your .env file as WEB_APP_URL" -ForegroundColor Yellow
Write-Host "Also update it in @BotFather using /mybots" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Start ngrok and capture CTRL+C
try {
    ngrok http 3000
}
finally {
    # Clean up when ngrok exits
    Write-Host ""
    Write-Host "[INFO] Shutting down server..." -ForegroundColor Yellow
    Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
}

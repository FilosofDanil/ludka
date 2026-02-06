#!/bin/bash

echo "Starting Ludik Telegram App with ngrok..."
echo ""

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    echo "[ERROR] ngrok is not installed or not in PATH"
    echo ""
    echo "Please install ngrok from: https://ngrok.com/download"
    echo ""
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "[INFO] Installing dependencies..."
    npm install
    echo ""
fi

# Start the Node.js server in the background
echo "[INFO] Starting Node.js server on port 3000..."
node src/server.js &
SERVER_PID=$!

# Wait for server to start
sleep 3

# Start ngrok
echo "[INFO] Starting ngrok tunnel..."
echo ""
echo "========================================"
echo "Your app will be available at the HTTPS URL below"
echo "Copy this URL and add it to your .env file as WEB_APP_URL"
echo "Also update it in @BotFather using /newapp or /editapp"
echo "========================================"
echo ""

# Trap CTRL+C to clean up
trap "echo ''; echo '[INFO] Shutting down server...'; kill $SERVER_PID 2>/dev/null; exit" INT TERM

ngrok http 3000

# Clean up when ngrok exits
echo ""
echo "[INFO] Shutting down server..."
kill $SERVER_PID 2>/dev/null

# Ludik Telegram Mini App

A simple Telegram Mini App with a dashboard featuring text fields and buttons.

## Project Structure

```
├── src/
│   ├── server.js      # Express server
│   └── bot.js         # Telegram bot logic
├── public/
│   ├── index.html     # Dashboard HTML
│   ├── css/
│   │   └── style.css  # Styles with Telegram theme support
│   └── js/
│       └── app.js     # Frontend JavaScript
├── package.json
├── .env.example
└── README.md
```

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Create Telegram Bot

1. Open [@BotFather](https://t.me/BotFather) in Telegram
2. Send `/newbot` and follow the instructions
3. Copy the bot token

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and add your bot token:

```env
BOT_TOKEN=your_bot_token_here
WEB_APP_URL=https://your-domain.com
PORT=3000
```

### 4. Install ngrok (for local development)

Telegram Mini Apps require HTTPS. For local development:

1. Download ngrok from [https://ngrok.com/download](https://ngrok.com/download)
2. Extract and add to your PATH
3. Sign up for a free account and authenticate: `ngrok config add-authtoken YOUR_TOKEN`

For production, deploy to Vercel/Railway/Render with HTTPS.

### 5. Run the App

**Option A: Quick Start with ngrok (Recommended for development)**

Windows (choose one):
```cmd
start.cmd
```
or
```powershell
.\start.ps1
```

Linux/Mac:
```bash
./start.sh
```

This will:
- Install dependencies if needed
- Start the Node.js server
- Launch ngrok tunnel with HTTPS URL
- Display the URL to add to `.env` and @BotFather

**Option B: Manual start**

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start

# In another terminal, start ngrok
ngrok http 3000
```

Update `WEB_APP_URL` in `.env` with your ngrok HTTPS URL.

## Quick Setup Guide

1. **Install ngrok** and authenticate (see step 4 above)

2. **Run the launch script:**
   - Windows: Double-click `start.cmd` or run `.\start.ps1` in PowerShell
   - Linux/Mac: Run `./start.sh` in terminal

3. **Copy the ngrok URL** (e.g., `https://abc123.ngrok.io`)

4. **Update `.env` file:**
   ```env
   WEB_APP_URL=https://abc123.ngrok.io
   ```

5. **Configure bot in @BotFather:**
   - Send `/mybots` → select your bot → Bot Settings → Menu Button
   - Set URL to your ngrok URL
   - Or create a Web App: `/newapp` → follow instructions

6. **Restart the server** (CTRL+C and run `start.cmd` or `start.sh` again)

7. **Test in Telegram:**
   - Open your bot
   - Send `/start`
   - Click "Open Dashboard"

## Usage

1. Open your bot in Telegram
2. Send `/start`
3. Click "Open Dashboard" button
4. Fill in the form and submit

## Features

- **Form with validation**: Name, email, and message fields
- **Quick action buttons**: Three customizable action buttons
- **Telegram theme integration**: Adapts to user's Telegram theme
- **Haptic feedback**: Touch feedback on supported devices
- **Main button**: Telegram's native main button for form submission
- **API endpoint**: Backend receives form submissions

## API Endpoints

| Method | Endpoint      | Description          |
|--------|---------------|----------------------|
| GET    | `/`           | Serve dashboard      |
| GET    | `/api/health` | Health check         |
| POST   | `/api/submit` | Handle form submit   |

## Bot Commands

| Command  | Description            |
|----------|------------------------|
| `/start` | Open the dashboard     |
| `/help`  | Show help message      |

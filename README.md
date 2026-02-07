# Ludik Telegram Mini App

A simple Telegram Mini App with a dashboard featuring text fields and buttons, plus a comprehensive admin panel.

📖 **Quick Links:**
- [📑 Documentation Index](INDEX.md) - Complete documentation navigation
- [🚀 Quick Start Guide](QUICKSTART.md) - Get started in 5 minutes
- [🔧 Admin Panel Documentation](ADMIN_PANEL.md) - Detailed admin features
- [🏗️ Architecture](ARCHITECTURE.md) - Technical architecture and flow diagrams
- [🐛 Troubleshooting](TROUBLESHOOTING.md) - Common issues and solutions
- [✨ Features](FEATURES.md) - Complete feature list
- [📋 Project Summary](PROJECT_SUMMARY.md) - Overview and next steps

---

## Project Structure

```
├── src/
│   ├── server.js      # Express server
│   ├── bot.js         # Telegram bot with admin panel
│   ├── adminAuth.js   # Authorization & whitelist management
│   ├── adminPanel.js  # Admin panel UI & logic
│   └── getId.js       # Utility to get Telegram IDs
├── public/
│   ├── index.html     # Dashboard HTML
│   ├── css/
│   │   └── style.css  # Styles with Telegram theme support
│   └── js/
│       └── app.js     # Frontend JavaScript
├── whitelist.json     # Authorized admin user IDs (gitignored)
├── package.json
├── .env               # Environment configuration (gitignored)
├── start.cmd          # Windows launch script
├── start.ps1          # PowerShell launch script
├── start.sh           # Linux/Mac launch script
├── README.md          # This file
└── ADMIN_PANEL.md     # Admin panel documentation
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
cp whitelist.json.example whitelist.json
```

Edit `.env` and add your bot token:

```env
BOT_TOKEN=your_bot_token_here
WEB_APP_URL=https://your-domain.com
PORT=3000
```

Edit `whitelist.json` and add your Telegram user ID:

```json
{
  "authorizedUsers": [YOUR_TELEGRAM_ID]
}
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

7. **Get your Telegram ID:**
   - Open your bot in Telegram
   - Send `/admin`
   - The bot will show your Telegram ID in the access denied message

8. **Add yourself to whitelist:**
   - Edit `whitelist.json`
   - Add your ID to the `authorizedUsers` array
   - Restart the bot

9. **Test admin panel:**
   - Send `/admin` again
   - You should now see the admin menu

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

| Command  | Description                  | Access      |
|----------|------------------------------|-------------|
| `/start` | Open the dashboard           | All users   |
| `/help`  | Show help message            | All users   |
| `/admin` | Access admin panel           | Whitelisted |

## Admin Panel Features

The admin panel provides comprehensive management tools. See [ADMIN_PANEL.md](ADMIN_PANEL.md) for detailed documentation.

### Quick Overview:

### 🔗 App URL Management
- View current Web App URL
- Change the URL dynamically
- No need to manually edit `.env`

### 📡 API Information
- Complete list of available endpoints
- Request/response formats
- Base URL and local server info

### 📚 Setup Guide
- Step-by-step launch instructions
- Environment configuration
- @BotFather setup guide

### 👥 Whitelist Management
- View authorized users
- Instructions for adding/removing users

### 🔐 Authorization

Admin access is controlled via `whitelist.json`:

1. **Get your Telegram ID (Method 1 - Quick):**
   ```bash
   npm run get-id
   ```
   Then send any message to your bot. Your ID will be displayed.

2. **Get your Telegram ID (Method 2):**
   - Send any message to the bot
   - When denied admin access, it will show your ID

3. **Add your ID to whitelist:**
   ```json
   {
     "authorizedUsers": [123456789, 987654321],
     "description": "Add Telegram user IDs that are allowed to access the admin panel"
   }
   ```

4. **Restart the bot** to apply changes

### ⚠️ Access Denied

Unauthorized users will receive:
```
⛔ Access Denied

You do not have permission to access the admin panel.

Your Telegram ID: 123456789

Contact the administrator to get access.
```

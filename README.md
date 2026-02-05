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

### 4. Deploy for HTTPS (Required for Telegram)

Telegram Mini Apps require HTTPS. Options:

- **ngrok** (for development): `ngrok http 3000`
- **Cloudflare Tunnel**
- **Deploy to Vercel/Railway/Render**

Update `WEB_APP_URL` in `.env` with your HTTPS URL.

### 5. Run the App

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

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

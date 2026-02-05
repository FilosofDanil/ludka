const TelegramBot = require('node-telegram-bot-api');

let bot = null;

function initBot() {
    const token = process.env.BOT_TOKEN;
    const webAppUrl = process.env.WEB_APP_URL;

    if (!token) {
        console.error('BOT_TOKEN is required');
        return;
    }

    bot = new TelegramBot(token, { polling: true });

    // /start command - shows the Web App button
    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        const userName = msg.from.first_name || 'User';

        const options = {
            reply_markup: {
                inline_keyboard: [[
                    {
                        text: '🎮 Open Dashboard',
                        web_app: { url: webAppUrl }
                    }
                ]]
            }
        };

        bot.sendMessage(
            chatId,
            `Welcome, ${userName}! 👋\n\nTap the button below to open the dashboard.`,
            options
        );
    });

    // /help command
    bot.onText(/\/help/, (msg) => {
        const chatId = msg.chat.id;
        
        bot.sendMessage(chatId, 
            '📖 *Available Commands:*\n\n' +
            '/start - Open the dashboard\n' +
            '/help - Show this help message',
            { parse_mode: 'Markdown' }
        );
    });

    // Handle any text message
    bot.on('message', (msg) => {
        // Ignore commands
        if (msg.text && msg.text.startsWith('/')) return;

        const chatId = msg.chat.id;
        
        bot.sendMessage(
            chatId,
            'Use /start to open the dashboard or /help for available commands.'
        );
    });

    // Handle Web App data (when user submits from the mini app)
    bot.on('web_app_data', (msg) => {
        const chatId = msg.chat.id;
        const data = JSON.parse(msg.web_app_data.data);
        
        console.log('Received Web App data:', data);
        
        bot.sendMessage(
            chatId,
            `✅ Data received!\n\nName: ${data.name}\nEmail: ${data.email}\nMessage: ${data.message}`
        );
    });

    console.log('Telegram bot initialized successfully');
}

function getBot() {
    return bot;
}

module.exports = { initBot, getBot };

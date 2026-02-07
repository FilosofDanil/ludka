const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const token = process.env.BOT_TOKEN;

if (!token) {
    console.error('Error: BOT_TOKEN not found in .env file');
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

console.log('Bot started. Send any message to get your Telegram ID.');
console.log('Press CTRL+C to stop.\n');

bot.on('message', (msg) => {
    const userId = msg.from.id;
    const username = msg.from.username || 'N/A';
    const firstName = msg.from.first_name || 'N/A';
    const lastName = msg.from.last_name || '';
    const chatId = msg.chat.id;

    console.log('\n========================================');
    console.log(`User ID: ${userId}`);
    console.log(`Username: @${username}`);
    console.log(`Name: ${firstName} ${lastName}`.trim());
    console.log(`Chat ID: ${chatId}`);
    console.log('========================================\n');

    bot.sendMessage(
        chatId,
        `ℹ️ *Your Telegram Information*\n\n` +
        `User ID: \`${userId}\`\n` +
        `Username: @${username}\n` +
        `Name: ${firstName} ${lastName}`.trim() + '\n\n' +
        `Add this User ID to whitelist.json to access admin panel.`,
        { parse_mode: 'Markdown' }
    );
});

bot.on('polling_error', (error) => {
    console.error('Polling error:', error.message);
});

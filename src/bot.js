const TelegramBot = require('node-telegram-bot-api');
const adminAuth = require('./adminAuth');
const adminPanel = require('./adminPanel');

let bot = null;
const userStates = new Map();

function initBot() {
    const token = process.env.BOT_TOKEN;

    if (!token) {
        console.error('BOT_TOKEN is required');
        return;
    }

    bot = new TelegramBot(token, { polling: true });

    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        const userName = msg.from.first_name || 'User';
        const webAppUrl = process.env.WEB_APP_URL;

        bot.sendMessage(
            chatId,
            `Welcome, ${userName}! 👋\n\nTap the button below to open the dashboard.`,
            {
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🎮 Open Dashboard', web_app: { url: webAppUrl || 'https://example.com' } }
                    ]]
                }
            }
        );
    });

    bot.onText(/\/help/, (msg) => {
        let helpText = '📖 *Available Commands:*\n\n' +
                      '/start - Open the dashboard\n' +
                      '/help - Show this help message';

        if (adminAuth.isAuthorized(msg.from.id)) {
            helpText += '\n/admin - Access admin panel';
        }

        bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'Markdown' });
    });

    bot.onText(/\/admin/, (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;

        if (!adminAuth.isAuthorized(userId)) {
            bot.sendMessage(
                chatId,
                '⛔ *Access Denied*\n\n' +
                'You do not have permission to access the admin panel.\n\n' +
                `Your Telegram ID: \`${userId}\`\n\n` +
                'Contact the administrator to get access.',
                { parse_mode: 'Markdown' }
            );
            return;
        }

        sendAdminMenu(chatId);
    });

    bot.on('callback_query', (query) => {
        const chatId = query.message.chat.id;
        const userId = query.from.id;
        const data = query.data;
        const messageId = query.message.message_id;

        if (data.startsWith('admin_') && !adminAuth.isAuthorized(userId)) {
            bot.answerCallbackQuery(query.id, { text: '⛔ Access denied' });
            return;
        }

        bot.answerCallbackQuery(query.id);

        switch (data) {
            case 'admin_main':
                sendAdminMenu(chatId, messageId);
                break;

            case 'admin_view_url':
                bot.editMessageText(
                    `🔗 *Current App URL*\n\n\`${adminPanel.getCurrentAppUrl()}\`\n\n` +
                    `This is the URL users access when they open your mini app.`,
                    { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', ...adminPanel.getBackButton() }
                );
                break;

            case 'admin_change_url':
                userStates.set(userId, 'awaiting_url');
                bot.editMessageText(
                    '✏️ *Change App URL*\n\n' +
                    'Please send the new HTTPS URL for your mini app.\n\n' +
                    'Example: `https://abc123.ngrok.io`\n\n' +
                    'Send /cancel to abort.',
                    { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
                );
                break;

            case 'admin_api_info':
                bot.editMessageText(adminPanel.getApiInfo(), {
                    chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', ...adminPanel.getBackButton()
                });
                break;

            case 'admin_setup_guide':
                bot.editMessageText(adminPanel.getSetupGuide(), {
                    chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', ...adminPanel.getBackButton()
                });
                break;

            case 'admin_whitelist':
                bot.editMessageText(adminPanel.getWhitelistInfo(adminAuth.getAuthorizedUsers()), {
                    chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', ...adminPanel.getBackButton()
                });
                break;

            case 'admin_close':
                bot.deleteMessage(chatId, messageId);
                break;
        }
    });

    bot.on('message', (msg) => {
        if (msg.text && msg.text.startsWith('/')) {
            if (msg.text === '/cancel' && userStates.has(msg.from.id)) {
                userStates.delete(msg.from.id);
                bot.sendMessage(msg.chat.id, '❌ Operation cancelled.');
            }
            return;
        }

        const userId = msg.from.id;
        const chatId = msg.chat.id;
        const state = userStates.get(userId);

        if (state === 'awaiting_url') {
            const newUrl = msg.text.trim();

            if (!newUrl.startsWith('http://') && !newUrl.startsWith('https://')) {
                bot.sendMessage(chatId, '⚠️ Invalid URL format. Please provide a valid HTTP/HTTPS URL.\n\nSend /cancel to abort.');
                return;
            }

            if (adminPanel.updateAppUrl(newUrl)) {
                bot.sendMessage(
                    chatId,
                    `✅ *App URL Updated Successfully*\n\n` +
                    `New URL: \`${newUrl}\`\n\n` +
                    `⚠️ *Important:* Please restart the bot for changes to take effect.\n` +
                    `You may also need to update the URL in @BotFather.`,
                    { parse_mode: 'Markdown' }
                );
            } else {
                bot.sendMessage(chatId, '❌ Failed to update URL. Please check file permissions and try again.');
            }

            userStates.delete(userId);
            setTimeout(() => sendAdminMenu(chatId), 1000);
            return;
        }

        if (!state) {
            bot.sendMessage(chatId, 'Use /start to open the dashboard or /help for available commands.');
        }
    });

    bot.on('web_app_data', (msg) => {
        const data = JSON.parse(msg.web_app_data.data);
        console.log('Received Web App data:', data);
        bot.sendMessage(msg.chat.id, `✅ Data received!\n\nName: ${data.name}\nEmail: ${data.email}\nMessage: ${data.message}`);
    });

    console.log('Telegram bot initialized successfully');
}

function sendAdminMenu(chatId, messageId = null) {
    const menuText = '🔧 *Admin Panel*\n\nWelcome to the admin panel. Select an option below:';
    const options = { parse_mode: 'Markdown', ...adminPanel.getMainMenu() };

    if (messageId) {
        bot.editMessageText(menuText, { chat_id: chatId, message_id: messageId, ...options });
    } else {
        bot.sendMessage(chatId, menuText, options);
    }
}

module.exports = { initBot };

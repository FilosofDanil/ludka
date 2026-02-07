const TelegramBot = require('node-telegram-bot-api');
const adminAuth = require('./adminAuth');
const adminPanel = require('./adminPanel');

let bot = null;
const userStates = new Map();

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
                        web_app: { url: webAppUrl || 'https://example.com' }
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
        const userId = msg.from.id;
        
        let helpText = '📖 *Available Commands:*\n\n' +
                      '/start - Open the dashboard\n' +
                      '/help - Show this help message';
        
        if (adminAuth.isAuthorized(userId)) {
            helpText += '\n/admin - Access admin panel';
        }

        bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
    });

    // /admin command - Admin Panel
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

    // Handle callback queries (button clicks)
    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const userId = query.from.id;
        const data = query.data;
        const messageId = query.message.message_id;

        // Check authorization for admin callbacks
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
                const currentUrl = adminPanel.getCurrentAppUrl();
                bot.editMessageText(
                    `🔗 *Current App URL*\n\n\`${currentUrl}\`\n\n` +
                    `This is the URL users access when they open your mini app.`,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown',
                        ...adminPanel.getBackButton()
                    }
                );
                break;

            case 'admin_change_url':
                userStates.set(userId, 'awaiting_url');
                bot.editMessageText(
                    '✏️ *Change App URL*\n\n' +
                    'Please send the new HTTPS URL for your mini app.\n\n' +
                    'Example: `https://abc123.ngrok.io`\n\n' +
                    'Send /cancel to abort.',
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown'
                    }
                );
                break;

            case 'admin_api_info':
                bot.editMessageText(
                    adminPanel.getApiInfo(),
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown',
                        ...adminPanel.getBackButton()
                    }
                );
                break;

            case 'admin_setup_guide':
                bot.editMessageText(
                    adminPanel.getSetupGuide(),
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown',
                        ...adminPanel.getBackButton()
                    }
                );
                break;

            case 'admin_whitelist':
                const authorizedUsers = adminAuth.getAuthorizedUsers();
                bot.editMessageText(
                    adminPanel.getWhitelistInfo(authorizedUsers),
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown',
                        ...adminPanel.getBackButton()
                    }
                );
                break;

            case 'admin_close':
                bot.deleteMessage(chatId, messageId);
                break;
        }
    });

    // Handle text messages (for URL updates, etc.)
    bot.on('message', (msg) => {
        // Ignore commands
        if (msg.text && msg.text.startsWith('/')) {
            if (msg.text === '/cancel') {
                const userId = msg.from.id;
                if (userStates.has(userId)) {
                    userStates.delete(userId);
                    bot.sendMessage(msg.chat.id, '❌ Operation cancelled.');
                }
            }
            return;
        }

        const userId = msg.from.id;
        const chatId = msg.chat.id;
        const state = userStates.get(userId);

        if (state === 'awaiting_url') {
            const newUrl = msg.text.trim();
            
            // Validate URL
            if (!newUrl.startsWith('http://') && !newUrl.startsWith('https://')) {
                bot.sendMessage(
                    chatId,
                    '⚠️ Invalid URL format. Please provide a valid HTTP/HTTPS URL.\n\n' +
                    'Send /cancel to abort.'
                );
                return;
            }

            const success = adminPanel.updateAppUrl(newUrl);
            
            if (success) {
                bot.sendMessage(
                    chatId,
                    `✅ *App URL Updated Successfully*\n\n` +
                    `New URL: \`${newUrl}\`\n\n` +
                    `⚠️ *Important:* Please restart the bot for changes to take effect.\n` +
                    `You may also need to update the URL in @BotFather.`,
                    { parse_mode: 'Markdown' }
                );
            } else {
                bot.sendMessage(
                    chatId,
                    '❌ Failed to update URL. Please check file permissions and try again.'
                );
            }
            
            userStates.delete(userId);
            
            // Send admin menu again
            setTimeout(() => sendAdminMenu(chatId), 1000);
            return;
        }

        // Default behavior for non-admin users
        if (!state) {
            bot.sendMessage(
                chatId,
                'Use /start to open the dashboard or /help for available commands.'
            );
        }
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

function sendAdminMenu(chatId, messageId = null) {
    const menuText = '🔧 *Admin Panel*\n\n' +
                    'Welcome to the admin panel. Select an option below:';

    if (messageId) {
        bot.editMessageText(menuText, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            ...adminPanel.getMainMenu()
        });
    } else {
        bot.sendMessage(chatId, menuText, {
            parse_mode: 'Markdown',
            ...adminPanel.getMainMenu()
        });
    }
}

function getBot() {
    return bot;
}

module.exports = { initBot, getBot };


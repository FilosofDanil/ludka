const TelegramBot = require('node-telegram-bot-api');
const adminAuth = require('./adminAuth');
const adminPanel = require('./adminPanel');
const userBalance = require('./userBalance');
const depositCharges = require('./depositCharges');
const withdrawals = require('./withdrawals');

let bot = null;
const userStates = new Map();

async function refundStarPayment(userId, chargeId) {
    const token = process.env.BOT_TOKEN;
    const url = `https://api.telegram.org/bot${token}/refundStarPayment`;
    const numericUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: numericUserId, telegram_payment_charge_id: chargeId })
    });
    const data = await res.json();
    return data.ok === true;
}

function initBot() {
    const token = process.env.BOT_TOKEN;

    if (!token) {
        console.error('BOT_TOKEN is required');
        return;
    }

    bot = new TelegramBot(token, { polling: true });

    // /start command
    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        const userName = msg.from.first_name || 'User';
        const webAppUrl = process.env.WEB_APP_URL;

        bot.sendMessage(
            chatId,
            `Welcome to Ludik Casino, ${userName}! \n\n` +
            `Roll the dice, place your bets, and test your luck!\n\n` +
            `Add playing scores with Telegram Stars (1 Star = 1,000 scores) via /deposit or in the app. Tap below to play!`,
            {
                reply_markup: {
                    inline_keyboard: [[
                        { text: 'Play Dice Game', web_app: { url: webAppUrl || 'https://example.com' } }
                    ]]
                }
            }
        );
    });

    // /balance command
    bot.onText(/\/balance/, (msg) => {
        const userId = String(msg.from.id);
        const balance = userBalance.getBalance(userId);
        bot.sendMessage(
            msg.chat.id,
            `Your balance: *${balance.toFixed(2)}* coins`,
            { parse_mode: 'Markdown' }
        );
    });

    // /help command
    bot.onText(/\/help/, (msg) => {
        let helpText = '*Ludik Casino — Commands:*\n\n' +
                      '/start - Open the dice game\n' +
                      '/balance - Check your balance\n' +
                      '/deposit - Add playing scores with Telegram Stars\n' +
                      '/withdraw - Request Stars withdrawal (1 Star = 1,000 scores)\n' +
                      '/help - Show this help message';

        if (adminAuth.isAuthorized(msg.from.id)) {
            helpText += '\n/admin - Access admin panel\n' +
                '/requests - Pending withdrawals\n' +
                '/confirm id - Approve withdrawal\n' +
                '/confirmall - Approve all\n' +
                '/decline id - Reject withdrawal\n' +
                '/declineall - Reject all';
        }

        bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'Markdown' });
    });

    // /deposit command — inline keyboard to choose Star amount (1 Star = 1000 scores)
    bot.onText(/\/deposit/, (msg) => {
        const chatId = msg.chat.id;
        bot.sendMessage(
            chatId,
            '*Add playing scores with Telegram Stars*\n\n1 Star = 1,000 playing scores. Choose an amount:',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '1 Star → 1,000 scores', callback_data: 'deposit_1' },
                            { text: '5 Stars → 5,000 scores', callback_data: 'deposit_5' }
                        ],
                        [
                            { text: '10 Stars → 10,000 scores', callback_data: 'deposit_10' },
                            { text: '50 Stars → 50,000 scores', callback_data: 'deposit_50' }
                        ]
                    ]
                }
            }
        );
    });

    // /withdraw command — convert scores to Stars (1 Star = 1000 scores), creates pending request
    bot.onText(/\/withdraw/, (msg) => {
        const chatId = msg.chat.id;
        bot.sendMessage(
            chatId,
            '*Withdraw playing scores as Telegram Stars*\n\n1 Star = 1,000 scores. Choose amount (admin will process the request):',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '1 Star ← 1,000 scores', callback_data: 'withdraw_1' },
                            { text: '5 Stars ← 5,000 scores', callback_data: 'withdraw_5' }
                        ],
                        [
                            { text: '10 Stars ← 10,000 scores', callback_data: 'withdraw_10' },
                            { text: '50 Stars ← 50,000 scores', callback_data: 'withdraw_50' }
                        ]
                    ]
                }
            }
        );
    });

    // /admin command
    bot.onText(/\/admin/, (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;

        if (!adminAuth.isAuthorized(userId)) {
            bot.sendMessage(
                chatId,
                '*Access Denied*\n\n' +
                'You do not have permission to access the admin panel.\n\n' +
                `Your Telegram ID: \`${userId}\`\n\n` +
                'Contact the administrator to get access.',
                { parse_mode: 'Markdown' }
            );
            return;
        }

        sendAdminMenu(chatId);
    });

    // /requests — admin: list pending withdrawal requests
    bot.onText(/\/requests?/, (msg) => {
        const chatId = msg.chat.id;
        if (!adminAuth.isAuthorized(msg.from.id)) {
            bot.sendMessage(chatId, 'Access denied.');
            return;
        }
        const pending = withdrawals.getPendingRequests();
        if (pending.length === 0) {
            bot.sendMessage(chatId, '*No pending withdrawal requests.*', { parse_mode: 'Markdown' });
            return;
        }
        const lines = pending.map(r =>
            `#${r.id} | User \`${r.userId}\` | ${r.starAmount} Stars | ${r.scoreAmount} scores | ${new Date(r.createdAt).toLocaleString()}`
        );
        bot.sendMessage(
            chatId,
            '*Pending withdrawal requests:*\n\n' + lines.join('\n') + '\n\nUse /confirm id or /confirmall to approve, /decline id or /declineall to reject.',
            { parse_mode: 'Markdown' }
        );
    });

    // /confirm <id> — admin: approve one withdrawal (refund Stars to user)
    bot.onText(/\/confirm\s+(\d+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        if (!adminAuth.isAuthorized(msg.from.id)) {
            bot.sendMessage(chatId, 'Access denied.');
            return;
        }
        const id = parseInt(match[1], 10);
        const request = withdrawals.getRequest(id);
        if (!request || request.status !== 'pending') {
            bot.sendMessage(chatId, `Request #${id} not found or already processed.`);
            return;
        }
        const charges = depositCharges.findUnusedCharges(request.userId, request.starAmount);
        if (!charges || charges.length === 0) {
            bot.sendMessage(chatId, `Cannot confirm #${id}: no refundable charges for this user.`);
            return;
        }
        let ok = true;
        for (const c of charges) {
            const success = await refundStarPayment(request.userId, c.chargeId);
            if (!success) {
                ok = false;
                console.error('refundStarPayment failed for charge', c.chargeId);
            }
        }
        if (!ok) {
            bot.sendMessage(chatId, `Request #${id}: one or more refunds failed. Check logs.`);
            return;
        }
        depositCharges.markUsed(charges.map(c => c.chargeId));
        withdrawals.confirmRequest(id, charges.map(c => c.chargeId));
        if (request.chatId) {
            bot.sendMessage(request.chatId, `Withdrawal request #${id} approved! ${request.starAmount} Star(s) have been sent to your account.`, { parse_mode: 'Markdown' });
        }
        bot.sendMessage(chatId, `Request #${id} confirmed. User received ${request.starAmount} Stars.`);
    });

    // /confirmall — admin: approve all pending
    bot.onText(/\/confirmall/, async (msg) => {
        const chatId = msg.chat.id;
        if (!adminAuth.isAuthorized(msg.from.id)) {
            bot.sendMessage(chatId, 'Access denied.');
            return;
        }
        const pending = withdrawals.getPendingRequests();
        if (pending.length === 0) {
            bot.sendMessage(chatId, 'No pending requests.');
            return;
        }
        let done = 0;
        for (const request of pending) {
            const charges = depositCharges.findUnusedCharges(request.userId, request.starAmount);
            if (!charges || charges.length === 0) continue;
            let ok = true;
            for (const c of charges) {
                if (!(await refundStarPayment(request.userId, c.chargeId))) ok = false;
            }
            if (ok) {
                depositCharges.markUsed(charges.map(c => c.chargeId));
                withdrawals.confirmRequest(request.id, charges.map(c => c.chargeId));
                if (request.chatId) {
                    bot.sendMessage(request.chatId, `Withdrawal #${request.id} approved! ${request.starAmount} Star(s) sent.`, { parse_mode: 'Markdown' });
                }
                done++;
            }
        }
        bot.sendMessage(chatId, `Processed ${done} of ${pending.length} request(s).`);
    });

    // /decline <id> — admin: reject one, refund scores to user
    bot.onText(/\/decline\s+(\d+)/, (msg, match) => {
        const chatId = msg.chat.id;
        if (!adminAuth.isAuthorized(msg.from.id)) {
            bot.sendMessage(chatId, 'Access denied.');
            return;
        }
        const id = parseInt(match[1], 10);
        const request = withdrawals.getRequest(id);
        if (!request || request.status !== 'pending') {
            bot.sendMessage(chatId, `Request #${id} not found or already processed.`);
            return;
        }
        userBalance.refundWithdrawal(request.userId, request.scoreAmount);
        withdrawals.declineRequest(id);
        if (request.chatId) {
            bot.sendMessage(request.chatId, `Withdrawal request #${id} was declined. ${request.scoreAmount} scores have been returned to your balance.`, { parse_mode: 'Markdown' });
        }
        bot.sendMessage(chatId, `Request #${id} declined. Scores refunded to user.`);
    });

    // /declineall — admin: reject all pending
    bot.onText(/\/declineall/, (msg) => {
        const chatId = msg.chat.id;
        if (!adminAuth.isAuthorized(msg.from.id)) {
            bot.sendMessage(chatId, 'Access denied.');
            return;
        }
        const pending = withdrawals.getPendingRequests();
        for (const request of pending) {
            userBalance.refundWithdrawal(request.userId, request.scoreAmount);
            withdrawals.declineRequest(request.id);
            if (request.chatId) {
                bot.sendMessage(request.chatId, `Withdrawal request #${request.id} was declined. ${request.scoreAmount} scores returned.`, { parse_mode: 'Markdown' });
            }
        }
        bot.sendMessage(chatId, pending.length ? `Declined ${pending.length} request(s).` : 'No pending requests.');
    });

    // Callback queries
    bot.on('callback_query', (query) => {
        const chatId = query.message.chat.id;
        const userId = query.from.id;
        const data = query.data;
        const messageId = query.message.message_id;

        if (data.startsWith('admin_') && !adminAuth.isAuthorized(userId)) {
            bot.answerCallbackQuery(query.id, { text: 'Access denied' });
            return;
        }

        bot.answerCallbackQuery(query.id);

        // Deposit option: send Telegram Stars invoice (XTR, no provider token)
        if (data.startsWith('deposit_')) {
            const starAmount = parseInt(data.replace('deposit_', ''), 10);
            if (starAmount >= 1) {
                const title = 'Ludik Casino Deposit';
                const description = `${starAmount * 1000} playing scores`;
                const payload = JSON.stringify({ userId: String(userId), starAmount, ts: Date.now() });
                const currency = 'XTR';
                const prices = [{ label: 'Deposit', amount: starAmount }];
                bot.sendInvoice(chatId, title, description, payload, undefined, currency, prices)
                    .catch((err) => {
                        console.error('sendInvoice error:', err);
                        bot.sendMessage(chatId, 'Failed to create invoice. Please try again.');
                    });
            }
            return;
        }

        // Withdraw option: validate balance and charges, deduct, create request
        if (data.startsWith('withdraw_')) {
            const starAmount = parseInt(data.replace('withdraw_', ''), 10);
            const uid = String(userId);
            const scoreAmount = starAmount * 1000;
            if (starAmount < 1) return;
            const balance = userBalance.getBalance(uid);
            if (balance < scoreAmount) {
                bot.sendMessage(chatId, `Insufficient balance. You have ${balance.toFixed(0)} scores; need ${scoreAmount} for ${starAmount} Star(s).`);
                return;
            }
            const charges = depositCharges.findUnusedCharges(uid, starAmount);
            if (!charges) {
                bot.sendMessage(chatId, `Not enough deposit history to withdraw ${starAmount} Star(s). You can only withdraw Stars you have previously deposited.`);
                return;
            }
            const deductResult = userBalance.deductWithdrawal(uid, scoreAmount);
            if (!deductResult.success) {
                bot.sendMessage(chatId, deductResult.error || 'Withdrawal failed.');
                return;
            }
            const request = withdrawals.createRequest(uid, chatId, starAmount, scoreAmount);
            bot.sendMessage(
                chatId,
                `Withdrawal request *#${request.id}* created for *${starAmount}* Star(s). An admin will review it shortly.`,
                { parse_mode: 'Markdown' }
            );
            return;
        }

        switch (data) {
            case 'admin_main':
                sendAdminMenu(chatId, messageId);
                break;

            case 'admin_view_url':
                bot.editMessageText(
                    `*Current App URL*\n\n\`${adminPanel.getCurrentAppUrl()}\`\n\n` +
                    `This is the URL users access when they open your mini app.`,
                    { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', ...adminPanel.getBackButton() }
                );
                break;

            case 'admin_change_url':
                userStates.set(userId, 'awaiting_url');
                bot.editMessageText(
                    '*Change App URL*\n\n' +
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

    // Telegram Stars payment: pre-checkout (approve so user can complete payment)
    bot.on('pre_checkout_query', (query) => {
        bot.answerPreCheckoutQuery(query.id, true).catch((err) => console.error('answerPreCheckoutQuery error:', err));
    });

    // Telegram Stars payment: successful payment — credit balance (1 Star = 1000 scores), store charge for withdrawals
    bot.on('message', (msg) => {
        if (msg.successful_payment) {
            const payment = msg.successful_payment;
            try {
                const payload = JSON.parse(payment.invoice_payload);
                const { userId, starAmount } = payload;
                const stars = starAmount || payment.total_amount || 0;
                const scoreAmount = stars * 1000;
                const chargeId = payment.telegram_payment_charge_id;
                if (userId && scoreAmount > 0) {
                    userBalance.addDeposit(String(userId), scoreAmount);
                    if (chargeId) depositCharges.addCharge(String(userId), chargeId, stars);
                    bot.sendMessage(
                        msg.chat.id,
                        `Deposit successful! +${scoreAmount.toLocaleString()} playing scores added.`,
                        { parse_mode: 'Markdown' }
                    );
                }
            } catch (e) {
                console.error('Process successful_payment error:', e);
            }
            return;
        }

        if (msg.text && msg.text.startsWith('/')) {
            if (msg.text === '/cancel' && userStates.has(msg.from.id)) {
                userStates.delete(msg.from.id);
                bot.sendMessage(msg.chat.id, 'Operation cancelled.');
            }
            return;
        }

        const userId = msg.from.id;
        const chatId = msg.chat.id;
        const state = userStates.get(userId);

        if (state === 'awaiting_url') {
            const newUrl = msg.text.trim();

            if (!newUrl.startsWith('http://') && !newUrl.startsWith('https://')) {
                bot.sendMessage(chatId, 'Invalid URL format. Please provide a valid HTTP/HTTPS URL.\n\nSend /cancel to abort.');
                return;
            }

            if (adminPanel.updateAppUrl(newUrl)) {
                bot.sendMessage(
                    chatId,
                    `*App URL Updated Successfully*\n\n` +
                    `New URL: \`${newUrl}\`\n\n` +
                    `*Important:* Please restart the bot for changes to take effect.\n` +
                    `You may also need to update the URL in @BotFather.`,
                    { parse_mode: 'Markdown' }
                );
            } else {
                bot.sendMessage(chatId, 'Failed to update URL. Please check file permissions and try again.');
            }

            userStates.delete(userId);
            setTimeout(() => sendAdminMenu(chatId), 1000);
            return;
        }

        if (!state) {
            bot.sendMessage(chatId, 'Use /start to play or /help for available commands.');
        }
    });

    // Web App data handler
    bot.on('web_app_data', (msg) => {
        const data = JSON.parse(msg.web_app_data.data);
        console.log('Received Web App data:', data);
        bot.sendMessage(msg.chat.id, `Data received!\n\n${JSON.stringify(data, null, 2)}`);
    });

    console.log('Telegram bot initialized successfully');
}

function sendAdminMenu(chatId, messageId = null) {
    const menuText = '*Admin Panel*\n\nWelcome to the admin panel. Select an option below:';
    const options = { parse_mode: 'Markdown', ...adminPanel.getMainMenu() };

    if (messageId) {
        bot.editMessageText(menuText, { chat_id: chatId, message_id: messageId, ...options });
    } else {
        bot.sendMessage(chatId, menuText, options);
    }
}

function getBot() {
    return bot;
}

module.exports = { initBot, getBot };

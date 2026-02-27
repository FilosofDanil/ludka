require('dotenv').config();
const express = require('express');
const path = require('path');
const { initBot, getBot } = require('./bot');
const userBalance = require('./userBalance');
const diceGame = require('./games/dice');
const rouletteGame = require('./games/roulette');
const rouletteRound = require('./games/rouletteRound');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

// --- User Balance ---

app.get('/api/user/:userId/balance', (req, res) => {
    const { userId } = req.params;
    const balance = userBalance.getBalance(userId);
    res.json({ success: true, balance });
});

app.get('/api/user/:userId/history', (req, res) => {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    const history = userBalance.getHistory(userId, limit);
    res.json({ success: true, history });
});

// --- Deposit (Telegram Stars) ---
// 1 Telegram Star = 1000 playing scores. For XTR, provider_token is omitted.
app.post('/api/deposit/create-invoice', async (req, res) => {
    const { userId, starAmount } = req.body;
    const stars = typeof starAmount === 'number' ? starAmount : parseInt(starAmount, 10);
    if (!userId || !Number.isInteger(stars) || stars < 1) {
        return res.status(400).json({ success: false, error: 'userId and starAmount (positive integer) are required' });
    }
    const bot = getBot();
    if (!bot) {
        return res.status(503).json({ success: false, error: 'Payment service unavailable' });
    }
    try {
        const title = 'Ludik Casino Deposit';
        const description = `${stars * 1000} playing scores`;
        const payload = JSON.stringify({ userId, starAmount: stars, ts: Date.now() });
        const currency = 'XTR';
        const prices = [{ label: 'Deposit', amount: stars }];
        const invoiceUrl = await bot.createInvoiceLink(title, description, payload, undefined, currency, prices);
        res.json({ success: true, invoiceUrl });
    } catch (err) {
        console.error('Create invoice error:', err);
        res.status(500).json({ success: false, error: 'Failed to create invoice' });
    }
});

// --- Dice Game ---

app.get('/api/games/dice/info', (req, res) => {
    res.json({
        success: true,
        name: 'Dice',
        description: 'Roll the dice! Bet higher or lower than a target number.',
        houseEdge: diceGame.HOUSE_EDGE,
        diceMin: diceGame.DICE_MIN,
        diceMax: diceGame.DICE_MAX,
        betOptions: diceGame.getBetOptions()
    });
});

app.post('/api/games/dice/bet', (req, res) => {
    const { userId, betAmount, target, direction } = req.body;

    if (!userId) {
        return res.status(400).json({ success: false, error: 'userId is required' });
    }

    const amount = parseFloat(betAmount);
    if (isNaN(amount) || amount <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid bet amount' });
    }

    // Check and deduct balance
    const deductResult = userBalance.deductBet(userId, amount);
    if (!deductResult.success) {
        return res.status(400).json(deductResult);
    }

    // Play the dice game
    const result = diceGame.play(amount, target, direction);

    if (!result.success) {
        // Refund the bet if the game logic fails
        userBalance.addWinnings(userId, amount);
        return res.status(400).json(result);
    }

    // Add winnings if won
    if (result.won) {
        userBalance.addWinnings(userId, result.payout);
    }

    const finalBalance = userBalance.getBalance(userId);

    // Record history
    userBalance.addHistoryEntry(userId, {
        game: 'dice',
        betAmount: amount,
        target: result.target,
        direction: result.direction,
        roll: result.roll,
        won: result.won,
        coefficient: result.coefficient,
        payout: result.payout,
        profit: result.profit,
        balanceAfter: finalBalance
    });

    res.json({
        ...result,
        balance: finalBalance
    });
});

// --- Roulette — static info ---

app.get('/api/games/roulette/info', (req, res) => {
    res.json({
        success: true,
        name: 'Roulette',
        description: 'European roulette — place your bets and spin the wheel!',
        betTypes: rouletteGame.getBetInfo(),
        redNumbers: [...rouletteGame.RED_NUMBERS],
        blackNumbers: [...rouletteGame.BLACK_NUMBERS]
    });
});

// --- Roulette — Server-Side Round (SSE + API) ---

/**
 * SSE stream — pushes round state on every phase change.
 * Client calculates local countdown from phaseRemainingMs.
 */
app.get('/api/games/roulette/events', (req, res) => {
    res.writeHead(200, {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
    });

    // Immediately send current state so late-joiners sync up
    const sendState = (state) => {
        res.write(`data: ${JSON.stringify(state)}\n\n`);
    };
    sendState(rouletteRound.getState());

    // Forward every phase-change event
    const onStateChange = (state) => sendState(state);
    rouletteRound.on('stateChange', onStateChange);

    // Keep-alive ping every 25 s to prevent proxy timeouts
    const keepAlive = setInterval(() => {
        res.write(': keep-alive\n\n');
    }, 25000);

    req.on('close', () => {
        rouletteRound.removeListener('stateChange', onStateChange);
        clearInterval(keepAlive);
    });
});

/** Snapshot of current round (for non-SSE fallback / page load). */
app.get('/api/games/roulette/state', (req, res) => {
    res.json({ success: true, ...rouletteRound.getState() });
});

/** Place a single bet (deducted immediately). */
app.post('/api/games/roulette/place-bet', (req, res) => {
    const { userId, roundId, betType, betNumber, betAmount } = req.body;
    if (!userId) return res.status(400).json({ success: false, error: 'userId is required' });

    const result = rouletteRound.placeBet(userId, roundId, betType, betNumber, betAmount);
    if (!result.success) return res.status(400).json(result);
    res.json(result);
});

/** Remove a specific bet by betKey. */
app.post('/api/games/roulette/remove-bet', (req, res) => {
    const { userId, roundId, betKey } = req.body;
    if (!userId) return res.status(400).json({ success: false, error: 'userId is required' });

    const result = rouletteRound.removeBet(userId, roundId, betKey);
    if (!result.success) return res.status(400).json(result);
    res.json(result);
});

/** Clear all bets for the current round (full refund). */
app.post('/api/games/roulette/clear-bets', (req, res) => {
    const { userId, roundId } = req.body;
    if (!userId) return res.status(400).json({ success: false, error: 'userId is required' });

    const result = rouletteRound.clearBets(userId, roundId);
    if (!result.success) return res.status(400).json(result);
    res.json(result);
});

/** Get the user's pending bets for a round (e.g. after page reload). */
app.get('/api/games/roulette/my-bets', (req, res) => {
    const { userId, roundId } = req.query;
    if (!userId) return res.status(400).json({ success: false, error: 'userId is required' });

    const bets = rouletteRound.getUserBets(userId, roundId ? parseInt(roundId) : undefined);
    res.json({ success: true, roundId: rouletteRound.roundId, bets });
});

/** Get the user's result for a settled round. */
app.get('/api/games/roulette/my-result', (req, res) => {
    const { userId, roundId } = req.query;
    if (!userId) return res.status(400).json({ success: false, error: 'userId is required' });

    const result = rouletteRound.getUserRoundResult(
        userId, roundId ? parseInt(roundId) : undefined
    );
    res.json({ success: true, result });
});

// --- Legacy form submit (kept for compatibility) ---

app.post('/api/submit', (req, res) => {
    const { name, email, message } = req.body;
    console.log('Form submission received:', { name, email, message });
    res.json({ success: true, message: 'Data received successfully', data: { name, email, message } });
});

// Start server
app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);

    // Start the roulette round manager immediately
    rouletteRound.start(userBalance);

    // Start ngrok tunnel
    if (process.env.NGROK_AUTHTOKEN) {
        try {
            const ngrok = require('@ngrok/ngrok');
            const listener = await ngrok.connect({
                addr: PORT,
                authtoken: process.env.NGROK_AUTHTOKEN
            });
            const publicUrl = listener.url();
            console.log(`\n========================================`);
            console.log(`  Ngrok tunnel established!`);
            console.log(`  Public URL: ${publicUrl}`);
            console.log(`========================================\n`);

            // Update WEB_APP_URL for the bot
            process.env.WEB_APP_URL = publicUrl;
        } catch (err) {
            console.error('Failed to start ngrok tunnel:', err.message);
        }
    } else {
        console.warn('NGROK_AUTHTOKEN not set. Ngrok tunnel is disabled.');
    }

    if (process.env.BOT_TOKEN) {
        initBot();
    } else {
        console.warn('BOT_TOKEN not set. Telegram bot is disabled.');
    }
});

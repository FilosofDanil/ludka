require('dotenv').config();
const express = require('express');
const path = require('path');
const { initBot } = require('./bot');
const userBalance = require('./userBalance');
const diceGame = require('./games/dice');

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

app.post('/api/user/:userId/reset', (req, res) => {
    const { userId } = req.params;
    const result = userBalance.resetBalance(userId);
    res.json(result);
});

app.get('/api/user/:userId/history', (req, res) => {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    const history = userBalance.getHistory(userId, limit);
    res.json({ success: true, history });
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

// --- Legacy form submit (kept for compatibility) ---

app.post('/api/submit', (req, res) => {
    const { name, email, message } = req.body;
    console.log('Form submission received:', { name, email, message });
    res.json({ success: true, message: 'Data received successfully', data: { name, email, message } });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);

    if (process.env.BOT_TOKEN) {
        initBot();
    } else {
        console.warn('BOT_TOKEN not set. Telegram bot is disabled.');
    }
});

require('dotenv').config();
const express = require('express');
const path = require('path');
const { initBot } = require('./bot');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

app.post('/api/submit', (req, res) => {
    const { name, email, message } = req.body;
    console.log('Form submission received:', { name, email, message });
    res.json({ success: true, message: 'Data received successfully', data: { name, email, message } });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);

    if (process.env.BOT_TOKEN) {
        initBot();
    } else {
        console.warn('BOT_TOKEN not set. Telegram bot is disabled.');
    }
});

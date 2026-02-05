require('dotenv').config();
const express = require('express');
const path = require('path');
const { initBot } = require('./bot');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

// Example API endpoint for form submission
app.post('/api/submit', (req, res) => {
    const { name, email, message } = req.body;
    
    console.log('Form submission received:', { name, email, message });
    
    // Here you can process the data (save to DB, send notifications, etc.)
    res.json({ 
        success: true, 
        message: 'Data received successfully',
        data: { name, email, message }
    });
});

// Serve the main app
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Dashboard available at http://localhost:${PORT}`);
    
    // Initialize Telegram bot
    if (process.env.BOT_TOKEN) {
        initBot();
    } else {
        console.warn('BOT_TOKEN not set. Telegram bot is disabled.');
    }
});

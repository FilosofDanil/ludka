const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env');

class AdminPanel {
    getMainMenu() {
        return {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔗 View App URL', callback_data: 'admin_view_url' }],
                    [{ text: '✏️ Change App URL', callback_data: 'admin_change_url' }],
                    [{ text: '📡 API Endpoints', callback_data: 'admin_api_info' }],
                    [{ text: '📚 Setup Guide', callback_data: 'admin_setup_guide' }],
                    [{ text: '👥 Manage Whitelist', callback_data: 'admin_whitelist' }],
                    [{ text: '❌ Close', callback_data: 'admin_close' }]
                ]
            }
        };
    }

    getBackButton() {
        return {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔙 Back to Admin Menu', callback_data: 'admin_main' }]
                ]
            }
        };
    }

    getCurrentAppUrl() {
        try {
            const envContent = fs.readFileSync(envPath, 'utf8');
            const match = envContent.match(/WEB_APP_URL=(.+)/);
            return match ? match[1].trim() : 'Not set';
        } catch (error) {
            return 'Error reading .env file';
        }
    }

    updateAppUrl(newUrl) {
        try {
            let envContent = fs.readFileSync(envPath, 'utf8');
            
            if (envContent.includes('WEB_APP_URL=')) {
                envContent = envContent.replace(/WEB_APP_URL=.*/g, `WEB_APP_URL=${newUrl}`);
            } else {
                envContent += `\nWEB_APP_URL=${newUrl}`;
            }
            
            fs.writeFileSync(envPath, envContent);
            
            // Update environment variable
            process.env.WEB_APP_URL = newUrl;
            
            return true;
        } catch (error) {
            console.error('Error updating .env:', error);
            return false;
        }
    }

    getApiInfo() {
        const port = process.env.PORT || 3000;
        const currentUrl = this.getCurrentAppUrl();
        
        return `📡 *API Endpoints Information*\n\n` +
               `*Base URL:* \`${currentUrl}\`\n\n` +
               `*Available Endpoints:*\n\n` +
               `1️⃣ *Health Check*\n` +
               `   GET \`/api/health\`\n` +
               `   Returns server status\n\n` +
               `2️⃣ *Form Submission*\n` +
               `   POST \`/api/submit\`\n` +
               `   Body: \`{ "name": "...", "email": "...", "message": "..." }\`\n` +
               `   Returns: \`{ "success": true, "data": {...} }\`\n\n` +
               `3️⃣ *Frontend*\n` +
               `   GET \`/\`\n` +
               `   Serves the dashboard HTML\n\n` +
               `*Local Server:* \`http://localhost:${port}\`\n` +
               `*Public URL:* \`${currentUrl}\``;
    }

    getSetupGuide() {
        return `📚 *Setup & Launch Guide*\n\n` +
               `*Prerequisites:*\n` +
               `✅ Node.js installed\n` +
               `✅ ngrok installed (for HTTPS)\n` +
               `✅ Bot token from @BotFather\n\n` +
               `*Quick Launch:*\n\n` +
               `1️⃣ *Windows:*\n` +
               `   Run \`start.cmd\` or \`start.ps1\`\n\n` +
               `2️⃣ *Linux/Mac:*\n` +
               `   Run \`./start.sh\`\n\n` +
               `3️⃣ Copy the ngrok HTTPS URL\n\n` +
               `4️⃣ Use /admin to update the URL\n\n` +
               `5️⃣ Restart the bot\n\n` +
               `*Manual Launch:*\n` +
               `\`\`\`\n` +
               `npm install\n` +
               `npm start\n` +
               `# In another terminal:\n` +
               `ngrok http 3000\n` +
               `\`\`\`\n\n` +
               `*Configure @BotFather:*\n` +
               `• Send /mybots → Your Bot\n` +
               `• Bot Settings → Menu Button\n` +
               `• Set URL to your ngrok URL\n\n` +
               `*Environment Variables:*\n` +
               `• \`BOT_TOKEN\` - Your bot token\n` +
               `• \`WEB_APP_URL\` - Public HTTPS URL\n` +
               `• \`PORT\` - Server port (default: 3000)`;
    }

    getWhitelistInfo(authorizedUsers) {
        const usersList = authorizedUsers.length > 0 
            ? authorizedUsers.map(id => `• \`${id}\``).join('\n')
            : '• No users in whitelist';

        return `👥 *Whitelist Management*\n\n` +
               `*Authorized Users:*\n${usersList}\n\n` +
               `*To add a user:*\n` +
               `1. Get their Telegram ID\n` +
               `2. Edit \`whitelist.json\`\n` +
               `3. Add ID to authorizedUsers array\n` +
               `4. Save and reload bot\n\n` +
               `*Note:* Changes require bot restart to take effect.`;
    }
}

module.exports = new AdminPanel();

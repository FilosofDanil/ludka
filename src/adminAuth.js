const fs = require('fs');
const path = require('path');

const whitelistPath = path.join(__dirname, '../whitelist.json');

class AdminAuth {
    constructor() {
        this.loadWhitelist();
    }

    loadWhitelist() {
        try {
            const data = fs.readFileSync(whitelistPath, 'utf8');
            const parsed = JSON.parse(data);
            this.authorizedUsers = new Set(parsed.authorizedUsers || []);
        } catch (error) {
            console.error('Failed to load whitelist.json:', error.message);
            this.authorizedUsers = new Set();
        }
    }

    isAuthorized(userId) {
        return this.authorizedUsers.has(userId);
    }

    addUser(userId) {
        this.authorizedUsers.add(userId);
        this.saveWhitelist();
    }

    removeUser(userId) {
        this.authorizedUsers.delete(userId);
        this.saveWhitelist();
    }

    saveWhitelist() {
        try {
            const data = {
                authorizedUsers: Array.from(this.authorizedUsers),
                description: "Add Telegram user IDs that are allowed to access the admin panel"
            };
            fs.writeFileSync(whitelistPath, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Failed to save whitelist.json:', error.message);
        }
    }

    getAuthorizedUsers() {
        return Array.from(this.authorizedUsers);
    }
}

module.exports = new AdminAuth();

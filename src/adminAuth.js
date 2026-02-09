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

    getAuthorizedUsers() {
        return Array.from(this.authorizedUsers);
    }
}

module.exports = new AdminAuth();

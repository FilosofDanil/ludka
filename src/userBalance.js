/**
 * In-memory user balance management.
 * In production, replace with a proper database.
 */

const INITIAL_BALANCE = 0;

// Store: userId -> { balance, history[] }
const users = new Map();

function getOrCreateUser(userId) {
    if (!users.has(userId)) {
        users.set(userId, {
            balance: INITIAL_BALANCE,
            history: [],
            createdAt: Date.now()
        });
    }
    return users.get(userId);
}

function getBalance(userId) {
    const user = getOrCreateUser(userId);
    return user.balance;
}

function deductBet(userId, amount) {
    const user = getOrCreateUser(userId);
    if (amount <= 0) return { success: false, error: 'Bet must be positive' };
    if (amount > user.balance) return { success: false, error: 'Insufficient balance' };

    user.balance = Math.round((user.balance - amount) * 100) / 100;
    return { success: true, balance: user.balance };
}

function addWinnings(userId, amount) {
    const user = getOrCreateUser(userId);
    user.balance = Math.round((user.balance + amount) * 100) / 100;
    return { success: true, balance: user.balance };
}

function addDeposit(userId, amount) {
    const user = getOrCreateUser(userId);
    if (amount <= 0) return { success: false, error: 'Deposit amount must be positive' };
    user.balance = Math.round((user.balance + amount) * 100) / 100;
    addHistoryEntry(userId, { type: 'deposit', amount, balanceAfter: user.balance });
    return { success: true, balance: user.balance };
}

function deductWithdrawal(userId, amount) {
    const user = getOrCreateUser(userId);
    if (amount <= 0) return { success: false, error: 'Withdrawal amount must be positive' };
    if (amount > user.balance) return { success: false, error: 'Insufficient balance' };
    user.balance = Math.round((user.balance - amount) * 100) / 100;
    addHistoryEntry(userId, { type: 'withdrawal', amount, balanceAfter: user.balance });
    return { success: true, balance: user.balance };
}

function refundWithdrawal(userId, amount) {
    const user = getOrCreateUser(userId);
    if (amount <= 0) return { success: false, error: 'Refund amount must be positive' };
    user.balance = Math.round((user.balance + amount) * 100) / 100;
    addHistoryEntry(userId, { type: 'withdrawal_refund', amount, balanceAfter: user.balance });
    return { success: true, balance: user.balance };
}

function addHistoryEntry(userId, entry) {
    const user = getOrCreateUser(userId);
    user.history.unshift({
        ...entry,
        timestamp: Date.now()
    });
    // Keep last 50 entries
    if (user.history.length > 50) {
        user.history = user.history.slice(0, 50);
    }
}

function getHistory(userId, limit = 20) {
    const user = getOrCreateUser(userId);
    return user.history.slice(0, limit);
}

module.exports = {
    getBalance,
    deductBet,
    addWinnings,
    addDeposit,
    deductWithdrawal,
    refundWithdrawal,
    addHistoryEntry,
    getHistory,
    INITIAL_BALANCE
};

/**
 * In-memory withdrawal request store.
 * Request: { id, userId, chatId, starAmount, scoreAmount, status, chargeIds[], createdAt }
 * status: 'pending' | 'confirmed' | 'declined'
 */

let nextId = 1;
const requests = new Map();

function createRequest(userId, chatId, starAmount, scoreAmount) {
    const id = nextId++;
    const request = {
        id,
        userId: String(userId),
        chatId,
        starAmount,
        scoreAmount,
        status: 'pending',
        chargeIds: [],
        createdAt: Date.now()
    };
    requests.set(id, request);
    return request;
}

function getPendingRequests() {
    return Array.from(requests.values()).filter(r => r.status === 'pending');
}

function getRequest(id) {
    return requests.get(id) || null;
}

function confirmRequest(id, chargeIds = []) {
    const request = requests.get(id);
    if (!request) return null;
    request.status = 'confirmed';
    request.chargeIds = chargeIds;
    return request;
}

function declineRequest(id) {
    const request = requests.get(id);
    if (!request) return null;
    request.status = 'declined';
    return request;
}

function getUserRequests(userId, limit = 20) {
    const uid = String(userId);
    return Array.from(requests.values())
        .filter(r => r.userId === uid)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit);
}

module.exports = {
    createRequest,
    getPendingRequests,
    getRequest,
    confirmRequest,
    declineRequest,
    getUserRequests
};

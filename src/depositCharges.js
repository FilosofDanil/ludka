/**
 * Tracks Telegram payment charge IDs from successful Star deposits.
 * Used to refund (withdraw) Stars back to users via refundStarPayment.
 * userId -> [{ chargeId, starAmount, used }]
 */

const chargesByUser = new Map();

function addCharge(userId, chargeId, starAmount) {
    const uid = String(userId);
    if (!chargesByUser.has(uid)) {
        chargesByUser.set(uid, []);
    }
    chargesByUser.get(uid).push({
        chargeId,
        starAmount,
        used: false
    });
}

/**
 * Find unused charges for the user that sum to exactly totalStarsNeeded (for refund).
 * Returns array of { chargeId, starAmount } or null if no exact combination.
 * Uses greedy approach: sort descending, pick largest that fits.
 */
function findUnusedCharges(userId, totalStarsNeeded) {
    const uid = String(userId);
    const list = chargesByUser.get(uid);
    if (!list || totalStarsNeeded <= 0) return null;

    const unused = list.filter(c => !c.used).map(c => ({ ...c }));
    if (unused.length === 0) return null;

    unused.sort((a, b) => b.starAmount - a.starAmount);
    const result = [];
    let remain = totalStarsNeeded;
    for (const c of unused) {
        if (c.starAmount <= remain) {
            result.push({ chargeId: c.chargeId, starAmount: c.starAmount });
            remain -= c.starAmount;
            if (remain === 0) return result;
        }
    }
    return null;
}

/**
 * Get total unused star amount for a user (for validation before creating request).
 */
function getUnusedStarsTotal(userId) {
    const uid = String(userId);
    const list = chargesByUser.get(uid);
    if (!list) return 0;
    return list.filter(c => !c.used).reduce((s, c) => s + c.starAmount, 0);
}

/**
 * Mark charges as used (by chargeId). Used when a withdrawal is confirmed.
 */
function markUsed(chargeIds) {
    const idSet = new Set(chargeIds);
    for (const list of chargesByUser.values()) {
        for (const c of list) {
            if (idSet.has(c.chargeId)) c.used = true;
        }
    }
}

module.exports = {
    addCharge,
    findUnusedCharges,
    getUnusedStarsTotal,
    markUsed
};

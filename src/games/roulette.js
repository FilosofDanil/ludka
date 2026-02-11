/**
 * Roulette Game Module
 * 
 * European roulette (single zero, numbers 0-36).
 * 
 * Bet types:
 *   - straight:  Single number (0-36)        → 35:1
 *   - red/black: Color bet                   → 1:1
 *   - odd/even:  Parity bet                  → 1:1
 *   - high/low:  1-18 or 19-36               → 1:1
 *   - dozen:     1-12, 13-24, or 25-36       → 2:1
 *   - column:    Column 1, 2, or 3           → 2:1
 * 
 * House edge comes from the 0 pocket (~2.7% European).
 */

const NUMBERS = Array.from({ length: 37 }, (_, i) => i); // 0..36

const RED_NUMBERS = new Set([
    1, 3, 5, 7, 9, 12, 14, 16, 18,
    19, 21, 23, 25, 27, 30, 32, 34, 36
]);

const BLACK_NUMBERS = new Set([
    2, 4, 6, 8, 10, 11, 13, 15, 17,
    20, 22, 24, 26, 28, 29, 31, 33, 35
]);

/**
 * Get the color of a roulette number.
 * @param {number} n
 * @returns {'red'|'black'|'green'}
 */
function getColor(n) {
    if (n === 0) return 'green';
    if (RED_NUMBERS.has(n)) return 'red';
    return 'black';
}

/**
 * Get column for a number (1-based). 0 has no column.
 * Column 1: 1,4,7,10,...,34
 * Column 2: 2,5,8,11,...,35
 * Column 3: 3,6,9,12,...,36
 */
function getColumn(n) {
    if (n === 0) return 0;
    return ((n - 1) % 3) + 1;
}

/**
 * Get dozen for a number. 0 has no dozen.
 */
function getDozen(n) {
    if (n === 0) return 0;
    if (n <= 12) return 1;
    if (n <= 24) return 2;
    return 3;
}

/**
 * All available bet types and their payouts.
 */
const BET_TYPES = {
    straight: { payout: 35, description: 'Single number' },
    red:      { payout: 1,  description: 'Red' },
    black:    { payout: 1,  description: 'Black' },
    odd:      { payout: 1,  description: 'Odd' },
    even:     { payout: 1,  description: 'Even' },
    low:      { payout: 1,  description: '1-18' },
    high:     { payout: 1,  description: '19-36' },
    dozen1:   { payout: 2,  description: '1st Dozen (1-12)' },
    dozen2:   { payout: 2,  description: '2nd Dozen (13-24)' },
    dozen3:   { payout: 2,  description: '3rd Dozen (25-36)' },
    column1:  { payout: 2,  description: 'Column 1' },
    column2:  { payout: 2,  description: 'Column 2' },
    column3:  { payout: 2,  description: 'Column 3' },
};

/**
 * Check if a given bet wins for a given spin result.
 * @param {string} betType
 * @param {number|null} betNumber - Only for 'straight' bets
 * @param {number} result - The spun number (0-36)
 * @returns {boolean}
 */
function isBetWinner(betType, betNumber, result) {
    switch (betType) {
        case 'straight': return result === betNumber;
        case 'red':      return RED_NUMBERS.has(result);
        case 'black':    return BLACK_NUMBERS.has(result);
        case 'odd':      return result > 0 && result % 2 === 1;
        case 'even':     return result > 0 && result % 2 === 0;
        case 'low':      return result >= 1 && result <= 18;
        case 'high':     return result >= 19 && result <= 36;
        case 'dozen1':   return getDozen(result) === 1;
        case 'dozen2':   return getDozen(result) === 2;
        case 'dozen3':   return getDozen(result) === 3;
        case 'column1':  return getColumn(result) === 1;
        case 'column2':  return getColumn(result) === 2;
        case 'column3':  return getColumn(result) === 3;
        default:         return false;
    }
}

/**
 * Spin the wheel and resolve a bet.
 * @param {number} betAmount
 * @param {string} betType - One of the BET_TYPES keys
 * @param {number|null} betNumber - Required for 'straight', ignored otherwise
 * @returns {object}
 */
function play(betAmount, betType, betNumber) {
    if (typeof betAmount !== 'number' || betAmount <= 0) {
        return { success: false, error: 'Invalid bet amount' };
    }

    if (!BET_TYPES[betType]) {
        return { success: false, error: 'Invalid bet type' };
    }

    if (betType === 'straight') {
        betNumber = parseInt(betNumber);
        if (isNaN(betNumber) || betNumber < 0 || betNumber > 36) {
            return { success: false, error: 'Straight bet requires a number 0-36' };
        }
    }

    // Spin the wheel
    const result = Math.floor(Math.random() * 37); // 0-36
    const resultColor = getColor(result);
    const won = isBetWinner(betType, betNumber, result);
    const multiplier = BET_TYPES[betType].payout;
    const payout = won ? Math.round(betAmount * (multiplier + 1) * 100) / 100 : 0;
    const profit = won ? Math.round((payout - betAmount) * 100) / 100 : -betAmount;

    return {
        success: true,
        result,
        resultColor,
        betType,
        betNumber: betType === 'straight' ? betNumber : null,
        won,
        multiplier,
        payout,
        profit
    };
}

/**
 * Return info about all available bet types for the UI.
 */
function getBetInfo() {
    return Object.entries(BET_TYPES).map(([type, data]) => ({
        type,
        payout: `${data.payout}:1`,
        payoutMultiplier: data.payout + 1,
        description: data.description
    }));
}

module.exports = {
    play,
    getBetInfo,
    getColor,
    getColumn,
    getDozen,
    BET_TYPES,
    RED_NUMBERS,
    BLACK_NUMBERS,
    NUMBERS
};

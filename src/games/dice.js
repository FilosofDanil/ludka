/**
 * Dice Game Module
 * 
 * Classic dice game (1-6). Player picks a target number and bets
 * whether the roll will be HIGHER or LOWER than that target.
 * 
 * House edge: 2%
 * 
 * Coefficients:
 *   coef = (6 / winningOutcomes) * (1 - houseEdge)
 * 
 * Example payouts (bet "Higher than"):
 *   Higher than 1: 5/6 chance → 1.18x
 *   Higher than 2: 4/6 chance → 1.47x
 *   Higher than 3: 3/6 chance → 1.96x
 *   Higher than 4: 2/6 chance → 2.94x
 *   Higher than 5: 1/6 chance → 5.88x
 */

const HOUSE_EDGE = 0.02;
const DICE_MIN = 1;
const DICE_MAX = 6;

/**
 * Calculate the coefficient (multiplier) for a given bet.
 * @param {number} target - Target number (1-6)
 * @param {'higher'|'lower'} direction - Bet direction
 * @returns {{ coefficient: number, winChance: number, winningOutcomes: number } | null}
 */
function calculateCoefficient(target, direction) {
    let winningOutcomes;

    if (direction === 'higher') {
        // Win if roll > target
        winningOutcomes = DICE_MAX - target;
    } else if (direction === 'lower') {
        // Win if roll < target
        winningOutcomes = target - DICE_MIN;
    } else {
        return null;
    }

    if (winningOutcomes <= 0 || winningOutcomes >= DICE_MAX) {
        return null; // Impossible or guaranteed bet
    }

    const winChance = winningOutcomes / DICE_MAX;
    const coefficient = Math.round(((DICE_MAX / winningOutcomes) * (1 - HOUSE_EDGE)) * 100) / 100;

    return { coefficient, winChance, winningOutcomes };
}

/**
 * Roll the dice and determine the result.
 * @param {number} betAmount - Amount wagered
 * @param {number} target - Target number (1-6)
 * @param {'higher'|'lower'} direction - Bet direction
 * @returns {{ success: boolean, roll: number, target: number, direction: string, won: boolean, coefficient: number, winChance: number, payout: number, profit: number } | { success: false, error: string }}
 */
function play(betAmount, target, direction) {
    // Validate inputs
    if (typeof betAmount !== 'number' || betAmount <= 0) {
        return { success: false, error: 'Invalid bet amount' };
    }

    target = parseInt(target);
    if (isNaN(target) || target < DICE_MIN || target > DICE_MAX) {
        return { success: false, error: `Target must be between ${DICE_MIN} and ${DICE_MAX}` };
    }

    direction = String(direction).toLowerCase();
    if (direction !== 'higher' && direction !== 'lower') {
        return { success: false, error: 'Direction must be "higher" or "lower"' };
    }

    const coeffData = calculateCoefficient(target, direction);
    if (!coeffData) {
        return { success: false, error: 'Invalid bet: no possible winning outcomes' };
    }

    // Roll the dice
    const roll = Math.floor(Math.random() * DICE_MAX) + DICE_MIN;

    // Determine win/loss
    let won = false;
    if (direction === 'higher') {
        won = roll > target;
    } else {
        won = roll < target;
    }

    const payout = won ? Math.round(betAmount * coeffData.coefficient * 100) / 100 : 0;
    const profit = won ? Math.round((payout - betAmount) * 100) / 100 : -betAmount;

    return {
        success: true,
        roll,
        target,
        direction,
        won,
        coefficient: coeffData.coefficient,
        winChance: Math.round(coeffData.winChance * 100),
        payout,
        profit
    };
}

/**
 * Get all possible bets with their coefficients for UI display.
 */
function getBetOptions() {
    const options = [];

    for (let target = DICE_MIN; target <= DICE_MAX; target++) {
        const higher = calculateCoefficient(target, 'higher');
        const lower = calculateCoefficient(target, 'lower');

        if (higher) {
            options.push({
                target,
                direction: 'higher',
                label: `Higher than ${target}`,
                coefficient: higher.coefficient,
                winChance: Math.round(higher.winChance * 100)
            });
        }
        if (lower) {
            options.push({
                target,
                direction: 'lower',
                label: `Lower than ${target}`,
                coefficient: lower.coefficient,
                winChance: Math.round(lower.winChance * 100)
            });
        }
    }

    return options;
}

module.exports = {
    play,
    calculateCoefficient,
    getBetOptions,
    HOUSE_EDGE,
    DICE_MIN,
    DICE_MAX
};

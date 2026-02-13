/**
 * Server-side Roulette Round Manager
 *
 * Runs continuously from server start. All users share the same round,
 * the same timer, and the same result.
 *
 * Phases (30s cycle):
 *   betting  (15s)  — users can place / remove / clear bets
 *   spinning  (5s)  — result is generated, bets are settled
 *   result   (10s)  — display result, then loop back to betting
 */

const EventEmitter = require('events');
const rouletteGame = require('./roulette');

const BETTING_DURATION  = 15; // seconds
const SPINNING_DURATION = 5;
const RESULT_DURATION   = 10;

class RouletteRoundManager extends EventEmitter {
    constructor() {
        super();
        this.roundId       = 0;
        this.phase         = 'waiting'; // waiting | betting | spinning | result
        this.phaseEndTime  = 0;         // unix-ms when current phase ends
        this.result        = null;      // winning number (0-36)
        this.resultColor   = null;      // green | red | black
        this.history       = [];        // last 20 results [{number, color}]

        // roundId → Map(userId → [{betKey, betType, betNumber, betAmount}])
        this.pendingBets  = new Map();
        // roundId → Map(userId → {bets, totalBet, totalPayout, totalProfit, won, balance})
        this.roundResults = new Map();

        this._phaseTimeout = null;
        this.userBalance   = null;      // injected on start()
    }

    /* ------------------------------------------------------------------ */
    /*  Lifecycle                                                          */
    /* ------------------------------------------------------------------ */

    start(userBalanceModule) {
        this.userBalance = userBalanceModule;
        console.log('Roulette round manager started');
        this._startBettingPhase();
    }

    /* ------------------------------------------------------------------ */
    /*  Public state                                                       */
    /* ------------------------------------------------------------------ */

    getState() {
        const now = Date.now();
        let phaseDurationMs;
        switch (this.phase) {
            case 'betting':  phaseDurationMs = BETTING_DURATION  * 1000; break;
            case 'spinning': phaseDurationMs = SPINNING_DURATION * 1000; break;
            case 'result':   phaseDurationMs = RESULT_DURATION   * 1000; break;
            default:         phaseDurationMs = 0;
        }
        return {
            phase:            this.phase,
            roundId:          this.roundId,
            phaseRemainingMs: Math.max(0, this.phaseEndTime - now),
            phaseDurationMs,
            result:           this.phase !== 'betting' ? this.result      : null,
            resultColor:      this.phase !== 'betting' ? this.resultColor : null,
            history:          this.history,
        };
    }

    /* ------------------------------------------------------------------ */
    /*  Bet management (called from routes during 'betting' phase)         */
    /* ------------------------------------------------------------------ */

    placeBet(userId, roundId, betType, betNumber, betAmount) {
        if (this.phase !== 'betting')
            return { success: false, error: 'Betting is closed' };
        if (roundId !== this.roundId)
            return { success: false, error: 'Round has changed' };

        betAmount = parseFloat(betAmount);
        if (isNaN(betAmount) || betAmount <= 0)
            return { success: false, error: 'Invalid bet amount' };
        if (!rouletteGame.BET_TYPES[betType])
            return { success: false, error: `Invalid bet type: ${betType}` };

        if (betType === 'straight') {
            betNumber = parseInt(betNumber);
            if (isNaN(betNumber) || betNumber < 0 || betNumber > 36)
                return { success: false, error: 'Number must be 0-36' };
        } else {
            betNumber = null;
        }

        const betKey = betType === 'straight' ? `straight_${betNumber}` : betType;

        // Deduct from balance
        const deductResult = this.userBalance.deductBet(userId, betAmount);
        if (!deductResult.success) return deductResult;

        // Store bet
        const roundBets = this.pendingBets.get(this.roundId);
        if (!roundBets.has(userId)) roundBets.set(userId, []);
        const userBets = roundBets.get(userId);

        const existing = userBets.find(b => b.betKey === betKey);
        if (existing) {
            existing.betAmount += betAmount;
        } else {
            userBets.push({ betKey, betType, betNumber, betAmount });
        }

        return {
            success: true,
            roundId: this.roundId,
            balance: this.userBalance.getBalance(userId),
        };
    }

    removeBet(userId, roundId, betKey) {
        if (this.phase !== 'betting')
            return { success: false, error: 'Betting is closed' };
        if (roundId !== this.roundId)
            return { success: false, error: 'Round has changed' };

        const roundBets = this.pendingBets.get(this.roundId);
        if (!roundBets || !roundBets.has(userId))
            return { success: false, error: 'No bets to remove' };

        const userBets = roundBets.get(userId);
        const idx = userBets.findIndex(b => b.betKey === betKey);
        if (idx < 0) return { success: false, error: 'Bet not found' };

        const removed = userBets.splice(idx, 1)[0];
        this.userBalance.addWinnings(userId, removed.betAmount);

        if (userBets.length === 0) roundBets.delete(userId);

        return {
            success: true,
            roundId: this.roundId,
            balance: this.userBalance.getBalance(userId),
        };
    }

    clearBets(userId, roundId) {
        if (this.phase !== 'betting')
            return { success: false, error: 'Betting is closed' };
        if (roundId !== this.roundId)
            return { success: false, error: 'Round has changed' };

        const roundBets = this.pendingBets.get(this.roundId);
        if (!roundBets || !roundBets.has(userId))
            return { success: true, balance: this.userBalance.getBalance(userId) };

        const userBets = roundBets.get(userId);
        const totalRefund = Math.round(
            userBets.reduce((s, b) => s + b.betAmount, 0) * 100
        ) / 100;
        this.userBalance.addWinnings(userId, totalRefund);
        roundBets.delete(userId);

        return {
            success: true,
            roundId: this.roundId,
            balance: this.userBalance.getBalance(userId),
        };
    }

    /** Return the user's pending bets for a given round (defaults to current). */
    getUserBets(userId, roundId) {
        const rId = roundId || this.roundId;
        const roundBets = this.pendingBets.get(rId);
        if (!roundBets || !roundBets.has(userId)) return [];
        return roundBets.get(userId);
    }

    /** Return the settlement result for a user in a given round. */
    getUserRoundResult(userId, roundId) {
        const rId = roundId || this.roundId;
        const results = this.roundResults.get(rId);
        if (!results || !results.has(userId)) return null;
        return results.get(userId);
    }

    /* ------------------------------------------------------------------ */
    /*  Phase transitions (private)                                        */
    /* ------------------------------------------------------------------ */

    _startBettingPhase() {
        this.roundId++;
        this.phase        = 'betting';
        this.result       = null;
        this.resultColor  = null;
        this.phaseEndTime = Date.now() + BETTING_DURATION * 1000;
        this.pendingBets.set(this.roundId, new Map());

        this._broadcast();
        this._phaseTimeout = setTimeout(
            () => this._startSpinningPhase(),
            BETTING_DURATION * 1000
        );
    }

    _startSpinningPhase() {
        this.phase        = 'spinning';
        this.phaseEndTime = Date.now() + SPINNING_DURATION * 1000;

        // Generate the result
        this.result      = Math.floor(Math.random() * 37);
        this.resultColor = rouletteGame.getColor(this.result);

        // Settle every user's bets
        this._settleBets();

        this._broadcast();
        this._phaseTimeout = setTimeout(
            () => this._startResultPhase(),
            SPINNING_DURATION * 1000
        );
    }

    _startResultPhase() {
        this.phase        = 'result';
        this.phaseEndTime = Date.now() + RESULT_DURATION * 1000;

        // Append to shared history
        this.history.unshift({ number: this.result, color: this.resultColor });
        if (this.history.length > 20) this.history.pop();

        this._broadcast();

        // Housekeeping — drop data older than 2 rounds
        for (const key of this.pendingBets.keys()) {
            if (key < this.roundId - 1) this.pendingBets.delete(key);
        }
        for (const key of this.roundResults.keys()) {
            if (key < this.roundId - 1) this.roundResults.delete(key);
        }

        this._phaseTimeout = setTimeout(
            () => this._startBettingPhase(),
            RESULT_DURATION * 1000
        );
    }

    /* ------------------------------------------------------------------ */
    /*  Settlement                                                         */
    /* ------------------------------------------------------------------ */

    _settleBets() {
        const roundBets = this.pendingBets.get(this.roundId);
        if (!roundBets || roundBets.size === 0) return;

        const results = new Map();

        for (const [userId, bets] of roundBets) {
            const resolvedBets = bets.map(bet => {
                const won = rouletteGame.isBetWinner(
                    bet.betType, bet.betNumber, this.result
                );
                const multiplier = rouletteGame.BET_TYPES[bet.betType].payout;
                const payout = won
                    ? Math.round(bet.betAmount * (multiplier + 1) * 100) / 100
                    : 0;
                const profit = won
                    ? Math.round((payout - bet.betAmount) * 100) / 100
                    : -bet.betAmount;
                return { ...bet, won, multiplier, payout, profit };
            });

            const totalBet = Math.round(
                bets.reduce((s, b) => s + b.betAmount, 0) * 100
            ) / 100;
            const totalPayout = Math.round(
                resolvedBets.reduce((s, b) => s + b.payout, 0) * 100
            ) / 100;
            const totalProfit = Math.round((totalPayout - totalBet) * 100) / 100;
            const won = resolvedBets.some(b => b.won);

            // Credit winnings
            if (totalPayout > 0) {
                this.userBalance.addWinnings(userId, totalPayout);
            }

            const finalBalance = this.userBalance.getBalance(userId);

            // Record in user history
            this.userBalance.addHistoryEntry(userId, {
                game: 'roulette',
                betAmount: totalBet,
                bets: resolvedBets,
                result: this.result,
                resultColor: this.resultColor,
                won,
                totalPayout,
                profit: totalProfit,
                balanceAfter: finalBalance,
            });

            results.set(userId, {
                bets: resolvedBets,
                totalBet,
                totalPayout,
                totalProfit,
                won,
                balance: finalBalance,
            });
        }

        this.roundResults.set(this.roundId, results);
    }

    /* ------------------------------------------------------------------ */
    /*  Broadcasting                                                       */
    /* ------------------------------------------------------------------ */

    _broadcast() {
        this.emit('stateChange', this.getState());
    }
}

module.exports = new RouletteRoundManager();

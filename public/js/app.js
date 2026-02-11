const tg = window.Telegram?.WebApp;

// --- State ---
let state = {
    userId: null,
    balance: 0,
    currentGame: 'dice', // 'dice' | 'roulette'
    rolling: false,

    // Dice state
    target: 3,
    direction: 'higher',
    betAmount: 10,
    lastResults: [],
    coefficients: {},

    // Roulette state
    rouletteBetType: 'red',
    rouletteBetNumber: 0,
    rouletteBetAmount: 10,
    rouletteLastResults: [],
    rouletteInfo: null, // cached from server
};

// Dice face dot patterns
const DICE_DOTS = {
    1: [5],
    2: [1, 9],
    3: [1, 5, 9],
    4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9],
    6: [1, 3, 4, 6, 7, 9]
};

// Roulette number colors (European)
const RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
function rouletteColor(n) {
    if (n === 0) return 'green';
    return RED_NUMBERS.has(n) ? 'red' : 'black';
}

// Payout multipliers for roulette bet types (total return including stake)
const ROULETTE_PAYOUTS = {
    straight: 36, red: 2, black: 2, odd: 2, even: 2,
    low: 2, high: 2, dozen1: 3, dozen2: 3, dozen3: 3,
    column1: 3, column2: 3, column3: 3
};

// --- Init ---
function init() {
    if (tg) {
        tg.ready();
        tg.expand();
        applyTelegramTheme();
    }

    state.userId = getUserId();

    setupGameSwitcher();
    setupDiceListeners();
    setupRouletteListeners();
    setupSharedListeners();
    loadBalance();
    loadGameInfo();
    loadRouletteInfo();
    updateUI();
    buildStraightNumberGrid();
}

function getUserId() {
    if (tg?.initDataUnsafe?.user?.id) {
        return String(tg.initDataUnsafe.user.id);
    }
    let devId = localStorage.getItem('ludik_dev_user_id');
    if (!devId) {
        devId = 'dev_' + Math.random().toString(36).substring(2, 10);
        localStorage.setItem('ludik_dev_user_id', devId);
    }
    return devId;
}

function applyTelegramTheme() {
    if (!tg?.themeParams) return;
    const root = document.documentElement;
    const theme = tg.themeParams;
    const mapping = {
        bg_color: '--tg-theme-bg-color',
        text_color: '--tg-theme-text-color',
        hint_color: '--tg-theme-hint-color',
        link_color: '--tg-theme-link-color',
        button_color: '--tg-theme-button-color',
        button_text_color: '--tg-theme-button-text-color',
        secondary_bg_color: '--tg-theme-secondary-bg-color'
    };
    for (const [key, cssVar] of Object.entries(mapping)) {
        if (theme[key]) root.style.setProperty(cssVar, theme[key]);
    }
}

// ==============================================================
//  API helpers
// ==============================================================
async function apiGet(url) {
    const res = await fetch(url);
    return res.json();
}

async function apiPost(url, body) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    return res.json();
}

async function loadBalance() {
    try {
        const data = await apiGet(`/api/user/${state.userId}/balance`);
        if (data.success) {
            state.balance = data.balance;
            updateBalanceDisplay();
        }
    } catch (e) {
        console.error('Failed to load balance:', e);
    }
}

async function loadGameInfo() {
    try {
        const data = await apiGet('/api/games/dice/info');
        if (data.success) {
            data.betOptions.forEach(opt => {
                const key = `${opt.target}_${opt.direction}`;
                state.coefficients[key] = {
                    coefficient: opt.coefficient,
                    winChance: opt.winChance
                };
            });
            updateCoefficients();
        }
    } catch (e) {
        console.error('Failed to load dice info:', e);
    }
}

async function loadRouletteInfo() {
    try {
        const data = await apiGet('/api/games/roulette/info');
        if (data.success) {
            state.rouletteInfo = data;
        }
    } catch (e) {
        console.error('Failed to load roulette info:', e);
    }
}

async function loadHistory() {
    try {
        const data = await apiGet(`/api/user/${state.userId}/history`);
        if (data.success) {
            renderHistory(data.history);
        }
    } catch (e) {
        console.error('Failed to load history:', e);
    }
}

// ==============================================================
//  Game Switcher
// ==============================================================
function setupGameSwitcher() {
    document.querySelectorAll('.game-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            if (state.rolling) return;
            const game = tab.dataset.game;
            if (game === state.currentGame) return;

            haptic('light');
            state.currentGame = game;

            // Toggle tab active state
            document.querySelectorAll('.game-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Toggle game panels
            document.querySelectorAll('.game-panel').forEach(p => p.classList.remove('active'));
            document.getElementById(`game-${game}`).classList.add('active');
        });
    });
}

// ==============================================================
//  Shared listeners (history, reset balance)
// ==============================================================
function setupSharedListeners() {
    // History modal
    document.getElementById('historyBtn').addEventListener('click', () => {
        document.getElementById('historyModal').classList.remove('hidden');
        loadHistory();
    });
    document.getElementById('closeHistory').addEventListener('click', () => {
        document.getElementById('historyModal').classList.add('hidden');
    });
    document.getElementById('historyModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            e.currentTarget.classList.add('hidden');
        }
    });

    // Reset balance
    document.getElementById('resetBalanceBtn').addEventListener('click', async () => {
        haptic('medium');
        try {
            const data = await apiPost(`/api/user/${state.userId}/reset`, {});
            if (data.success) {
                state.balance = data.balance;
                updateBalanceDisplay();
                document.getElementById('historyModal').classList.add('hidden');
                showDiceResult('Balance reset to ' + data.balance, false);
            }
        } catch (e) {
            console.error('Failed to reset balance:', e);
        }
    });
}

// ==============================================================
//  DICE — Event Listeners
// ==============================================================
function setupDiceListeners() {
    // Target buttons
    document.querySelectorAll('.target-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (state.rolling) return;
            haptic('light');
            state.target = parseInt(btn.dataset.target);
            document.querySelectorAll('.target-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            validateDirections();
            updateCoefficients();
            updatePotentialWin();
        });
    });

    // Direction buttons
    document.querySelectorAll('.direction-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (state.rolling) return;
            haptic('light');
            state.direction = btn.dataset.direction;
            document.querySelectorAll('.direction-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            updateCoefficients();
            updatePotentialWin();
        });
    });

    // Bet amount input
    const betInput = document.getElementById('betAmount');
    betInput.addEventListener('input', () => {
        state.betAmount = parseFloat(betInput.value) || 0;
        updatePotentialWin();
    });

    // Quick bet buttons (dice)
    document.querySelectorAll('#game-dice .bet-quick-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            haptic('light');
            const action = btn.dataset.action;
            const input = document.getElementById('betAmount');
            let val = parseFloat(input.value) || 0;
            if (action === 'half') val = Math.max(1, Math.floor(val / 2));
            if (action === 'double') val = Math.min(state.balance, val * 2);
            if (action === 'max') val = state.balance;
            val = Math.floor(val);
            input.value = val;
            state.betAmount = val;
            updatePotentialWin();
        });
    });

    // Roll button
    document.getElementById('rollBtn').addEventListener('click', rollDice);
}

// ==============================================================
//  DICE — Game Logic
// ==============================================================
async function rollDice() {
    if (state.rolling) return;

    const amount = Math.floor(parseFloat(document.getElementById('betAmount').value) || 0);
    if (amount <= 0) {
        showDiceResult('Enter a valid bet amount', false);
        haptic('error');
        return;
    }
    if (amount > state.balance) {
        showDiceResult('Insufficient balance!', false);
        haptic('error');
        return;
    }

    const key = `${state.target}_${state.direction}`;
    if (!state.coefficients[key]) {
        showDiceResult('Invalid bet selection', false);
        haptic('error');
        return;
    }

    state.rolling = true;
    const rollBtn = document.getElementById('rollBtn');
    rollBtn.classList.add('rolling');
    rollBtn.querySelector('.roll-text').textContent = 'Rolling...';

    const dice = document.getElementById('dice');
    const diceFace = document.getElementById('diceFace');
    dice.classList.add('spinning');

    let animFrames = 0;
    const animInterval = setInterval(() => {
        const randomFace = Math.floor(Math.random() * 6) + 1;
        renderDiceFace(diceFace, randomFace);
        animFrames++;
    }, 80);

    try {
        const result = await apiPost('/api/games/dice/bet', {
            userId: state.userId,
            betAmount: amount,
            target: state.target,
            direction: state.direction
        });

        const minAnimTime = Math.max(0, 1200 - animFrames * 80);
        await sleep(minAnimTime);

        clearInterval(animInterval);
        dice.classList.remove('spinning');

        if (!result.success) {
            showDiceResult(result.error || 'Bet failed', false);
            haptic('error');
        } else {
            renderDiceFace(diceFace, result.roll);
            dice.classList.add(result.won ? 'win-shake' : 'lose-shake');
            setTimeout(() => dice.classList.remove('win-shake', 'lose-shake'), 600);

            state.balance = result.balance;
            updateBalanceDisplay();

            if (result.won) {
                showDiceResult(`Rolled ${result.roll} — You win! +${result.payout.toFixed(2)} (${result.coefficient}x)`, true);
                haptic('success');
            } else {
                showDiceResult(`Rolled ${result.roll} — You lose! -${amount.toFixed(2)}`, false);
                haptic('error');
            }

            state.lastResults.unshift({ roll: result.roll, won: result.won });
            if (state.lastResults.length > 10) state.lastResults.pop();
            renderLastResults();
        }
    } catch (e) {
        clearInterval(animInterval);
        dice.classList.remove('spinning');
        showDiceResult('Network error, please try again', false);
        haptic('error');
        console.error('Roll error:', e);
        loadBalance();
    }

    state.rolling = false;
    rollBtn.classList.remove('rolling');
    rollBtn.querySelector('.roll-text').textContent = 'Roll Dice';
}

// ==============================================================
//  ROULETTE — Event Listeners
// ==============================================================
function setupRouletteListeners() {
    // Bet type buttons
    document.querySelectorAll('.roulette-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (state.rolling) return;
            haptic('light');
            state.rouletteBetType = btn.dataset.betType;
            document.querySelectorAll('.roulette-type-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Show/hide straight number picker
            const picker = document.getElementById('straightPicker');
            if (state.rouletteBetType === 'straight') {
                picker.classList.remove('hidden');
            } else {
                picker.classList.add('hidden');
            }
            updateRoulettePotentialWin();
        });
    });

    // Bet amount input (roulette)
    const rBetInput = document.getElementById('rouletteBetAmount');
    rBetInput.addEventListener('input', () => {
        state.rouletteBetAmount = parseFloat(rBetInput.value) || 0;
        updateRoulettePotentialWin();
    });

    // Quick bet buttons (roulette)
    document.querySelectorAll('.roulette-quick').forEach(btn => {
        btn.addEventListener('click', () => {
            haptic('light');
            const action = btn.dataset.action;
            const input = document.getElementById('rouletteBetAmount');
            let val = parseFloat(input.value) || 0;
            if (action === 'half') val = Math.max(1, Math.floor(val / 2));
            if (action === 'double') val = Math.min(state.balance, val * 2);
            if (action === 'max') val = state.balance;
            val = Math.floor(val);
            input.value = val;
            state.rouletteBetAmount = val;
            updateRoulettePotentialWin();
        });
    });

    // Spin button
    document.getElementById('spinBtn').addEventListener('click', spinRoulette);
}

function buildStraightNumberGrid() {
    const grid = document.getElementById('straightNumberGrid');
    let html = '';
    for (let i = 0; i <= 36; i++) {
        const color = rouletteColor(i);
        const activeClass = (i === state.rouletteBetNumber) ? ' active' : '';
        html += `<button class="straight-num-btn color-${color}${activeClass}" data-num="${i}">${i}</button>`;
    }
    grid.innerHTML = html;

    grid.addEventListener('click', (e) => {
        const btn = e.target.closest('.straight-num-btn');
        if (!btn || state.rolling) return;
        haptic('light');
        state.rouletteBetNumber = parseInt(btn.dataset.num);
        grid.querySelectorAll('.straight-num-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        updateRoulettePotentialWin();
    });
}

// ==============================================================
//  ROULETTE — Game Logic
// ==============================================================
async function spinRoulette() {
    if (state.rolling) return;

    const amount = Math.floor(parseFloat(document.getElementById('rouletteBetAmount').value) || 0);
    if (amount <= 0) {
        showRouletteResult('Enter a valid bet amount', false);
        haptic('error');
        return;
    }
    if (amount > state.balance) {
        showRouletteResult('Insufficient balance!', false);
        haptic('error');
        return;
    }

    state.rolling = true;
    const spinBtn = document.getElementById('spinBtn');
    spinBtn.classList.add('rolling');
    spinBtn.querySelector('.roll-text').textContent = 'Spinning...';

    const wheel = document.getElementById('rouletteWheel');
    const numberEl = document.getElementById('rouletteNumber');
    wheel.classList.add('spinning');

    // Animate random numbers while waiting
    let animFrames = 0;
    const animInterval = setInterval(() => {
        const randNum = Math.floor(Math.random() * 37);
        numberEl.textContent = randNum;
        numberEl.className = `roulette-number color-${rouletteColor(randNum)}`;
        animFrames++;
    }, 60);

    try {
        const result = await apiPost('/api/games/roulette/bet', {
            userId: state.userId,
            betAmount: amount,
            betType: state.rouletteBetType,
            betNumber: state.rouletteBetType === 'straight' ? state.rouletteBetNumber : null
        });

        const minAnimTime = Math.max(0, 1500 - animFrames * 60);
        await sleep(minAnimTime);

        clearInterval(animInterval);
        wheel.classList.remove('spinning');

        if (!result.success) {
            showRouletteResult(result.error || 'Bet failed', false);
            haptic('error');
        } else {
            // Show final result
            numberEl.textContent = result.result;
            numberEl.className = `roulette-number color-${result.resultColor}`;

            wheel.classList.add(result.won ? 'win-glow' : 'lose-shake');
            setTimeout(() => wheel.classList.remove('win-glow', 'lose-shake'), 700);

            state.balance = result.balance;
            updateBalanceDisplay();

            const betLabel = getBetLabel(result.betType, result.betNumber);
            if (result.won) {
                showRouletteResult(`${result.result} ${result.resultColor} — You win! +${result.payout.toFixed(2)}`, true);
                haptic('success');
            } else {
                showRouletteResult(`${result.result} ${result.resultColor} — You lose! -${amount.toFixed(2)}`, false);
                haptic('error');
            }

            state.rouletteLastResults.unshift({ number: result.result, color: result.resultColor, won: result.won });
            if (state.rouletteLastResults.length > 10) state.rouletteLastResults.pop();
            renderRouletteLastResults();
        }
    } catch (e) {
        clearInterval(animInterval);
        wheel.classList.remove('spinning');
        showRouletteResult('Network error, please try again', false);
        haptic('error');
        console.error('Spin error:', e);
        loadBalance();
    }

    state.rolling = false;
    spinBtn.classList.remove('rolling');
    spinBtn.querySelector('.roll-text').textContent = 'Spin Wheel';
}

function getBetLabel(betType, betNumber) {
    const labels = {
        straight: `Straight ${betNumber}`,
        red: 'Red', black: 'Black',
        odd: 'Odd', even: 'Even',
        low: '1-18', high: '19-36',
        dozen1: '1st Dozen', dozen2: '2nd Dozen', dozen3: '3rd Dozen',
        column1: 'Column 1', column2: 'Column 2', column3: 'Column 3'
    };
    return labels[betType] || betType;
}

// ==============================================================
//  UI Updates — Dice
// ==============================================================
function updateUI() {
    updateCoefficients();
    updatePotentialWin();
    validateDirections();
    updateRoulettePotentialWin();
}

function updateBalanceDisplay() {
    const el = document.getElementById('balanceAmount');
    el.textContent = state.balance.toFixed(2);
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
}

function updateCoefficients() {
    const higherKey = `${state.target}_higher`;
    const lowerKey = `${state.target}_lower`;
    const higherData = state.coefficients[higherKey];
    const lowerData = state.coefficients[lowerKey];

    document.getElementById('coefHigher').textContent = higherData ? `${higherData.coefficient}x` : '—';
    document.getElementById('coefLower').textContent = lowerData ? `${lowerData.coefficient}x` : '—';

    const currentKey = `${state.target}_${state.direction}`;
    const currentData = state.coefficients[currentKey];
    document.getElementById('winChance').textContent = currentData
        ? `Win chance: ${currentData.winChance}%`
        : 'Win chance: —';

    updatePotentialWin();
}

function validateDirections() {
    const higherKey = `${state.target}_higher`;
    const lowerKey = `${state.target}_lower`;
    const higherValid = !!state.coefficients[higherKey];
    const lowerValid = !!state.coefficients[lowerKey];

    const btnHigher = document.getElementById('btnHigher');
    const btnLower = document.getElementById('btnLower');
    btnHigher.disabled = !higherValid;
    btnLower.disabled = !lowerValid;

    if (state.direction === 'higher' && !higherValid && lowerValid) {
        state.direction = 'lower';
        btnHigher.classList.remove('active');
        btnLower.classList.add('active');
    } else if (state.direction === 'lower' && !lowerValid && higherValid) {
        state.direction = 'higher';
        btnLower.classList.remove('active');
        btnHigher.classList.add('active');
    }
}

function updatePotentialWin() {
    const key = `${state.target}_${state.direction}`;
    const data = state.coefficients[key];
    const amount = parseFloat(document.getElementById('betAmount').value) || 0;
    const el = document.getElementById('potentialWin');
    if (data && amount > 0) {
        el.textContent = (amount * data.coefficient).toFixed(2);
    } else {
        el.textContent = '0.00';
    }
}

function renderDiceFace(el, number) {
    const dots = DICE_DOTS[number] || [];
    let html = '<div class="dice-dots">';
    for (let i = 1; i <= 9; i++) {
        html += `<span class="dot-cell${dots.includes(i) ? ' dot-active' : ''}"></span>`;
    }
    html += '</div>';
    el.innerHTML = html;
}

function renderLastResults() {
    const container = document.getElementById('lastResults');
    if (state.lastResults.length === 0) { container.innerHTML = ''; return; }
    container.innerHTML = state.lastResults.map(r =>
        `<span class="result-chip ${r.won ? 'chip-win' : 'chip-lose'}">${r.roll}</span>`
    ).join('');
}

function showDiceResult(message, isWin) {
    const el = document.getElementById('resultInfo');
    el.textContent = message;
    el.className = `dice-result-info ${isWin ? 'result-win' : 'result-lose'} show`;
    clearTimeout(showDiceResult._timer);
    showDiceResult._timer = setTimeout(() => el.classList.remove('show'), 4000);
}

// ==============================================================
//  UI Updates — Roulette
// ==============================================================
function updateRoulettePotentialWin() {
    const amount = parseFloat(document.getElementById('rouletteBetAmount').value) || 0;
    const multiplier = ROULETTE_PAYOUTS[state.rouletteBetType] || 2;
    const el = document.getElementById('roulettePotentialWin');
    el.textContent = amount > 0 ? (amount * multiplier).toFixed(2) : '0.00';
}

function renderRouletteLastResults() {
    const container = document.getElementById('rouletteLastResults');
    if (state.rouletteLastResults.length === 0) { container.innerHTML = ''; return; }
    container.innerHTML = state.rouletteLastResults.map(r =>
        `<span class="result-chip roulette-chip color-${r.color} ${r.won ? 'chip-win-border' : ''}">${r.number}</span>`
    ).join('');
}

function showRouletteResult(message, isWin) {
    const el = document.getElementById('rouletteResultInfo');
    el.textContent = message;
    el.className = `roulette-result-info ${isWin ? 'result-win' : 'result-lose'} show`;
    clearTimeout(showRouletteResult._timer);
    showRouletteResult._timer = setTimeout(() => el.classList.remove('show'), 4000);
}

// ==============================================================
//  History (shared, supports both games)
// ==============================================================
function renderHistory(history) {
    const container = document.getElementById('historyList');
    if (!history || history.length === 0) {
        container.innerHTML = '<p class="empty-state">No games played yet</p>';
        return;
    }

    container.innerHTML = history.map(h => {
        const time = new Date(h.timestamp).toLocaleTimeString();
        const wonClass = h.won ? 'history-win' : 'history-lose';
        const sign = h.won ? '+' : '';

        if (h.game === 'roulette') {
            const color = h.resultColor || 'green';
            return `
                <div class="history-item ${wonClass}">
                    <div class="history-main">
                        <span class="history-dice roulette-history-num color-${color}">${h.result}</span>
                        <span class="history-detail">
                            ${getBetLabel(h.betType, h.betNumber)}
                            &rarr; <strong>${h.result}</strong> ${color}
                        </span>
                        <span class="history-amount">${sign}${h.profit.toFixed(2)}</span>
                    </div>
                    <div class="history-meta">
                        <span>Bet: ${h.betAmount} | ${h.multiplier + 1}x</span>
                        <span>${time}</span>
                    </div>
                </div>
            `;
        }

        // Dice history (default)
        return `
            <div class="history-item ${wonClass}">
                <div class="history-main">
                    <span class="history-dice">${getDiceEmoji(h.roll)}</span>
                    <span class="history-detail">
                        ${h.direction === 'higher' ? '&#9650;' : '&#9660;'} ${h.target}
                        &rarr; Rolled <strong>${h.roll}</strong>
                    </span>
                    <span class="history-amount">${sign}${h.profit.toFixed(2)}</span>
                </div>
                <div class="history-meta">
                    <span>Bet: ${h.betAmount} | ${h.coefficient}x</span>
                    <span>${time}</span>
                </div>
            </div>
        `;
    }).join('');
}

function getDiceEmoji(n) {
    const emojis = { 1: '\u2680', 2: '\u2681', 3: '\u2682', 4: '\u2683', 5: '\u2684', 6: '\u2685' };
    return emojis[n] || '?';
}

// --- Helpers ---
function haptic(type) {
    if (tg?.HapticFeedback) {
        if (type === 'success') tg.HapticFeedback.notificationOccurred('success');
        else if (type === 'error') tg.HapticFeedback.notificationOccurred('error');
        else tg.HapticFeedback.impactOccurred(type);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Bootstrap ---
document.addEventListener('DOMContentLoaded', init);

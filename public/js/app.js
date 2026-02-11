const tg = window.Telegram?.WebApp;

// --- State ---
let state = {
    userId: null,
    balance: 0,
    target: 3,
    direction: 'higher',
    betAmount: 10,
    rolling: false,
    lastResults: [],       // last N roll results for display
    coefficients: {},      // cached coefficient data
};

// Dice face dot patterns (unicode dice characters as fallback, but we draw with CSS)
const DICE_DOTS = {
    1: [5],
    2: [1, 9],
    3: [1, 5, 9],
    4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9],
    6: [1, 3, 4, 6, 7, 9]
};

// --- Init ---
function init() {
    if (tg) {
        tg.ready();
        tg.expand();
        applyTelegramTheme();
    }

    // Get user ID from Telegram or generate a dev one
    state.userId = getUserId();

    setupEventListeners();
    loadBalance();
    loadGameInfo();
    updateUI();
}

function getUserId() {
    if (tg?.initDataUnsafe?.user?.id) {
        return String(tg.initDataUnsafe.user.id);
    }
    // Dev fallback: use localStorage
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

// --- API ---
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
            // Cache coefficient data for quick lookup
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
        console.error('Failed to load game info:', e);
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

// --- Event Listeners ---
function setupEventListeners() {
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

    // Quick bet buttons
    document.querySelectorAll('.bet-quick-btn').forEach(btn => {
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
                showResult('Balance reset to ' + data.balance, false);
            }
        } catch (e) {
            console.error('Failed to reset balance:', e);
        }
    });
}

// --- Game Logic ---
async function rollDice() {
    if (state.rolling) return;

    const amount = Math.floor(parseFloat(document.getElementById('betAmount').value) || 0);
    if (amount <= 0) {
        showResult('Enter a valid bet amount', false);
        haptic('error');
        return;
    }
    if (amount > state.balance) {
        showResult('Insufficient balance!', false);
        haptic('error');
        return;
    }

    // Validate the bet is possible
    const key = `${state.target}_${state.direction}`;
    if (!state.coefficients[key]) {
        showResult('Invalid bet selection', false);
        haptic('error');
        return;
    }

    state.rolling = true;
    const rollBtn = document.getElementById('rollBtn');
    rollBtn.classList.add('rolling');
    rollBtn.querySelector('.roll-text').textContent = 'Rolling...';

    // Dice animation
    const dice = document.getElementById('dice');
    const diceFace = document.getElementById('diceFace');
    dice.classList.add('spinning');

    // Animate random faces during roll
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

        // Wait for minimum animation time
        const minAnimTime = Math.max(0, 1200 - animFrames * 80);
        await sleep(minAnimTime);

        clearInterval(animInterval);
        dice.classList.remove('spinning');

        if (!result.success) {
            showResult(result.error || 'Bet failed', false);
            haptic('error');
        } else {
            // Show final dice face
            renderDiceFace(diceFace, result.roll);

            // Animate result
            dice.classList.add(result.won ? 'win-shake' : 'lose-shake');
            setTimeout(() => dice.classList.remove('win-shake', 'lose-shake'), 600);

            // Update balance
            state.balance = result.balance;
            updateBalanceDisplay();

            // Show result
            if (result.won) {
                showResult(
                    `Rolled ${result.roll} — You win! +${result.payout.toFixed(2)} (${result.coefficient}x)`,
                    true
                );
                haptic('success');
            } else {
                showResult(
                    `Rolled ${result.roll} — You lose! -${amount.toFixed(2)}`,
                    false
                );
                haptic('error');
            }

            // Add to last results strip
            state.lastResults.unshift({ roll: result.roll, won: result.won });
            if (state.lastResults.length > 10) state.lastResults.pop();
            renderLastResults();
        }
    } catch (e) {
        clearInterval(animInterval);
        dice.classList.remove('spinning');
        showResult('Network error, please try again', false);
        haptic('error');
        console.error('Roll error:', e);
        // Reload balance in case of partial failure
        loadBalance();
    }

    state.rolling = false;
    rollBtn.classList.remove('rolling');
    rollBtn.querySelector('.roll-text').textContent = 'Roll Dice';
}

// --- UI Updates ---
function updateUI() {
    updateCoefficients();
    updatePotentialWin();
    validateDirections();
}

function updateBalanceDisplay() {
    const el = document.getElementById('balanceAmount');
    el.textContent = state.balance.toFixed(2);
    // Flash animation
    el.classList.remove('flash');
    void el.offsetWidth; // trigger reflow
    el.classList.add('flash');
}

function updateCoefficients() {
    const higherKey = `${state.target}_higher`;
    const lowerKey = `${state.target}_lower`;

    const higherData = state.coefficients[higherKey];
    const lowerData = state.coefficients[lowerKey];

    document.getElementById('coefHigher').textContent = higherData ? `${higherData.coefficient}x` : '—';
    document.getElementById('coefLower').textContent = lowerData ? `${lowerData.coefficient}x` : '—';

    // Update win chance
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

    // If current direction is invalid, switch
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
    // Build a 3x3 grid of dots
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
    if (state.lastResults.length === 0) {
        container.innerHTML = '';
        return;
    }
    container.innerHTML = state.lastResults.map(r =>
        `<span class="result-chip ${r.won ? 'chip-win' : 'chip-lose'}">${r.roll}</span>`
    ).join('');
}

function showResult(message, isWin) {
    const el = document.getElementById('resultInfo');
    el.textContent = message;
    el.className = `dice-result-info ${isWin ? 'result-win' : 'result-lose'} show`;
    clearTimeout(showResult._timer);
    showResult._timer = setTimeout(() => {
        el.classList.remove('show');
    }, 4000);
}

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

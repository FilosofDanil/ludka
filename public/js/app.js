const tg = window.Telegram?.WebApp;

// ==============================================================
//  Constants
// ==============================================================
const DICE_DOTS = {
    1: [5], 2: [1, 9], 3: [1, 5, 9],
    4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9]
};

const RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
function rouletteColor(n) {
    if (n === 0) return 'green';
    return RED_NUMBERS.has(n) ? 'red' : 'black';
}

// European wheel order (clockwise)
const WHEEL_ORDER = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];

const ROULETTE_PAYOUTS = {
    straight: 36, red: 2, black: 2, odd: 2, even: 2,
    low: 2, high: 2, dozen1: 3, dozen2: 3, dozen3: 3
};

const BET_LABELS = {
    red: 'Red', black: 'Black', odd: 'Odd', even: 'Even',
    low: '1-18', high: '19-36',
    dozen1: '1st 12', dozen2: '2nd 12', dozen3: '3rd 12'
};

const SPIN_ANIM_DURATION = 5000; // must match server SPINNING_DURATION

// ==============================================================
//  State
// ==============================================================
let state = {
    userId: null,
    balance: 0,
    currentGame: 'dice',
    rolling: false,

    // Dice
    target: 3,
    direction: 'higher',
    betAmount: 10,
    lastResults: [],
    coefficients: {},
};

// Roulette round state — driven by server via SSE
let roulette = {
    phase: 'waiting',      // synced from server: waiting | betting | spinning | result
    roundId: 0,
    phaseEndTime: 0,       // local timestamp when current phase ends
    phaseDurationMs: 0,    // total duration of current phase (for progress bar)
    chipAmount: 1,
    bets: [],              // local mirror of bets on server: [{ key, betType, betNumber, amount }]
    history: [],           // shared history from server: [{ number, color }]
    lastResult: null,      // { number, color } of last spin (for display)
    timerInterval: null,   // local display-update interval
    sseSource: null,       // EventSource instance
    prevPhase: null,       // for detecting phase transitions
    prevRoundId: 0,        // for detecting new rounds
    ballAnimating: false,  // whether ball animation is in progress
};

// ==============================================================
//  Init
// ==============================================================
function init() {
    if (tg) { tg.ready(); tg.expand(); applyTelegramTheme(); }
    state.userId = getUserId();

    setupGameSwitcher();
    setupDiceListeners();
    setupSharedListeners();
    buildRouletteBoard();
    setupRouletteListeners();
    loadBalance();
    loadGameInfo();
    updateUI();

    // Connect to server-side roulette round (always, regardless of active tab)
    connectRouletteSSE();
}

function getUserId() {
    if (tg?.initDataUnsafe?.user?.id) return String(tg.initDataUnsafe.user.id);
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
        bg_color: '--tg-theme-bg-color', text_color: '--tg-theme-text-color',
        hint_color: '--tg-theme-hint-color', link_color: '--tg-theme-link-color',
        button_color: '--tg-theme-button-color', button_text_color: '--tg-theme-button-text-color',
        secondary_bg_color: '--tg-theme-secondary-bg-color'
    };
    for (const [key, cssVar] of Object.entries(mapping)) {
        if (theme[key]) root.style.setProperty(cssVar, theme[key]);
    }
}

// ==============================================================
//  API
// ==============================================================
async function apiGet(url) { return (await fetch(url)).json(); }
async function apiPost(url, body) {
    return (await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    })).json();
}

async function loadBalance() {
    try {
        const data = await apiGet(`/api/user/${state.userId}/balance`);
        if (data.success) { state.balance = data.balance; updateBalanceDisplay(); }
    } catch (e) { console.error('Failed to load balance:', e); }
}

async function loadGameInfo() {
    try {
        const data = await apiGet('/api/games/dice/info');
        if (data.success) {
            data.betOptions.forEach(opt => {
                state.coefficients[`${opt.target}_${opt.direction}`] = {
                    coefficient: opt.coefficient, winChance: opt.winChance
                };
            });
            updateCoefficients();
        }
    } catch (e) { console.error('Failed to load dice info:', e); }
}

async function loadHistory() {
    try {
        const data = await apiGet(`/api/user/${state.userId}/history`);
        if (data.success) renderHistory(data.history);
    } catch (e) { console.error('Failed to load history:', e); }
}

// ==============================================================
//  Game Switcher — no start / stop of roulette loop
// ==============================================================
function setupGameSwitcher() {
    document.querySelectorAll('.game-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            if (state.rolling) return;
            const game = tab.dataset.game;
            if (game === state.currentGame) return;
            haptic('light');
            state.currentGame = game;
            document.querySelectorAll('.game-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('.game-panel').forEach(p => p.classList.remove('active'));
            document.getElementById(`game-${game}`).classList.add('active');

            // When switching to roulette, refresh UI to match server state
            if (game === 'roulette') {
                updateRouletteDisplay();
            }
        });
    });
}

// ==============================================================
//  Shared Listeners
// ==============================================================
function setupSharedListeners() {
    document.getElementById('historyBtn').addEventListener('click', () => {
        document.getElementById('historyModal').classList.remove('hidden');
        loadHistory();
    });
    document.getElementById('closeHistory').addEventListener('click', () => {
        document.getElementById('historyModal').classList.add('hidden');
    });
    document.getElementById('historyModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
    });

    // Deposit: open modal
    document.getElementById('depositBtn').addEventListener('click', () => {
        haptic('light');
        document.getElementById('depositModal').classList.remove('hidden');
    });
    document.getElementById('closeDeposit').addEventListener('click', () => {
        document.getElementById('depositModal').classList.add('hidden');
    });
    document.getElementById('depositModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
    });

    // Deposit option: create invoice and open Telegram payment
    document.querySelectorAll('.deposit-option').forEach(btn => {
        btn.addEventListener('click', async () => {
            const stars = parseInt(btn.dataset.stars, 10);
            if (!stars) return;
            haptic('medium');
            if (!tg?.openInvoice) {
                showDiceResult('Deposits are available inside the Telegram app. Use the bot /deposit command.', false);
                return;
            }
            try {
                const data = await apiPost('/api/deposit/create-invoice', { userId: state.userId, starAmount: stars });
                if (!data.success || !data.invoiceUrl) {
                    showDiceResult(data.error || 'Could not create invoice', false);
                    return;
                }
                document.getElementById('depositModal').classList.add('hidden');
                tg.openInvoice(data.invoiceUrl, (status) => {
                    if (status === 'paid') {
                        loadBalance();
                        showDiceResult('Deposit successful! Balance updated.', false);
                    } else if (status === 'cancelled') {
                        // User closed without paying — no message needed
                    } else {
                        showDiceResult('Payment was not completed.', false);
                    }
                });
            } catch (e) {
                console.error('Deposit error:', e);
                showDiceResult('Failed to start deposit. Try again.', false);
            }
        });
    });

    // Withdraw: open modal
    document.getElementById('withdrawBtn').addEventListener('click', () => {
        haptic('light');
        document.getElementById('withdrawModal').classList.remove('hidden');
        loadWithdrawStatus();
    });
    document.getElementById('closeWithdraw').addEventListener('click', () => {
        document.getElementById('withdrawModal').classList.add('hidden');
    });
    document.getElementById('withdrawModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
    });

    // Withdraw option: create request via API
    document.querySelectorAll('.withdraw-option').forEach(btn => {
        btn.addEventListener('click', async () => {
            const stars = parseInt(btn.dataset.stars, 10);
            if (!stars) return;
            haptic('medium');
            try {
                const data = await apiPost('/api/withdraw/request', { userId: state.userId, starAmount: stars });
                if (data.success && data.requestId) {
                    loadBalance();
                    document.getElementById('withdrawModal').classList.add('hidden');
                    showDiceResult('Request #' + data.requestId + ' created. Pending admin review.', false);
                    loadWithdrawStatus();
                } else {
                    showDiceResult(data.error || 'Withdraw failed.', false);
                }
            } catch (e) {
                console.error('Withdraw error:', e);
                showDiceResult('Failed to create withdraw request.', false);
            }
        });
    });
}

async function loadWithdrawStatus() {
    const el = document.getElementById('withdrawStatus');
    if (!el) return;
    try {
        const data = await apiGet('/api/withdraw/status?userId=' + encodeURIComponent(state.userId));
        if (!data.success || !data.requests || data.requests.length === 0) {
            el.innerHTML = '<p class="withdraw-status-empty">No withdrawal requests yet.</p>';
            return;
        }
        const lines = data.requests.slice(0, 10).map(r => {
            const status = r.status === 'pending' ? 'Pending' : r.status === 'confirmed' ? 'Approved' : 'Declined';
            return `#${r.id} ${r.starAmount} Stars — ${status}`;
        });
        el.innerHTML = '<p class="withdraw-status-title">Your requests:</p><ul class="withdraw-status-list">' +
            lines.map(l => '<li>' + l + '</li>').join('') + '</ul>';
    } catch (e) {
        el.innerHTML = '';
    }
}

// ==============================================================
//  DICE (unchanged)
// ==============================================================
function setupDiceListeners() {
    document.querySelectorAll('.target-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (state.rolling) return;
            haptic('light');
            state.target = parseInt(btn.dataset.target);
            document.querySelectorAll('.target-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            validateDirections(); updateCoefficients(); updatePotentialWin();
        });
    });
    document.querySelectorAll('.direction-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (state.rolling) return;
            haptic('light');
            state.direction = btn.dataset.direction;
            document.querySelectorAll('.direction-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            updateCoefficients(); updatePotentialWin();
        });
    });
    const betInput = document.getElementById('betAmount');
    betInput.addEventListener('input', () => {
        state.betAmount = parseFloat(betInput.value) || 0;
        updatePotentialWin();
    });
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
            input.value = val; state.betAmount = val; updatePotentialWin();
        });
    });
    document.getElementById('rollBtn').addEventListener('click', rollDice);
}

async function rollDice() {
    if (state.rolling) return;
    const amount = Math.floor(parseFloat(document.getElementById('betAmount').value) || 0);
    if (amount <= 0) { showDiceResult('Enter a valid bet amount', false); haptic('error'); return; }
    if (amount > state.balance) { showDiceResult('Insufficient balance!', false); haptic('error'); return; }
    const key = `${state.target}_${state.direction}`;
    if (!state.coefficients[key]) { showDiceResult('Invalid bet selection', false); haptic('error'); return; }

    state.rolling = true;
    const rollBtn = document.getElementById('rollBtn');
    rollBtn.classList.add('rolling');
    rollBtn.querySelector('.roll-text').textContent = 'Rolling...';
    const dice = document.getElementById('dice');
    const diceFace = document.getElementById('diceFace');
    dice.classList.add('spinning');

    let animFrames = 0;
    const animInterval = setInterval(() => {
        renderDiceFace(diceFace, Math.floor(Math.random() * 6) + 1);
        animFrames++;
    }, 80);

    try {
        const result = await apiPost('/api/games/dice/bet', {
            userId: state.userId, betAmount: amount, target: state.target, direction: state.direction
        });
        await sleep(Math.max(0, 1200 - animFrames * 80));
        clearInterval(animInterval);
        dice.classList.remove('spinning');

        if (!result.success) { showDiceResult(result.error || 'Bet failed', false); haptic('error'); }
        else {
            renderDiceFace(diceFace, result.roll);
            dice.classList.add(result.won ? 'win-shake' : 'lose-shake');
            setTimeout(() => dice.classList.remove('win-shake', 'lose-shake'), 600);
            state.balance = result.balance; updateBalanceDisplay();
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
        clearInterval(animInterval); dice.classList.remove('spinning');
        showDiceResult('Network error, please try again', false); haptic('error');
        loadBalance();
    }
    state.rolling = false;
    rollBtn.classList.remove('rolling');
    rollBtn.querySelector('.roll-text').textContent = 'Roll Dice';
}

// ==============================================================
//  ROULETTE — Board Builder
// ==============================================================
function buildRouletteBoard() {
    const board = document.getElementById('rouletteBoard');
    let html = '';

    // Zero
    html += '<div class="board-zero"><button class="board-cell cell-green" data-bet-type="straight" data-bet-number="0">0</button></div>';

    // Numbers 1-36 in 12 rows x 3 columns
    html += '<div class="board-numbers">';
    for (let row = 0; row < 12; row++) {
        for (let col = 0; col < 3; col++) {
            const n = row * 3 + col + 1;
            const color = rouletteColor(n);
            html += `<button class="board-cell cell-${color}" data-bet-type="straight" data-bet-number="${n}">${n}</button>`;
        }
    }
    html += '</div>';

    // Outside bets
    html += '<div class="board-outside">';
    html += '<div class="board-row board-row-3">';
    html += '<button class="board-cell cell-outside" data-bet-type="dozen1">1st 12</button>';
    html += '<button class="board-cell cell-outside" data-bet-type="dozen2">2nd 12</button>';
    html += '<button class="board-cell cell-outside" data-bet-type="dozen3">3rd 12</button>';
    html += '</div>';
    html += '<div class="board-row board-row-6">';
    html += '<button class="board-cell cell-outside" data-bet-type="low">1-18</button>';
    html += '<button class="board-cell cell-outside" data-bet-type="even">EVEN</button>';
    html += '<button class="board-cell cell-outside cell-red-fill" data-bet-type="red">RED</button>';
    html += '<button class="board-cell cell-outside cell-black-fill" data-bet-type="black">BLACK</button>';
    html += '<button class="board-cell cell-outside" data-bet-type="odd">ODD</button>';
    html += '<button class="board-cell cell-outside" data-bet-type="high">19-36</button>';
    html += '</div>';
    html += '</div>';

    board.innerHTML = html;
}

// ==============================================================
//  ROULETTE — Listeners & Bet Placement (API per-click)
// ==============================================================
function setupRouletteListeners() {
    // Chip selector
    document.querySelectorAll('.chip-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (roulette.phase !== 'betting') return;
            haptic('light');
            roulette.chipAmount = parseInt(btn.dataset.chip);
            document.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Board clicks — place bet (sends to server immediately)
    document.getElementById('rouletteBoard').addEventListener('click', (e) => {
        const cell = e.target.closest('.board-cell');
        if (!cell || roulette.phase !== 'betting') return;
        haptic('light');

        const betType = cell.dataset.betType;
        const betNumber = cell.dataset.betNumber != null ? parseInt(cell.dataset.betNumber) : null;
        const betKey = betType === 'straight' ? `straight_${betNumber}` : betType;

        // Optimistic local update
        const existing = roulette.bets.find(b => b.key === betKey);
        if (existing) {
            existing.amount += roulette.chipAmount;
        } else {
            roulette.bets.push({ key: betKey, betType, betNumber, amount: roulette.chipAmount });
        }
        state.balance -= roulette.chipAmount;
        updateBalanceDisplay();
        updateBoardChips();
        updatePlacedBetsList();

        // Send to server
        apiPost('/api/games/roulette/place-bet', {
            userId: state.userId,
            roundId: roulette.roundId,
            betType,
            betNumber,
            betAmount: roulette.chipAmount
        }).then(res => {
            if (res.success) {
                state.balance = res.balance;
                updateBalanceDisplay();
            } else {
                // Revert optimistic update
                revertLastBet(betKey, roulette.chipAmount);
                showRouletteResult(res.error || 'Bet failed', false);
                haptic('error');
            }
        }).catch(() => {
            revertLastBet(betKey, roulette.chipAmount);
            showRouletteResult('Network error', false);
            haptic('error');
        });
    });

    // Clear all bets
    document.getElementById('clearBetsBtn').addEventListener('click', () => {
        if (roulette.phase !== 'betting' || roulette.bets.length === 0) return;
        haptic('light');

        const prevBets = [...roulette.bets];
        roulette.bets = [];
        updateBoardChips();
        updatePlacedBetsList();

        apiPost('/api/games/roulette/clear-bets', {
            userId: state.userId,
            roundId: roulette.roundId
        }).then(res => {
            if (res.success) {
                state.balance = res.balance;
                updateBalanceDisplay();
            } else {
                roulette.bets = prevBets;
                updateBoardChips();
                updatePlacedBetsList();
                showRouletteResult(res.error || 'Clear failed', false);
            }
        }).catch(() => {
            roulette.bets = prevBets;
            updateBoardChips();
            updatePlacedBetsList();
            showRouletteResult('Network error', false);
        });
    });

    // Right-click to remove a single bet
    document.getElementById('rouletteBoard').addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const cell = e.target.closest('.board-cell');
        if (!cell || roulette.phase !== 'betting') return;
        haptic('light');

        const betType = cell.dataset.betType;
        const betNumber = cell.dataset.betNumber != null ? parseInt(cell.dataset.betNumber) : null;
        const betKey = betType === 'straight' ? `straight_${betNumber}` : betType;

        const idx = roulette.bets.findIndex(b => b.key === betKey);
        if (idx < 0) return;

        const removedBet = roulette.bets.splice(idx, 1)[0];
        updateBoardChips();
        updatePlacedBetsList();

        apiPost('/api/games/roulette/remove-bet', {
            userId: state.userId,
            roundId: roulette.roundId,
            betKey
        }).then(res => {
            if (res.success) {
                state.balance = res.balance;
                updateBalanceDisplay();
            } else {
                // Re-add
                roulette.bets.push(removedBet);
                updateBoardChips();
                updatePlacedBetsList();
                showRouletteResult(res.error || 'Remove failed', false);
            }
        }).catch(() => {
            roulette.bets.push(removedBet);
            updateBoardChips();
            updatePlacedBetsList();
            showRouletteResult('Network error', false);
        });
    });
}

/** Revert an optimistic bet addition. */
function revertLastBet(betKey, amount) {
    const idx = roulette.bets.findIndex(b => b.key === betKey);
    if (idx >= 0) {
        roulette.bets[idx].amount -= amount;
        if (roulette.bets[idx].amount <= 0) roulette.bets.splice(idx, 1);
    }
    state.balance += amount;
    updateBalanceDisplay();
    updateBoardChips();
    updatePlacedBetsList();
}

function getTotalBets() {
    return roulette.bets.reduce((sum, b) => sum + b.amount, 0);
}

function updateBoardChips() {
    document.querySelectorAll('.board-cell').forEach(cell => {
        cell.classList.remove('has-bet');
        cell.removeAttribute('data-bet-amount');
    });
    roulette.bets.forEach(bet => {
        let selector;
        if (bet.betType === 'straight') {
            selector = `.board-cell[data-bet-type="straight"][data-bet-number="${bet.betNumber}"]`;
        } else {
            selector = `.board-cell[data-bet-type="${bet.betType}"]`;
        }
        const cell = document.querySelector(selector);
        if (cell) {
            cell.classList.add('has-bet');
            cell.setAttribute('data-bet-amount', bet.amount);
        }
    });
}

function updatePlacedBetsList() {
    const list = document.getElementById('placedBetsList');
    const totalEl = document.getElementById('placedBetsTotal');
    const total = getTotalBets();
    totalEl.textContent = total.toFixed(0);

    if (roulette.bets.length === 0) {
        list.innerHTML = '<span class="no-bets-text">Tap the board to place bets</span>';
        return;
    }
    list.innerHTML = roulette.bets.map(bet => {
        const label = bet.betType === 'straight' ? `#${bet.betNumber}` : (BET_LABELS[bet.betType] || bet.betType);
        const payout = ROULETTE_PAYOUTS[bet.betType] || 2;
        return `<div class="placed-bet-item">
            <span class="pb-label">${label}</span>
            <span class="pb-amount">${bet.amount}</span>
            <span class="pb-payout">${payout}x</span>
        </div>`;
    }).join('');
}

// ==============================================================
//  ROULETTE — SSE Connection (server-driven round)
// ==============================================================
function connectRouletteSSE() {
    if (roulette.sseSource) return;

    roulette.sseSource = new EventSource('/api/games/roulette/events');

    roulette.sseSource.onmessage = (event) => {
        try {
            const serverState = JSON.parse(event.data);
            handleRouletteStateUpdate(serverState);
        } catch (e) {
            console.error('SSE parse error:', e);
        }
    };

    roulette.sseSource.onerror = () => {
        console.warn('Roulette SSE disconnected, reconnecting in 3s…');
        roulette.sseSource.close();
        roulette.sseSource = null;
        setTimeout(connectRouletteSSE, 3000);
    };

    // Start local timer interval for smooth countdown display
    if (!roulette.timerInterval) {
        roulette.timerInterval = setInterval(updateTimerDisplay, 200);
    }
}

/**
 * Handle an incoming server state event (fires on every phase change +
 * once on initial connect).
 */
function handleRouletteStateUpdate(s) {
    const prevPhase   = roulette.phase;
    const prevRoundId = roulette.roundId;

    // Sync core state
    roulette.phase         = s.phase;
    roulette.roundId       = s.roundId;
    roulette.phaseEndTime  = Date.now() + s.phaseRemainingMs;
    roulette.phaseDurationMs = s.phaseDurationMs;
    roulette.history       = (s.history || []).map(h => ({ number: h.number, color: h.color }));

    // --- Phase transitions ---

    const isNewRound = s.roundId !== prevRoundId;

    if (s.phase === 'betting') {
        // New round started (or we just connected during betting)
        if (isNewRound || prevPhase !== 'betting') {
            onNewBettingPhase();
        }
    }

    if (s.phase === 'spinning') {
        // Betting just closed
        if (prevPhase === 'betting' || (prevPhase === 'waiting' && !roulette.ballAnimating)) {
            onSpinningPhase(s);
        }
    }

    if (s.phase === 'result') {
        if (prevPhase === 'spinning' || prevPhase === 'waiting') {
            onResultPhase(s);
        }
    }

    roulette.prevPhase   = s.phase;
    roulette.prevRoundId = s.roundId;

    // Always update display
    updateRouletteDisplay();
}

/** Called when a new betting phase begins. */
function onNewBettingPhase() {
    // Clear bets from previous round
    roulette.bets = [];
    roulette.lastResult = null;
    roulette.ballAnimating = false;

    // Reset wheel display
    const numberEl = document.getElementById('rouletteNumber');
    numberEl.textContent = '?';
    numberEl.className = 'roulette-number';
    hideBall();

    setBettingUIEnabled(true);
    updateBoardChips();
    updatePlacedBetsList();

    // Fetch any previously placed bets (e.g. after page reload)
    apiGet(`/api/games/roulette/my-bets?userId=${state.userId}&roundId=${roulette.roundId}`)
        .then(res => {
            if (res.success && res.bets && res.bets.length > 0) {
                roulette.bets = res.bets.map(b => ({
                    key: b.betKey,
                    betType: b.betType,
                    betNumber: b.betNumber,
                    amount: b.betAmount
                }));
                updateBoardChips();
                updatePlacedBetsList();
            }
        })
        .catch(() => {});
}

/** Called when the spinning phase begins (result is known). */
function onSpinningPhase(s) {
    setBettingUIEnabled(false);

    if (s.result != null) {
        roulette.lastResult = { number: s.result, color: s.resultColor };

        // Animate the ball
        roulette.ballAnimating = true;
        animateBallSpin(s.result);

        // After animation, show result in center + evaluate user's bets
        setTimeout(() => {
            roulette.ballAnimating = false;
            showSpinResult(s);
        }, SPIN_ANIM_DURATION);
    }
}

/** Called when the result phase begins. */
function onResultPhase(s) {
    if (s.result != null) {
        roulette.lastResult = { number: s.result, color: s.resultColor };
    }

    // If we missed spinning (e.g. reconnected during result), show result directly
    if (!roulette.ballAnimating) {
        const numberEl = document.getElementById('rouletteNumber');
        numberEl.textContent = s.result;
        numberEl.className = `roulette-number color-${s.resultColor}`;
    }

    // Update history strip
    renderRouletteHistoryStrip();

    // Refresh balance from server (winnings were added server-side)
    loadBalance();
}

/** Display spin result in wheel center and show win/loss message. */
function showSpinResult(s) {
    const numberEl = document.getElementById('rouletteNumber');
    numberEl.textContent = s.result;
    numberEl.className = `roulette-number color-${s.resultColor}`;

    const hasBets = roulette.bets.length > 0;

    if (hasBets) {
        // Calculate local win/loss from known bets + result
        let totalPayout = 0;
        let totalBet = 0;
        let anyWon = false;
        const betResults = [];

        roulette.bets.forEach(bet => {
            const won = isLocalBetWinner(bet.betType, bet.betNumber, s.result);
            const multiplier = (ROULETTE_PAYOUTS[bet.betType] || 2);
            const payout = won ? bet.amount * multiplier : 0;
            totalPayout += payout;
            totalBet += bet.amount;
            if (won) anyWon = true;
            betResults.push({ ...bet, won });
        });

        if (anyWon) {
            showRouletteResult(`${s.result} ${s.resultColor} — You win! +${totalPayout.toFixed(2)}`, true);
            haptic('success');
            highlightWinningBets(betResults);
        } else {
            showRouletteResult(`${s.result} ${s.resultColor} — You lose! -${totalBet.toFixed(2)}`, false);
            haptic('error');
        }
    } else {
        showRouletteResult(`${s.result} ${s.resultColor}`, null);
    }

    // Glow effect
    const wheelOuter = document.getElementById('rouletteWheelOuter');
    if (hasBets) {
        const glow = roulette.bets.some(bet => isLocalBetWinner(bet.betType, bet.betNumber, s.result))
            ? 'win-glow' : 'lose-glow';
        wheelOuter.classList.add(glow);
        setTimeout(() => wheelOuter.classList.remove('win-glow', 'lose-glow'), 800);
    }

    // Refresh real balance from server
    loadBalance();
}

/** Local bet-winner check (mirrors server logic). */
function isLocalBetWinner(betType, betNumber, result) {
    switch (betType) {
        case 'straight': return result === betNumber;
        case 'red':      return RED_NUMBERS.has(result);
        case 'black':    return result > 0 && !RED_NUMBERS.has(result);
        case 'odd':      return result > 0 && result % 2 === 1;
        case 'even':     return result > 0 && result % 2 === 0;
        case 'low':      return result >= 1 && result <= 18;
        case 'high':     return result >= 19 && result <= 36;
        case 'dozen1':   return result >= 1 && result <= 12;
        case 'dozen2':   return result >= 13 && result <= 24;
        case 'dozen3':   return result >= 25 && result <= 36;
        default:         return false;
    }
}

// ==============================================================
//  ROULETTE — UI Helpers
// ==============================================================

function setBettingUIEnabled(enabled) {
    document.querySelectorAll('.board-cell').forEach(cell => {
        cell.disabled = !enabled;
    });
    document.querySelectorAll('.chip-btn').forEach(btn => {
        btn.disabled = !enabled;
    });
    const clearBtn = document.getElementById('clearBetsBtn');
    if (clearBtn) clearBtn.disabled = !enabled;

    const board = document.getElementById('rouletteBoard');
    if (enabled) {
        board.classList.remove('board-locked');
    } else {
        board.classList.add('board-locked');
    }
}

function highlightWinningBets(betResults) {
    betResults.forEach(bet => {
        if (!bet.won) return;
        let selector;
        if (bet.betType === 'straight') {
            selector = `.board-cell[data-bet-type="straight"][data-bet-number="${bet.betNumber}"]`;
        } else {
            selector = `.board-cell[data-bet-type="${bet.betType}"]`;
        }
        const cell = document.querySelector(selector);
        if (cell) {
            cell.classList.add('cell-winning');
            setTimeout(() => cell.classList.remove('cell-winning'), 3000);
        }
    });
}

/** Full display refresh (call when switching to roulette tab or on reconnect). */
function updateRouletteDisplay() {
    updateTimerDisplay();
    renderRouletteHistoryStrip();
    updateBoardChips();
    updatePlacedBetsList();
}

// ==============================================================
//  ROULETTE — Timer Display (runs locally at 200 ms)
// ==============================================================
function updateTimerDisplay() {
    const textEl  = document.getElementById('timerText');
    const countEl = document.getElementById('timerCountdown');
    const barEl   = document.getElementById('timerBar');
    const timerEl = document.getElementById('roundTimer');

    timerEl.className = 'round-timer';

    const remaining = Math.max(0, roulette.phaseEndTime - Date.now());
    const seconds   = Math.ceil(remaining / 1000);
    const pct       = roulette.phaseDurationMs > 0
        ? (remaining / roulette.phaseDurationMs) * 100
        : 0;

    switch (roulette.phase) {
        case 'betting':
            timerEl.classList.add('timer-betting');
            textEl.textContent  = 'Place your bets!';
            countEl.textContent = seconds;
            barEl.style.width   = `${pct}%`;
            break;
        case 'spinning':
            timerEl.classList.add('timer-spinning');
            textEl.textContent  = 'No more bets!';
            countEl.textContent = '';
            barEl.style.width   = '0%';
            break;
        case 'result':
            timerEl.classList.add('timer-result');
            textEl.textContent  = 'Next round in';
            countEl.textContent = seconds;
            barEl.style.width   = `${pct}%`;
            break;
        default:
            textEl.textContent  = 'Connecting...';
            countEl.textContent = '';
            barEl.style.width   = '100%';
    }
}

// ==============================================================
//  ROULETTE — Ball Animation
// ==============================================================
function animateBallSpin(resultNumber) {
    const ball = document.getElementById('rouletteBall');
    const idx = WHEEL_ORDER.indexOf(resultNumber);
    const segAngle = 360 / 37;
    const landAngle = idx * segAngle + segAngle / 2;
    const totalRotation = -(6 * 360 + (360 - landAngle));

    ball.style.transition = 'none';
    ball.style.transform = 'rotate(0deg)';
    ball.classList.add('visible');
    void ball.offsetWidth; // force reflow

    ball.style.transition = `transform ${SPIN_ANIM_DURATION - 500}ms cubic-bezier(0.12, 0.6, 0.22, 1)`;
    ball.style.transform = `rotate(${totalRotation}deg)`;
}

function hideBall() {
    const ball = document.getElementById('rouletteBall');
    ball.classList.remove('visible');
    ball.style.transition = 'none';
    ball.style.transform = 'rotate(0deg)';
}

// ==============================================================
//  ROULETTE — History Strip
// ==============================================================
function renderRouletteHistoryStrip() {
    const container = document.getElementById('historyStripNumbers');
    if (roulette.history.length === 0) {
        container.innerHTML = '<span class="no-history">No spins yet</span>';
        return;
    }
    container.innerHTML = roulette.history.map(r =>
        `<span class="history-strip-chip color-${r.color}">${r.number}</span>`
    ).join('');
}

// ==============================================================
//  Dice UI (unchanged)
// ==============================================================
function updateUI() {
    updateCoefficients();
    updatePotentialWin();
    validateDirections();
}

function updateBalanceDisplay() {
    const el = document.getElementById('balanceAmount');
    el.textContent = state.balance.toFixed(2);
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
}

function updateCoefficients() {
    const hd = state.coefficients[`${state.target}_higher`];
    const ld = state.coefficients[`${state.target}_lower`];
    document.getElementById('coefHigher').textContent = hd ? `${hd.coefficient}x` : '—';
    document.getElementById('coefLower').textContent = ld ? `${ld.coefficient}x` : '—';
    const cd = state.coefficients[`${state.target}_${state.direction}`];
    document.getElementById('winChance').textContent = cd ? `Win chance: ${cd.winChance}%` : 'Win chance: —';
    updatePotentialWin();
}

function validateDirections() {
    const hv = !!state.coefficients[`${state.target}_higher`];
    const lv = !!state.coefficients[`${state.target}_lower`];
    const bH = document.getElementById('btnHigher');
    const bL = document.getElementById('btnLower');
    bH.disabled = !hv; bL.disabled = !lv;
    if (state.direction === 'higher' && !hv && lv) {
        state.direction = 'lower'; bH.classList.remove('active'); bL.classList.add('active');
    } else if (state.direction === 'lower' && !lv && hv) {
        state.direction = 'higher'; bL.classList.remove('active'); bH.classList.add('active');
    }
}

function updatePotentialWin() {
    const data = state.coefficients[`${state.target}_${state.direction}`];
    const amount = parseFloat(document.getElementById('betAmount').value) || 0;
    const el = document.getElementById('potentialWin');
    el.textContent = (data && amount > 0) ? (amount * data.coefficient).toFixed(2) : '0.00';
}

function renderDiceFace(el, number) {
    const dots = DICE_DOTS[number] || [];
    let html = '<div class="dice-dots">';
    for (let i = 1; i <= 9; i++) html += `<span class="dot-cell${dots.includes(i) ? ' dot-active' : ''}"></span>`;
    html += '</div>';
    el.innerHTML = html;
}

function renderLastResults() {
    const c = document.getElementById('lastResults');
    if (state.lastResults.length === 0) { c.innerHTML = ''; return; }
    c.innerHTML = state.lastResults.map(r =>
        `<span class="result-chip ${r.won ? 'chip-win' : 'chip-lose'}">${r.roll}</span>`
    ).join('');
}

function showDiceResult(msg, isWin) {
    const el = document.getElementById('resultInfo');
    el.textContent = msg;
    el.className = `dice-result-info ${isWin ? 'result-win' : 'result-lose'} show`;
    clearTimeout(showDiceResult._t);
    showDiceResult._t = setTimeout(() => el.classList.remove('show'), 4000);
}

function showRouletteResult(msg, isWin) {
    const el = document.getElementById('rouletteResultInfo');
    el.textContent = msg;
    const cls = isWin === true ? 'result-win' : (isWin === false ? 'result-lose' : 'result-neutral');
    el.className = `roulette-result-info ${cls} show`;
    clearTimeout(showRouletteResult._t);
    showRouletteResult._t = setTimeout(() => el.classList.remove('show'), 6000);
}

// ==============================================================
//  History (shared — updated for multi-bet roulette)
// ==============================================================
function renderHistory(history) {
    const container = document.getElementById('historyList');
    if (!history || history.length === 0) {
        container.innerHTML = '<p class="empty-state">No games played yet</p>';
        return;
    }
    container.innerHTML = history.map(h => {
        const time = new Date(h.timestamp).toLocaleTimeString();

        if (h.type === 'deposit') {
            return `
                <div class="history-item history-win">
                    <div class="history-main">
                        <span class="history-dice">&#11088;</span>
                        <span class="history-detail">Deposit</span>
                        <span class="history-amount">+${(h.amount || 0).toFixed(2)}</span>
                    </div>
                    <div class="history-meta">
                        <span>Balance: ${(h.balanceAfter || 0).toFixed(2)}</span>
                        <span>${time}</span>
                    </div>
                </div>`;
        }
        if (h.type === 'withdrawal') {
            return `
                <div class="history-item history-lose">
                    <div class="history-main">
                        <span class="history-dice">&#8593;</span>
                        <span class="history-detail">Withdrawal request</span>
                        <span class="history-amount">-${(h.amount || 0).toFixed(2)}</span>
                    </div>
                    <div class="history-meta">
                        <span>Balance: ${(h.balanceAfter || 0).toFixed(2)}</span>
                        <span>${time}</span>
                    </div>
                </div>`;
        }
        if (h.type === 'withdrawal_refund') {
            return `
                <div class="history-item history-win">
                    <div class="history-main">
                        <span class="history-dice">&#8634;</span>
                        <span class="history-detail">Withdrawal refund</span>
                        <span class="history-amount">+${(h.amount || 0).toFixed(2)}</span>
                    </div>
                    <div class="history-meta">
                        <span>Balance: ${(h.balanceAfter || 0).toFixed(2)}</span>
                        <span>${time}</span>
                    </div>
                </div>`;
        }

        const wonClass = h.won ? 'history-win' : 'history-lose';
        const sign = h.won ? '+' : '';

        if (h.game === 'roulette') {
            const color = h.resultColor || 'green';
            const betCount = h.bets ? h.bets.length : 1;
            const betDesc = h.bets ? h.bets.map(b => {
                const l = b.betType === 'straight' ? `#${b.betNumber}` : (BET_LABELS[b.betType] || b.betType);
                return `${l}(${b.betAmount})`;
            }).join(', ') : (h.betType || '');
            return `
                <div class="history-item ${wonClass}">
                    <div class="history-main">
                        <span class="history-dice roulette-history-num color-${color}">${h.result}</span>
                        <span class="history-detail">
                            ${betDesc} &rarr; <strong>${h.result}</strong> ${color}
                        </span>
                        <span class="history-amount">${sign}${h.profit.toFixed(2)}</span>
                    </div>
                    <div class="history-meta">
                        <span>${betCount} bet${betCount > 1 ? 's' : ''} | Total: ${h.betAmount}</span>
                        <span>${time}</span>
                    </div>
                </div>`;
        }

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
            </div>`;
    }).join('');
}

function getDiceEmoji(n) {
    return { 1: '\u2680', 2: '\u2681', 3: '\u2682', 4: '\u2683', 5: '\u2684', 6: '\u2685' }[n] || '?';
}

// ==============================================================
//  Helpers
// ==============================================================
function haptic(type) {
    if (!tg?.HapticFeedback) return;
    if (type === 'success') tg.HapticFeedback.notificationOccurred('success');
    else if (type === 'error') tg.HapticFeedback.notificationOccurred('error');
    else tg.HapticFeedback.impactOccurred(type);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ==============================================================
//  Bootstrap
// ==============================================================
document.addEventListener('DOMContentLoaded', init);

// Initialize Telegram Web App
const tg = window.Telegram?.WebApp;

// App initialization
function init() {
    // Expand the Web App to full height
    if (tg) {
        tg.ready();
        tg.expand();
        applyTelegramTheme();
        setupMainButton();
    }

    setupFormHandlers();
    setupActionButtons();
}

// Apply Telegram theme colors
function applyTelegramTheme() {
    if (!tg?.themeParams) return;

    const root = document.documentElement;
    const theme = tg.themeParams;

    if (theme.bg_color) {
        root.style.setProperty('--tg-theme-bg-color', theme.bg_color);
    }
    if (theme.text_color) {
        root.style.setProperty('--tg-theme-text-color', theme.text_color);
    }
    if (theme.hint_color) {
        root.style.setProperty('--tg-theme-hint-color', theme.hint_color);
    }
    if (theme.link_color) {
        root.style.setProperty('--tg-theme-link-color', theme.link_color);
    }
    if (theme.button_color) {
        root.style.setProperty('--tg-theme-button-color', theme.button_color);
    }
    if (theme.button_text_color) {
        root.style.setProperty('--tg-theme-button-text-color', theme.button_text_color);
    }
    if (theme.secondary_bg_color) {
        root.style.setProperty('--tg-theme-secondary-bg-color', theme.secondary_bg_color);
    }
}

// Setup Telegram Main Button
function setupMainButton() {
    if (!tg?.MainButton) return;

    tg.MainButton.setText('Send to Bot');
    tg.MainButton.onClick(() => {
        const formData = getFormData();
        if (validateForm(formData)) {
            sendDataToBot(formData);
        }
    });
}

// Show/hide main button based on form validity
function updateMainButton() {
    if (!tg?.MainButton) return;

    const formData = getFormData();
    if (formData.name && formData.email) {
        tg.MainButton.show();
    } else {
        tg.MainButton.hide();
    }
}

// Get form data
function getFormData() {
    return {
        name: document.getElementById('name').value.trim(),
        email: document.getElementById('email').value.trim(),
        message: document.getElementById('message').value.trim()
    };
}

// Validate form
function validateForm(data) {
    if (!data.name) {
        showResponse('Please enter your name', 'error');
        return false;
    }
    if (!data.email || !isValidEmail(data.email)) {
        showResponse('Please enter a valid email', 'error');
        return false;
    }
    return true;
}

// Email validation
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Setup form handlers
function setupFormHandlers() {
    const form = document.getElementById('dashboardForm');
    const clearBtn = document.getElementById('clearBtn');

    // Form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = getFormData();
        if (!validateForm(formData)) return;

        try {
            const response = await fetch('/api/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            const result = await response.json();

            if (result.success) {
                showResponse('Form submitted successfully!', 'success');
                form.reset();
                updateMainButton();
            } else {
                showResponse('Submission failed. Please try again.', 'error');
            }
        } catch (error) {
            console.error('Submit error:', error);
            showResponse('Network error. Please try again.', 'error');
        }
    });

    // Clear button
    clearBtn.addEventListener('click', () => {
        form.reset();
        hideResponse();
        updateMainButton();
    });

    // Update main button on input
    form.addEventListener('input', updateMainButton);
}

// Setup action buttons
function setupActionButtons() {
    const actionButtons = document.querySelectorAll('.btn-action');

    actionButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            handleAction(action);
        });
    });
}

// Handle action button clicks
function handleAction(action) {
    // Haptic feedback if available
    if (tg?.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('light');
    }

    switch (action) {
        case 'action1':
            showResponse('Action 1 executed!', 'success');
            break;
        case 'action2':
            showResponse('Action 2 executed!', 'success');
            break;
        case 'action3':
            showResponse('Action 3 executed!', 'success');
            break;
        default:
            showResponse('Unknown action', 'error');
    }

    // Auto-hide response after 2 seconds
    setTimeout(hideResponse, 2000);
}

// Send data to Telegram bot
function sendDataToBot(data) {
    if (tg?.sendData) {
        tg.sendData(JSON.stringify(data));
    } else {
        showResponse('Data sent (dev mode)', 'success');
        console.log('Would send to bot:', data);
    }
}

// Show response message
function showResponse(message, type) {
    const responseEl = document.getElementById('response');
    responseEl.textContent = message;
    responseEl.className = `response ${type}`;
}

// Hide response message
function hideResponse() {
    const responseEl = document.getElementById('response');
    responseEl.className = 'response hidden';
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);

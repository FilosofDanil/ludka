const tg = window.Telegram?.WebApp;

function init() {
    if (tg) {
        tg.ready();
        tg.expand();
        applyTelegramTheme();
        setupMainButton();
    }

    setupFormHandlers();
    setupActionButtons();
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

function setupMainButton() {
    if (!tg?.MainButton) return;

    tg.MainButton.setText('Send to Bot');
    tg.MainButton.onClick(() => {
        const formData = getFormData();
        if (validateForm(formData)) sendDataToBot(formData);
    });
}

function updateMainButton() {
    if (!tg?.MainButton) return;

    const formData = getFormData();
    if (formData.name && formData.email) {
        tg.MainButton.show();
    } else {
        tg.MainButton.hide();
    }
}

function getFormData() {
    return {
        name: document.getElementById('name').value.trim(),
        email: document.getElementById('email').value.trim(),
        message: document.getElementById('message').value.trim()
    };
}

function validateForm(data) {
    if (!data.name) {
        showResponse('Please enter your name', 'error');
        return false;
    }
    if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        showResponse('Please enter a valid email', 'error');
        return false;
    }
    return true;
}

function setupFormHandlers() {
    const form = document.getElementById('dashboardForm');
    const clearBtn = document.getElementById('clearBtn');

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

    clearBtn.addEventListener('click', () => {
        form.reset();
        hideResponse();
        updateMainButton();
    });

    form.addEventListener('input', updateMainButton);
}

function setupActionButtons() {
    document.querySelectorAll('.btn-action').forEach(btn => {
        btn.addEventListener('click', () => {
            if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
            showResponse(`${btn.textContent} executed!`, 'success');
            setTimeout(hideResponse, 2000);
        });
    });
}

function sendDataToBot(data) {
    if (tg?.sendData) {
        tg.sendData(JSON.stringify(data));
    } else {
        showResponse('Data sent (dev mode)', 'success');
        console.log('Would send to bot:', data);
    }
}

function showResponse(message, type) {
    const el = document.getElementById('response');
    el.textContent = message;
    el.className = `response ${type}`;
}

function hideResponse() {
    document.getElementById('response').className = 'response hidden';
}

document.addEventListener('DOMContentLoaded', init);

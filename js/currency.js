import { state, saveState } from './state.js';
import { CURRENCY_SYMBOLS, COMMON_CURRENCIES } from './config.js';

export async function fetchRateOnly(targetCurrency, isSilent = false) {
    if (!targetCurrency || targetCurrency === 'USD') return 1;
    try {
        const res = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json');
        const data = await res.json();
        const rate = data.usd[targetCurrency.toLowerCase()];
        if (rate) {
            return rate;
        } else {
            if (!isSilent) alert(`Currency code "${targetCurrency}" not found on the exchange server.`);
            return null;
        }
    } catch (e) {
        console.error(e);
        if (!isSilent) alert("Failed to connect to currency API. Using offline rate if available.");
        return null; 
    }
}

export async function fetchExchangeRate(targetCurrency, isSilent = false) {
    if (!targetCurrency || targetCurrency === 'USD') return false;
    const rate = await fetchRateOnly(targetCurrency, isSilent);
    if (rate) {
        state.currentExchangeRate = rate;
        return true;
    }
    return false;
}

export async function handleCurrencyChange() {
    let inputVal = document.getElementById('global-currency').value.trim().toUpperCase();
    if (inputVal === "" || inputVal === "USD") {
        state.secondaryCurrency = ""; 
        state.currentExchangeRate = 1;
        document.getElementById('global-currency').value = "";
        document.getElementById('qc-usd').value = ""; 
        document.getElementById('qc-foreign').value = "";
        document.getElementById('qc-notes-usd').value = ""; 
        document.getElementById('qc-notes-foreign').value = "";
        saveState(); 
        updateCurrencySelectors(); 
        
        const UI = await import('./ui.js');
        UI.updateUI(); 
        return;
    }
    if (inputVal.length !== 3) { 
        document.getElementById('global-currency').value = state.secondaryCurrency || ""; 
        return; 
    }
    const success = await fetchExchangeRate(inputVal, false);
    if (success) {
        state.secondaryCurrency = inputVal; 
        if (inputVal !== 'USD') {
            state.recentCurrencies = (state.recentCurrencies || []).filter(c => c !== inputVal);
            state.recentCurrencies.unshift(inputVal);
            if (state.recentCurrencies.length > 5) state.recentCurrencies.pop();
        }
        saveState(); 
        updateCurrencySelectors(); 
        const UI = await import('./ui.js');
        UI.updateUI();
    } else {
        document.getElementById('global-currency').value = state.secondaryCurrency || "";
    }
}

export function updateCurrencySelectors() {
    const expSelector = document.getElementById('exp-currency');
    const viewSelector = document.getElementById('view-currency');
    const viewContainer = document.getElementById('dashboard-currency-toggle');
    
    const qcContainer = document.getElementById('quick-convert-container');
    const qcForeignLabel = document.getElementById('qc-foreign-label');
    const qcNotesContainer = document.getElementById('notes-quick-convert-container');
    const qcNotesForeignLabel = document.getElementById('qc-notes-foreign-label');
    
    if (!expSelector || !viewSelector || !viewContainer) return;

    const currExpVal = expSelector.value;
    const currViewVal = viewSelector.value;
    let expHtml = `<option value="USD">USD</option>`;
    let viewHtml = `<option value="USD">🇺🇸 USD ($)</option>`;
    
    if (state.secondaryCurrency) {
        const sym = CURRENCY_SYMBOLS[state.secondaryCurrency] || state.secondaryCurrency;
        expHtml += `<option value="${state.secondaryCurrency}">${state.secondaryCurrency}</option>`;
        viewHtml += `<option value="${state.secondaryCurrency}">🌎 ${state.secondaryCurrency} (${sym})</option>`;
        viewContainer.style.display = 'flex';
        
        if (qcContainer) {
            qcContainer.style.display = 'flex';
            if (qcForeignLabel) qcForeignLabel.innerText = state.secondaryCurrency;
            if (document.getElementById('qc-usd').value) quickConvert('usd');
        }

        if (qcNotesContainer) {
            qcNotesContainer.style.display = 'flex';
            if (qcNotesForeignLabel) qcNotesForeignLabel.innerText = state.secondaryCurrency;
            if (document.getElementById('qc-notes-usd').value) quickConvertNotes('usd');
        }
    } else { 
        viewContainer.style.display = 'none'; 
        if (qcContainer) qcContainer.style.display = 'none';
        if (qcNotesContainer) qcNotesContainer.style.display = 'none';
    }
    
    expSelector.innerHTML = expHtml;
    viewSelector.innerHTML = viewHtml;
    
    if(state.secondaryCurrency && currExpVal === state.secondaryCurrency) expSelector.value = state.secondaryCurrency;
    if(state.secondaryCurrency && currViewVal === state.secondaryCurrency) viewSelector.value = state.secondaryCurrency;
    
    import('./ui.js').then(UI => {
        UI.updateFormCurrencyUI();
    });
}

export function formatMoney(amountInUsd, displayCurOverride = null, rateOverride = null) {
    const displayCur = displayCurOverride || (document.getElementById('view-currency')?.value || 'USD');
    if (displayCur === 'USD') { 
        return `$${amountInUsd.toFixed(2)}`; 
    } else {
        const rate = (rateOverride !== null && rateOverride !== undefined) ? rateOverride : state.currentExchangeRate;
        const converted = amountInUsd * rate;
        const sym = CURRENCY_SYMBOLS[displayCur] ? CURRENCY_SYMBOLS[displayCur] : displayCur + ' ';
        return `${sym}${converted.toFixed(2)}`;
    }
}

export function getPerDayText(amount) {
    if (!state.showPerDay || state.tripDays <= 0) return '';
    return ` <span style="font-size: 0.8rem; color: var(--primary); font-weight: 800; background: #eef2ff; padding: 2px 6px; border-radius: 6px; margin-left: 8px;">${formatMoney(amount / state.tripDays)}/d</span>`;
}

export function getPerDayTextSmall(amount) {
    if (!state.showPerDay || state.tripDays <= 0) return '';
    return ` <span class="tabular-nums" style="display: inline-block; font-size: 0.75rem; color: var(--primary); font-weight: 700; margin-left: 4px;">(${formatMoney(amount / state.tripDays)}/d)</span>`;
}

export function quickConvert(source) {
    const usdInput = document.getElementById('qc-usd');
    const fxInput = document.getElementById('qc-foreign');
    if (!state.currentExchangeRate || state.currentExchangeRate <= 0 || !usdInput || !fxInput) return;
    
    if (source === 'usd') {
        const usdVal = parseFloat(usdInput.value);
        if (!isNaN(usdVal)) fxInput.value = (usdVal * state.currentExchangeRate).toFixed(2);
        else fxInput.value = '';
    } else {
        const fxVal = parseFloat(fxInput.value);
        if (!isNaN(fxVal)) usdInput.value = (fxVal / state.currentExchangeRate).toFixed(2);
        else usdInput.value = '';
    }
}

export function quickConvertNotes(source) {
    const usdInput = document.getElementById('qc-notes-usd');
    const fxInput = document.getElementById('qc-notes-foreign');
    if (!state.currentExchangeRate || state.currentExchangeRate <= 0 || !usdInput || !fxInput) return;
    
    if (source === 'usd') {
        const usdVal = parseFloat(usdInput.value);
        if (!isNaN(usdVal)) fxInput.value = (usdVal * state.currentExchangeRate).toFixed(2);
        else fxInput.value = '';
    } else {
        const fxVal = parseFloat(fxInput.value);
        if (!isNaN(fxVal)) usdInput.value = (fxVal / state.currentExchangeRate).toFixed(2);
        else usdInput.value = '';
    }
}

// --- Currency Picker Logic ---
let pickerEl = null;

export function positionCurrencyPicker() {
    if (!pickerEl || !pickerEl.classList.contains('show')) return;
    const inputEl = document.getElementById('global-currency');
    if (!inputEl) return;
    
    const rect = inputEl.getBoundingClientRect();
    pickerEl.style.top = `${rect.bottom}px`;
    pickerEl.style.left = `${rect.left + (rect.width / 2)}px`;
}

export function showCurrencyPicker() {
    const inputEl = document.getElementById('global-currency');
    if (!inputEl) return;

    if (!pickerEl) {
        pickerEl = document.createElement('div');
        pickerEl.className = 'currency-picker';
        document.body.appendChild(pickerEl);
        
        document.addEventListener('mousedown', (e) => {
            const globalInput = document.getElementById('global-currency');
            if (pickerEl && pickerEl.classList.contains('show') && !pickerEl.contains(e.target) && e.target !== globalInput) {
                hideCurrencyPicker();
                if (globalInput && globalInput.value.trim().toUpperCase() !== (state.secondaryCurrency || "")) {
                    handleCurrencyChange();
                }
            }
        });
        
        window.addEventListener('resize', positionCurrencyPicker);
        window.addEventListener('scroll', positionCurrencyPicker, true);
    }

    renderCurrencyPicker(inputEl.value);
    pickerEl.classList.add('show');
    positionCurrencyPicker();
}

export function hideCurrencyPicker() {
    if (pickerEl) pickerEl.classList.remove('show');
}

export function renderCurrencyPicker(filterText = '') {
    if (!pickerEl) return;
    
    const filter = filterText.trim().toLowerCase();
    let html = '';
    const recents = state.recentCurrencies || [];

    if (recents.length > 0 && !filter) {
        html += `<div class="currency-picker-section-label">Recent</div>`;
        recents.forEach(code => {
            const currencyInfo = COMMON_CURRENCIES.find(c => c.code === code) || { code, flag: '🌍', name: 'Custom' };
            html += `<div class="currency-picker-item recent" onmousedown="applyCurrencyFromPicker('${code}'); event.preventDefault();">
                        <span class="currency-picker-flag">${currencyInfo.flag}</span>
                        <span class="currency-picker-code">${code}</span>
                        <span class="currency-picker-name">${currencyInfo.name}</span>
                     </div>`;
        });
    }

    let filteredCommon = COMMON_CURRENCIES;
    if (filter) {
        filteredCommon = COMMON_CURRENCIES.filter(c => c.code.toLowerCase().includes(filter) || c.name.toLowerCase().includes(filter));
    }

    if (filteredCommon.length > 0) {
        html += `<div class="currency-picker-section-label">${filter ? 'Results' : 'Common'}</div>`;
        filteredCommon.forEach(c => {
            if (!filter && recents.includes(c.code)) return;
            html += `<div class="currency-picker-item" onmousedown="applyCurrencyFromPicker('${c.code}'); event.preventDefault();">
                        <span class="currency-picker-flag">${c.flag}</span>
                        <span class="currency-picker-code">${c.code}</span>
                        <span class="currency-picker-name">${c.name}</span>
                     </div>`;
        });
    }

    if (html === '') {
        html = `<div style="padding: 12px; text-align: center; font-size: 0.8rem; color: var(--secondary);">No matches</div>`;
    }

    pickerEl.innerHTML = html;
}

export function applyCurrencyFromPicker(code) {
    const inputEl = document.getElementById('global-currency');
    if (inputEl) {
        inputEl.value = code;
        hideCurrencyPicker();
        handleCurrencyChange();
    }
}

export function handleCurrencyInput() {
    const inputEl = document.getElementById('global-currency');
    if (inputEl) {
        renderCurrencyPicker(inputEl.value);
        if (pickerEl) pickerEl.classList.add('show');
    }
}

export function handleCurrencyKeyDown(e) {
    if (e.key === 'Escape') {
        hideCurrencyPicker();
        const inputEl = document.getElementById('global-currency');
        if (inputEl) inputEl.value = state.secondaryCurrency || ""; 
    } else if (e.key === 'Enter') {
        hideCurrencyPicker();
        handleCurrencyChange();
        e.target.blur();
    }
}

// Bind to window for HTML event handlers compatibility
window.handleCurrencyChange = handleCurrencyChange;
window.quickConvert = quickConvert;
window.quickConvertNotes = quickConvertNotes;
window.showCurrencyPicker = showCurrencyPicker;
window.hideCurrencyPicker = hideCurrencyPicker;
window.applyCurrencyFromPicker = applyCurrencyFromPicker;
window.handleCurrencyInput = handleCurrencyInput;
window.handleCurrencyKeyDown = handleCurrencyKeyDown;

import { state, saveState, repairLegacyData, buildTripPayload } from './state.js';
import { updateCurrencySelectors } from './currency.js';

function formatLabel(date) {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' + 
           date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// Track which cloud slot is currently active so history saves to the right place
let currentSlotId = 'auto_trip';
export function setCurrentHistorySlot(slotId) {
    currentSlotId = slotId;
}

// Guard flag: prevent pushHistorySnapshot from running during a restore
let isApplyingSnapshot = false;

let historyCloudSyncTimeout = null;
function scheduleHistoryCloudSync() {
    if (state.isOfflineMode) return;
    clearTimeout(historyCloudSyncTimeout);
    historyCloudSyncTimeout = setTimeout(() => {
        if (!state.isOfflineMode) {
            import('./db.js').then(DB => DB.saveHistoryToCloud(currentSlotId));
        }
    }, 1500);
}

function persistHistoryLocal() {
    localStorage.setItem('tripSplitterHistory', JSON.stringify({
        forTripName: state.tripName,
        historyStack: state.historyStack
    }));
}

export function pushHistorySnapshot() {
    if (!state.historyEnabled) return;
    if (isApplyingSnapshot) return;  // Guard: don't snapshot during a restore
    const savedAt = Date.now();
    
    const currentPayload = structuredClone(buildTripPayload(false));
    if (state.historyStack.length > 0) {
        const lastPayload = state.historyStack[state.historyStack.length - 1].payload;
        if (JSON.stringify(lastPayload) === JSON.stringify(currentPayload)) return;
    }

    const snapshot = { savedAt, label: formatLabel(new Date(savedAt)), payload: currentPayload };
    state.historyStack.push(snapshot);
    if (state.historyStack.length > 3) state.historyStack.shift(); 
    
    persistHistoryLocal();
    scheduleHistoryCloudSync();
}

export async function restoreHistoryState(index) {
    if (index < 0 || index >= state.historyStack.length) return;
    
    const { payload } = state.historyStack[index];
    state.historyStack = state.historyStack.slice(0, index);

    state.tripName = payload.tripName; 
    state.tripComment = payload.tripComment;
    state.participants = payload.participants || [];
    state.participantGroups = payload.participantGroups || {};
    state.expenses = payload.expenses || [];
    state.secondaryCurrency = payload.secondaryCurrency || "";
    state.currentExchangeRate = (payload.currentExchangeRate !== undefined && payload.currentExchangeRate !== null)
        ? payload.currentExchangeRate
        : (state.secondaryCurrency ? 0 : 1);
    state.recentCurrencies = payload.recentCurrencies || [];
    state.currencyRates = (payload.currencyRates && typeof payload.currencyRates === 'object' && !Array.isArray(payload.currencyRates))
        ? payload.currencyRates
        : {};
    state.currentSort = payload.currentSort || 'date-desc';
    state.tripDays = payload.tripDays || 1;
    state.showPerDay = payload.showPerDay || false;
    state.tripNotes = payload.tripNotes || "";
    state.tripNotesDelta = payload.tripNotesDelta || null;
    state.autoColorNotes = payload.autoColorNotes || false;
    state.isHeaderCollapsed = payload.isHeaderCollapsed || false;
    state.defaultTags = payload.defaultTags || ['car', 'gas', 'flight', 'stay', 'grocery', 'restaurant'];

    repairLegacyData();
    
    isApplyingSnapshot = true;  // Prevent recursive snapshot
    saveState(false, true); 
    isApplyingSnapshot = false;
    
    const UI = await import('./ui.js');
    UI.applyHeaderState();
    UI.syncStateToDOM(); 
    updateCurrencySelectors({ selectSecondary: true });
    UI.updateUI(); 
    UI.cancelEdit();
    UI.renderHistoryUI();
    
    if (window.showToast) window.showToast('Trip state restored', 'undo');
    
    persistHistoryLocal();
    scheduleHistoryCloudSync();
}

export function clearHistory() {
    state.historyStack = [];
    localStorage.removeItem('tripSplitterHistory');
}

export function loadHistoryLocal() {
    try {
        const saved = localStorage.getItem('tripSplitterHistory');
        if (!saved) return;
        const data = JSON.parse(saved);
        if (data.forTripName === state.tripName) {
            state.historyStack = data.historyStack || [];
        } else {
            state.historyStack = [];
        }
    } catch(e) {
        state.historyStack = [];
    }
}

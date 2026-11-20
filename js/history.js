import { state, saveState, repairLegacyData, buildTripPayload } from './state.js';
import { updateCurrencySelectors } from './currency.js';
import { validateHistoryStack, validateAndSanitizeTripPayload } from './security.js';

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
let lastKnownPayload = null;

export function syncHistoryBaseline() {
    lastKnownPayload = structuredClone(buildTripPayload(false));
}

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
    try {
        localStorage.setItem('tripSplitterHistory', JSON.stringify({
            forTripName: state.tripName,
            historyStack: state.historyStack
        }));
    } catch (err) {
        console.warn('Failed to persist trip history to localStorage:', err);
    }
}

export function pushHistorySnapshot() {
    if (!state.historyEnabled) return;
    if (isApplyingSnapshot) return;  // Guard: don't snapshot during a restore
    const savedAt = Date.now();
    
    const currentPayload = structuredClone(buildTripPayload(false));
    if (!lastKnownPayload) {
        lastKnownPayload = currentPayload;
        return;
    }
    if (JSON.stringify(lastKnownPayload) === JSON.stringify(currentPayload)) return;

    const snapshot = { savedAt, label: formatLabel(new Date(savedAt)), payload: lastKnownPayload };
    lastKnownPayload = currentPayload;
    state.historyStack.push(snapshot);
    if (state.historyStack.length > 3) state.historyStack.shift(); 
    
    persistHistoryLocal();
    scheduleHistoryCloudSync();
}

export async function restoreHistoryState(index) {
    if (index < 0 || index >= state.historyStack.length) return;
    
    const payload = validateAndSanitizeTripPayload(state.historyStack[index]?.payload);
    if (!payload) return;
    state.historyStack = state.historyStack.slice(0, index);

    if (payload.tripId) state.tripId = payload.tripId;
    state.tripName = payload.tripName; 
    state.tripComment = payload.tripComment;
    state.participants = payload.participants;
    state.participantGroups = payload.participantGroups;
    state.expenses = payload.expenses;
    state.secondaryCurrency = payload.secondaryCurrency;
    state.currentExchangeRate = payload.currentExchangeRate;
    state.recentCurrencies = payload.recentCurrencies;
    state.currencyRates = payload.currencyRates;
    state.currentSort = payload.currentSort;
    state.tripDays = payload.tripDays;
    state.showPerDay = payload.showPerDay;
    state.tripNotes = payload.tripNotes;
    state.tripNotesDelta = payload.tripNotesDelta;
    state.autoColorNotes = payload.autoColorNotes;
    state.isHeaderCollapsed = payload.isHeaderCollapsed;
    state.defaultTags = payload.defaultTags;

    repairLegacyData();
    syncHistoryBaseline();
    
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
    
    if (typeof UI.showToast === 'function') UI.showToast('Trip state restored', 'undo');
    
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
        if (!saved) {
            syncHistoryBaseline();
            return;
        }
        const data = JSON.parse(saved);
        if (data && data.forTripName === state.tripName) {
            state.historyStack = validateHistoryStack(data.historyStack);
        } else {
            state.historyStack = [];
        }
    } catch(e) {
        state.historyStack = [];
    }
    syncHistoryBaseline();
}

import { state, saveState, repairLegacyData } from './state.js';

function formatLabel(date) {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' + 
           date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function buildPayload() {
    return {
        tripName: state.tripName,
        tripComment: state.tripComment,
        participants: state.participants,
        participantGroups: state.participantGroups,
        expenses: state.expenses,
        secondaryCurrency: state.secondaryCurrency,
        currentExchangeRate: state.currentExchangeRate,
        currentSort: state.currentSort,
        tripDays: state.tripDays,
        showPerDay: state.showPerDay,
        tripNotes: state.tripNotes,
        tripNotesDelta: state.tripNotesDelta,
        autoColorNotes: state.autoColorNotes,
        isHeaderCollapsed: state.isHeaderCollapsed,
        defaultTags: state.defaultTags
    };
}

let historyCloudSyncTimeout = null;
function scheduleHistoryCloudSync() {
    clearTimeout(historyCloudSyncTimeout);
    historyCloudSyncTimeout = setTimeout(() => {
        import('./db.js').then(DB => DB.saveHistoryToCloud('auto_trip'));
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
    const savedAt = Date.now();
    
    const currentPayload = buildPayload();
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
    state.currentExchangeRate = payload.currentExchangeRate || 1;
    state.currentSort = payload.currentSort || 'date-desc';
    state.tripDays = payload.tripDays || 1;
    state.showPerDay = payload.showPerDay || false;
    state.tripNotes = payload.tripNotes || "";
    state.tripNotesDelta = payload.tripNotesDelta || null;
    state.autoColorNotes = payload.autoColorNotes || false;
    state.isHeaderCollapsed = payload.isHeaderCollapsed || false;
    state.defaultTags = payload.defaultTags || ['car', 'guess', 'flight', 'stay', 'grocery', 'restaurant'];

    repairLegacyData();
    saveState(true); 
    
    const UI = await import('./ui.js');
    UI.applyHeaderState();
    UI.syncStateToDOM(); 
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

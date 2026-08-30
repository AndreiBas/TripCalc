import { state, loadState } from './state.js';
import { initNotesEditor } from './notes.js';
import { initCalculatorFocusTracker, initCalculatorDraggable } from './calculator.js';
import { initCalendarFocusTracker, initCalendarDraggable } from './calendar.js';
import { applyHeaderState, updateUI, updateFormColor, syncStateToDOM } from './ui.js';
import { updateCurrencySelectors } from './currency.js';
import { fetchCloudTripNames, updateSyncBtnState } from './db.js';
import './export.js';
import { loadHistoryLocal, restoreHistoryState } from './history.js';

// Boot Sequence
function bootApp() {
    loadState();
    loadHistoryLocal();
    syncStateToDOM();
    applyHeaderState();
    updateCurrencySelectors();
    updateUI();
    updateFormColor();
    initNotesEditor();
    initCalculatorFocusTracker();
    initCalculatorDraggable();
    initCalendarFocusTracker();
    initCalendarDraggable();
    fetchCloudTripNames();
    updateSyncBtnState();
}

// Run boot sequence when DOM is ready
if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', bootApp);
} else {
    bootApp();
}

// --- WAKE-UP EVENT LISTENERS ---
let isFetchingCloudNames = false;
const debouncedFetch = () => {
    if (isFetchingCloudNames) return;
    isFetchingCloudNames = true;
    fetchCloudTripNames().finally(() => {
        setTimeout(() => isFetchingCloudNames = false, 500);
    });
};

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') debouncedFetch();
});

window.addEventListener('focus', debouncedFetch);
window.addEventListener('online', debouncedFetch);

window.addEventListener('beforeunload', function (e) {
    if (state.isNotesDirty || state.cloudSyncTimeout) {
        e.preventDefault();
        e.returnValue = '';
        return '';
    }
});

// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/TripCalc/sw.js')
            .then(registration => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            })
            .catch(err => {
                console.log('ServiceWorker registration failed: ', err);
            });
    });
}

window.restoreHistoryState = restoreHistoryState;

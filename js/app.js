import { state, loadState } from './state.js';
import { initNotesEditor } from './notes.js';
import { initCalculatorFocusTracker, initCalculatorDraggable } from './calculator.js';
import { initCalendarDraggable } from './calendar.js';
import { applyHeaderState, updateUI, updateFormColor, syncStateToDOM, showToast } from './ui.js';
import { updateCurrencySelectors, warmCurrencyRatesCache } from './currency.js';
import { fetchCloudTripNames, updateSyncBtnState } from './db.js';
import './export.js';
import { loadHistoryLocal, restoreHistoryState } from './history.js';

// --- WAKE-UP EVENT LISTENERS ---
let isFetchingCloudNames = false;
const debouncedFetch = () => {
    if (isFetchingCloudNames) return;
    isFetchingCloudNames = true;
    fetchCloudTripNames().finally(() => {
        setTimeout(() => isFetchingCloudNames = false, 500);
    });
};

// Boot Sequence
function bootApp() {
    loadState();
    loadHistoryLocal();
    syncStateToDOM();
    applyHeaderState();
    updateCurrencySelectors({ selectSecondary: true });
    updateUI();
    updateFormColor();
    initNotesEditor();
    initCalculatorFocusTracker();
    initCalculatorDraggable();
    initCalendarDraggable();
    debouncedFetch();
    updateSyncBtnState();
    warmCurrencyRatesCache(false);
}

// Run boot sequence when DOM is ready
if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', bootApp);
} else {
    bootApp();
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') debouncedFetch();
});

window.addEventListener('focus', debouncedFetch);
window.addEventListener('online', () => {
    debouncedFetch();
    if (!state.isOfflineMode) {
        warmCurrencyRatesCache(false);
    }
});

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
        const hadController = Boolean(navigator.serviceWorker.controller);
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (hadController) {
                showToast('✨ New TripCalc version ready — reload to update.', 'save');
            }
        });
        navigator.serviceWorker.register('./sw.js')
            .then(registration => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            })
            .catch(err => {
                console.log('ServiceWorker registration failed: ', err);
            });
    });
}

window.restoreHistoryState = restoreHistoryState;

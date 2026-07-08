import { loadState } from './state.js';
import { initNotesEditor } from './notes.js';
import { initCalculatorFocusTracker, initCalculatorDraggable } from './calculator.js';
import { initCalendarFocusTracker, initCalendarDraggable } from './calendar.js';
import { applyHeaderState, updateUI, updateFormColor, syncStateToDOM } from './ui.js';
import { updateCurrencySelectors } from './currency.js';
import { fetchCloudTripNames, updateSyncBtnState } from './db.js';
import './export.js';

// Boot Sequence
function bootApp() {
    loadState();
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
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        fetchCloudTripNames();
    }
});

window.addEventListener('focus', () => {
    fetchCloudTripNames();
});

window.addEventListener('online', () => {
    fetchCloudTripNames();
});

window.addEventListener('beforeunload', function (e) {
    // Triggers the browser's native "Leave site? Changes you made may not be saved" prompt
    e.preventDefault();
    e.returnValue = '';
    return '';
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

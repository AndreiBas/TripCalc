import { state, loadState } from './state.js';
import {
    initNotesEditor,
    openNotesModal,
    closeNotesModal,
    copyTripNotes,
    toggleAutoColor,
    searchNotes,
    showNotesToC,
    clearNotesSearchField
} from './notes.js';
import {
    initCalculatorFocusTracker,
    initCalculatorDraggable,
    toggleCalculator,
    calcInput,
    calcDelete,
    calcClear,
    calcSolve,
    calcCopy
} from './calculator.js';
import {
    initCalendarDraggable,
    toggleCalendar,
    prevMonth,
    nextMonth,
    calendarGoToToday,
    calendarFilterLedger,
    calendarClearFilter
} from './calendar.js';
import {
    applyHeaderState,
    updateUI,
    updateFormColor,
    syncStateToDOM,
    showToast,
    initUIEventDelegation,
    addParticipant,
    handleParticipantKeyPress,
    saveGroupTemplate,
    loadGroupTemplate,
    resetTrip,
    updateTripName,
    updateTripComment,
    toggleHeader,
    toggleLedger,
    toggleActivityCard,
    togglePerDay,
    updateTripDays,
    handleCategoryChange,
    updatePayerColor,
    toggleAllCheckboxes,
    updateSplitTypeUI,
    calculateRemainingPercentage,
    handleFormCurrencyChange,
    refreshFormRate,
    handleFormTagInput,
    handleSearchInput,
    handleSortChange,
    clearSearch,
    saveExpense,
    toggleAllExpenses,
    cancelEdit,
    toggleHelpModal,
    closeHelpModalOnOverlay,
    addDefaultTag,
    handleDefaultTagKeyPress,
    addTagToBulkList,
    closeBulkEditTagsModal,
    applyBulkEditTags,
    handleBulkTagAutocomplete,
    handleBulkNewTagKeyPress,
    toggleHistoryEnabled
} from './ui.js';
import {
    updateCurrencySelectors,
    warmCurrencyRatesCache,
    quickConvert,
    quickConvertNotes,
    showCurrencyPicker,
    handleCurrencyInput,
    handleCurrencyKeyDown
} from './currency.js';
import {
    fetchCloudTripNames,
    updateSyncBtnState,
    manageCloudSync,
    toggleOfflineMode,
    saveToSupabase,
    loadFromSupabase,
    openCloudSettingsModal,
    lockCloudSession,
    initSessionIdleLock,
    disconnectLocalSync,
    openChangePinModal,
    submitChangePin,
    openNuclearResetModal,
    submitNuclearReset,
    cancelCloudAuth,
    submitCloudSetup,
    submitPinUnlock,
    submitFilePassword,
    cancelFilePassword,
    exportTrip,
    exportSecureTrip,
    importTrip
} from './db.js';
import { exportHTMLReport } from './export.js';
import { loadHistoryLocal } from './history.js';

// --- WAKE-UP EVENT LISTENERS ---
let isFetchingCloudNames = false;
const debouncedFetch = () => {
    if (isFetchingCloudNames) return;
    isFetchingCloudNames = true;
    fetchCloudTripNames().finally(() => {
        setTimeout(() => isFetchingCloudNames = false, 500);
    });
};

let staticListenersInitialized = false;
function bindEl(id, eventName, handler) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(eventName, handler);
}

function initStaticEventListeners() {
    if (staticListenersInitialized || typeof document === 'undefined') return;
    staticListenersInitialized = true;

    // Mini Calculator
    bindEl('calc-close-btn', 'click', toggleCalculator);
    bindEl('calc-clear-btn', 'click', calcClear);
    bindEl('calc-delete-btn', 'click', calcDelete);
    bindEl('calc-solve-btn', 'click', calcSolve);
    bindEl('calc-copy-btn', 'click', calcCopy);
    const calcContainer = document.getElementById('mini-calculator');
    if (calcContainer) {
        calcContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-calc-input]');
            if (btn) calcInput(btn.dataset.calcInput);
        });
    }

    // Mini Calendar
    bindEl('calendar-today-btn', 'click', calendarGoToToday);
    bindEl('calendar-close-btn', 'click', toggleCalendar);
    bindEl('calendar-prev-btn', 'click', prevMonth);
    bindEl('calendar-next-btn', 'click', nextMonth);
    bindEl('calendar-apply-btn', 'click', calendarFilterLedger);
    bindEl('calendar-clear-btn', 'click', calendarClearFilter);

    // Header & Toolbar
    bindEl('trip-name', 'change', updateTripName);
    bindEl('header-toggle-btn', 'click', toggleHeader);
    bindEl('trip-comment', 'change', updateTripComment);
    bindEl('open-notes-btn', 'click', openNotesModal);
    bindEl('master-sync-btn', 'click', manageCloudSync);
    bindEl('offline-mode-btn', 'click', () => toggleOfflineMode());
    bindEl('reset-trip-btn', 'click', resetTrip);
    bindEl('export-trip-btn', 'click', exportTrip);
    bindEl('import-trip-btn', 'click', () => document.getElementById('file-import')?.click());
    bindEl('file-import', 'click', (e) => { e.target.value = null; });
    bindEl('file-import', 'change', importTrip);

    bindEl('global-currency', 'focus', showCurrencyPicker);
    bindEl('global-currency', 'input', handleCurrencyInput);
    bindEl('global-currency', 'keydown', handleCurrencyKeyDown);
    bindEl('qc-usd', 'input', () => quickConvert('usd'));
    bindEl('qc-foreign', 'input', () => quickConvert('foreign'));

    // Delegated Cloud Status & Update Banner Actions
    const cloudStatus = document.getElementById('cloud-status');
    if (cloudStatus) {
        cloudStatus.addEventListener('click', (e) => {
            if (e.target.closest('[data-action="manage-cloud-sync"]')) {
                manageCloudSync();
            }
        });
    }
    const cloudBanner = document.getElementById('cloud-update-banner');
    if (cloudBanner) {
        cloudBanner.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action="load-cloud-slot"]');
            if (btn && btn.dataset.slot) {
                loadFromSupabase(btn.dataset.slot);
            }
        });
    }

    // Cloud Slot Buttons
    document.querySelectorAll('[data-cloud-save]').forEach(btn => {
        btn.addEventListener('click', () => saveToSupabase(btn.dataset.cloudSave));
    });
    document.querySelectorAll('[data-cloud-load]').forEach(btn => {
        btn.addEventListener('click', () => loadFromSupabase(btn.dataset.cloudLoad));
    });

    // Participants & Settings
    bindEl('new-participant', 'keydown', handleParticipantKeyPress);
    bindEl('new-participant-group', 'keydown', handleParticipantKeyPress);
    bindEl('add-participant-btn', 'click', addParticipant);
    bindEl('new-default-tag', 'keydown', handleDefaultTagKeyPress);
    bindEl('add-default-tag-btn', 'click', addDefaultTag);
    bindEl('open-cloud-settings-btn', 'click', openCloudSettingsModal);
    bindEl('history-enabled-toggle', 'change', toggleHistoryEnabled);
    bindEl('open-help-btn', 'click', toggleHelpModal);
    bindEl('export-html-btn', 'click', exportHTMLReport);
    bindEl('export-secure-btn', 'click', exportSecureTrip);
    bindEl('save-group-template-btn', 'click', saveGroupTemplate);
    bindEl('load-group-template-btn', 'click', loadGroupTemplate);

    // Mobile Quick Nav
    document.querySelectorAll('.mobile-quick-nav button').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.scrollTop === 'true') {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else if (btn.dataset.scrollTarget) {
                document.getElementById(btn.dataset.scrollTarget)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    // Activity Card Form
    bindEl('activity-toggle-icon', 'click', (e) => {
        e.stopPropagation();
        toggleActivityCard();
    });
    bindEl('activity-header', 'click', toggleActivityCard);
    bindEl('activity-calc-btn', 'click', (e) => {
        e.stopPropagation();
        toggleCalculator();
    });
    bindEl('exp-category', 'change', handleCategoryChange);
    bindEl('exp-desc', 'input', (e) => {
        const el = e.target;
        if (!el.value) return;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const nextVal = el.value.charAt(0).toUpperCase() + el.value.slice(1);
        if (nextVal !== el.value) {
            el.value = nextVal;
            if (start !== null && end !== null) {
                try { el.setSelectionRange(start, end); } catch (_) {}
            }
        }
    });
    bindEl('exp-tags', 'input', handleFormTagInput);
    bindEl('exp-tags', 'focus', handleFormTagInput);
    bindEl('exp-amount', 'input', calculateRemainingPercentage);
    bindEl('exp-currency', 'change', handleFormCurrencyChange);
    bindEl('exp-payer', 'change', updatePayerColor);
    bindEl('refresh-rate-btn', 'click', refreshFormRate);
    bindEl('master-participant-checkbox', 'change', (e) => toggleAllCheckboxes(e.target.checked));
    bindEl('exp-split-type', 'change', () => updateSplitTypeUI());
    bindEl('save-expense-btn', 'click', saveExpense);
    bindEl('cancel-edit-btn', 'click', cancelEdit);

    // Ledger Card
    bindEl('ledger-toggle-icon', 'click', toggleLedger);
    bindEl('ledger-header-title', 'click', toggleLedger);
    bindEl('ledger-sort', 'change', handleSortChange);
    bindEl('toggle-all-btn', 'click', toggleAllExpenses);
    bindEl('ledger-calendar-btn', 'click', toggleCalendar);
    bindEl('search-filter', 'input', handleSearchInput);
    bindEl('search-filter', 'focus', handleSearchInput);
    bindEl('clear-search-btn', 'click', clearSearch);

    // Analytics & Settlement
    bindEl('per-day-toggle', 'change', togglePerDay);
    bindEl('trip-days-input', 'input', () => updateTripDays(false));
    bindEl('trip-days-input', 'change', () => updateTripDays(true));
    bindEl('trip-days-input', 'blur', () => updateTripDays(true));
    bindEl('view-currency', 'change', updateUI);

    // Help Modal
    bindEl('help-overlay', 'click', closeHelpModalOnOverlay);
    bindEl('help-close-x', 'click', toggleHelpModal);
    bindEl('help-close-btn', 'click', toggleHelpModal);

    // Notes Modal
    bindEl('notes-search', 'input', searchNotes);
    bindEl('notes-search', 'focus', showNotesToC);
    bindEl('clear-notes-search-btn', 'click', clearNotesSearchField);
    bindEl('qc-notes-usd', 'input', () => quickConvertNotes('usd'));
    bindEl('qc-notes-foreign', 'input', () => quickConvertNotes('foreign'));
    bindEl('copy-notes-btn', 'click', copyTripNotes);
    bindEl('notes-calc-btn', 'click', toggleCalculator);
    bindEl('notes-calendar-btn', 'click', toggleCalendar);
    bindEl('auto-color-toggle', 'change', toggleAutoColor);
    bindEl('close-notes-btn', 'click', closeNotesModal);

    // Cloud Settings & Auth Modals
    bindEl('modal-offline-toggle', 'change', (e) => toggleOfflineMode(e.target.checked));
    bindEl('lock-session-btn', 'click', () => lockCloudSession('manual'));
    bindEl('open-change-pin-btn', 'click', openChangePinModal);
    bindEl('disconnect-local-sync-btn', 'click', disconnectLocalSync);
    bindEl('open-nuclear-reset-btn', 'click', openNuclearResetModal);
    bindEl('close-cloud-settings-btn', 'click', () => {
        document.getElementById('cloud-settings-overlay')?.classList.remove('active');
    });

    bindEl('new-session-pin', 'keydown', (e) => { if (e.key === 'Enter') submitChangePin(); });
    bindEl('cancel-change-pin-btn', 'click', () => {
        document.getElementById('change-pin-overlay')?.classList.remove('active');
    });
    bindEl('submit-change-pin-btn', 'click', submitChangePin);

    bindEl('cancel-nuclear-btn', 'click', () => {
        document.getElementById('nuclear-reset-overlay')?.classList.remove('active');
    });
    bindEl('submit-nuclear-btn', 'click', submitNuclearReset);

    bindEl('setup-session-pin', 'keydown', (e) => { if (e.key === 'Enter') submitCloudSetup(); });
    bindEl('cancel-cloud-setup-btn', 'click', cancelCloudAuth);
    bindEl('submit-cloud-setup-btn', 'click', submitCloudSetup);

    bindEl('unlock-session-pin', 'keydown', (e) => { if (e.key === 'Enter') submitPinUnlock(); });
    bindEl('cancel-pin-unlock-btn', 'click', cancelCloudAuth);
    bindEl('submit-pin-unlock-btn', 'click', submitPinUnlock);

    // File Password Modal
    bindEl('file-password-input', 'keydown', (e) => { if (e.key === 'Enter') submitFilePassword(); });
    bindEl('file-password-confirm', 'keydown', (e) => { if (e.key === 'Enter') submitFilePassword(); });
    bindEl('cancel-file-password-btn', 'click', cancelFilePassword);
    bindEl('submit-file-password-btn', 'click', submitFilePassword);

    // Bulk Edit Tags Modal
    bindEl('bulk-new-tag', 'keydown', handleBulkNewTagKeyPress);
    bindEl('bulk-new-tag', 'input', handleBulkTagAutocomplete);
    bindEl('bulk-new-tag', 'focus', handleBulkTagAutocomplete);
    bindEl('add-bulk-tag-btn', 'click', addTagToBulkList);
    bindEl('cancel-bulk-tags-btn', 'click', closeBulkEditTagsModal);
    bindEl('apply-bulk-tags-btn', 'click', applyBulkEditTags);
}

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
    initStaticEventListeners();
    initUIEventDelegation();
    initSessionIdleLock();
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

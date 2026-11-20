import { CATEGORIES } from './config.js';
import {
    safeHasOwn,
    isForbiddenKey,
    sanitizeExpenseId,
    sanitizeDateString,
    validateAndSanitizeTripPayload,
    generateSecureId
} from './security.js';

export const state = {
    tripId: "",
    tripName: "My Trip",
    tripComment: "", 
    participants: [],
    participantGroups: {}, 
    expenses: [],
    editingExpenseId: null, 
    searchText: "",
    insightFilter: null, 
    
    tripDays: 1,
    showPerDay: false,

    secondaryCurrency: "", 
    currentExchangeRate: 1, 
    recentCurrencies: [],
    currencyRates: {},
    currentSort: 'date-desc',
    isHeaderCollapsed: false,
    
    // Cloud & Encryption State
    supabaseClient: null,
    cloudSyncTimeout: null,
    cloudTripNames: { manual_trip: "", manual_trip_2: "", manual_trip_3: "", auto_trip: "" },
    cloudTripIds: { manual_trip: "", manual_trip_2: "", manual_trip_3: "", auto_trip: "" },
    sessionPin: "", 
    pinFailedAttempts: typeof localStorage !== 'undefined' ? (parseInt(localStorage.getItem('tripSplitter_pinFailedAttempts') || '0', 10) || 0) : 0, 
    cloudAuthPromiseResolve: null,

    localLastModified: 0,
    dataRevision: 0,
    cloudTimestamps: { manual_trip: 0, manual_trip_2: 0, manual_trip_3: 0, auto_trip: 0 },
    cloudRevisions: { manual_trip: 0, manual_trip_2: 0, manual_trip_3: 0, auto_trip: 0 },
    cloudHashes: { manual_trip: "", manual_trip_2: "", manual_trip_3: "", auto_trip: "" },

    // Globals explicitly for PDF Export parsing
    currentSettlements: [],
    currentFilteredExpenses: [],
    currentTotalSpent: 0,
    currentStats: {
        groupStats: {}, categoryTotals: {}, categoryParticipations: {}, categoryActivityCounts: {},
        biggestSplurge: {desc: '', amount: 0, category: ''}, mostExpensiveDay: {date: '', amount: 0}, tripBanker: {name: '', paid: 0}, totalSpent: 0, validActiveCount: 0
    },
    currentGroupBalances: [],

    // Notes Variables
    tripNotes: "", 
    tripNotesDelta: null, 
    autoColorNotes: false,
    quill: null,
    notesDebounceTimer: null,
    activeSearchTerm: "",
    lastQuillRange: null, 
    isNotesDirty: false,

    activeCategoryFilters: new Set(Object.keys(CATEGORIES)),
    selectedCalendarDates: new Set(),
    defaultTags: ['car', 'gas', 'flight', 'stay', 'grocery', 'restaurant'],
    
    // Trip History
    historyEnabled: false,
    historyStack: [],

    // Offline Mode & Pending Sync
    isOfflineMode: typeof localStorage !== 'undefined' && localStorage.getItem('tripSplitter_isOfflineMode') === 'true',
    hasPendingCloudSync: typeof localStorage !== 'undefined' && localStorage.getItem('tripSplitter_hasPendingCloudSync') === 'true',
    hasUnsyncedLocalData: typeof localStorage !== 'undefined' && localStorage.getItem('tripSplitter_hasUnsyncedLocalData') === 'true',
    lastSyncedHash: typeof localStorage !== 'undefined' ? (localStorage.getItem('tripSplitter_lastSyncedHash') || "") : ""
};

export function generateTripId() {
    return generateSecureId();
}

export function getLocalDateString(date = new Date()) {
    const d = (date instanceof Date && !isNaN(date.getTime())) ? date : new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function canonicalizeForHash(val) {
    if (Array.isArray(val)) return val.map(canonicalizeForHash);
    if (val && typeof val === 'object') {
        const out = {};
        Object.keys(val).sort().forEach(k => {
            if (val[k] !== undefined) out[k] = canonicalizeForHash(val[k]);
        });
        return out;
    }
    return val;
}

export function computeTripContentHash(payload) {
    const canonicalObj = canonicalizeForHash({
        tripName: payload?.tripName || "",
        tripComment: payload?.tripComment || "",
        participants: Array.isArray(payload?.participants) ? payload.participants : [],
        participantGroups: payload?.participantGroups || {},
        expenses: Array.isArray(payload?.expenses) ? payload.expenses : [],
        secondaryCurrency: payload?.secondaryCurrency || "",
        tripDays: payload?.tripDays || 1,
        tripNotes: payload?.tripNotes || "",
        tripNotesDelta: payload?.tripNotesDelta || null,
        defaultTags: Array.isArray(payload?.defaultTags) ? payload.defaultTags : []
    });
    const str = JSON.stringify(canonicalObj);
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

export function setUnsyncedLocalData(isUnsynced) {
    state.hasUnsyncedLocalData = Boolean(isUnsynced);
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem('tripSplitter_hasUnsyncedLocalData', state.hasUnsyncedLocalData ? 'true' : 'false');
    }
}

export function setLastSyncedHash(hash) {
    state.lastSyncedHash = hash || "";
    if (typeof localStorage !== 'undefined') {
        if (state.lastSyncedHash) {
            localStorage.setItem('tripSplitter_lastSyncedHash', state.lastSyncedHash);
        } else {
            localStorage.removeItem('tripSplitter_lastSyncedHash');
        }
    }
}

export function setPendingCloudSync(isPending) {
    state.hasPendingCloudSync = Boolean(isPending);
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem('tripSplitter_hasPendingCloudSync', state.hasPendingCloudSync ? 'true' : 'false');
        localStorage.removeItem('tripSplitter_pendingSync');
    }
}

export function buildTripPayload(includeLastModified = true) {
    const payload = {
        tripId: state.tripId || "",
        dataRevision: state.dataRevision || 0,
        tripName: state.tripName,
        tripComment: state.tripComment,
        participants: state.participants,
        participantGroups: state.participantGroups,
        expenses: state.expenses,
        secondaryCurrency: state.secondaryCurrency,
        currentExchangeRate: state.currentExchangeRate,
        currencyRates: state.currencyRates || {},
        currentSort: state.currentSort,
        tripDays: state.tripDays,
        showPerDay: state.showPerDay,
        tripNotes: state.tripNotes,
        tripNotesDelta: state.tripNotesDelta,
        autoColorNotes: state.autoColorNotes,
        isHeaderCollapsed: state.isHeaderCollapsed,
        recentCurrencies: state.recentCurrencies,
        defaultTags: state.defaultTags,
        historyEnabled: state.historyEnabled
    };
    if (includeLastModified) {
        payload.lastModified = state.localLastModified;
    }
    return payload;
}

export function repairLegacyData() {
    if (!Array.isArray(state.participants)) {
        state.participants = [];
    } else {
        state.participants = state.participants.filter(p => typeof p === 'string' && p.trim() !== '' && !isForbiddenKey(p));
    }
    if (!state.participantGroups || typeof state.participantGroups !== 'object' || Array.isArray(state.participantGroups)) {
        state.participantGroups = {};
    }
    if (!state.currencyRates || typeof state.currencyRates !== 'object' || Array.isArray(state.currencyRates)) {
        state.currencyRates = {};
    }
    if (state.secondaryCurrency && Number.isFinite(state.currentExchangeRate) && state.currentExchangeRate > 0 && !safeHasOwn(state.currencyRates, state.secondaryCurrency)) {
        state.currencyRates[state.secondaryCurrency] = state.currentExchangeRate;
    }
    state.participants.forEach(p => { 
        if (!safeHasOwn(state.participantGroups, p) || isForbiddenKey(state.participantGroups[p])) {
            state.participantGroups[p] = p; 
        }
    });

    if (!Array.isArray(state.expenses)) {
        state.expenses = [];
    }
    state.expenses.forEach((e, i) => {
        if (!e.involved) e.involved = [...state.participants];
        e.id = sanitizeExpenseId(e.id);
        if (typeof e.ignored === 'undefined') e.ignored = false;
        if (!safeHasOwn(CATEGORIES, e.category)) e.category = 'Other';
        if (!e.personalExpenses || typeof e.personalExpenses !== 'object' || Array.isArray(e.personalExpenses)) e.personalExpenses = {}; 
        if (!e.fixedShares || typeof e.fixedShares !== 'object' || Array.isArray(e.fixedShares)) e.fixedShares = {}; 
        if (!e.splitType) e.splitType = 'equal'; 
        if (!e.percentageShares || typeof e.percentageShares !== 'object' || Array.isArray(e.percentageShares)) e.percentageShares = {}; 
        if (typeof e.notes === 'undefined') e.notes = ''; 
        if (!e.timestamp || !Number.isFinite(Number(e.timestamp))) e.timestamp = Date.now() + i; 
        if (!Number.isFinite(Number(e.amount)) || Number(e.amount) < 0) {
            e.amount = 0;
        }
        if (e.localAmount === undefined || e.localAmount === null || !Number.isFinite(Number(e.localAmount))) {
            e.localAmount = e.amount;
        }
        const hasForeignMath = Number.isFinite(e.exchangeRate) && e.exchangeRate > 0 && Math.abs(e.exchangeRate - 1) > 0.0001 &&
            Number.isFinite(e.localAmount) && Number.isFinite(e.amount) && Math.abs(e.localAmount - e.amount) > 0.05 &&
            Math.abs((e.localAmount / e.exchangeRate) - e.amount) <= Math.max(0.05, Math.abs(e.amount) * 0.01);
        if (!e.localCurrency) {
            if (hasForeignMath) {
                const secRate = state.secondaryCurrency ? (safeHasOwn(state.currencyRates, state.secondaryCurrency) ? state.currencyRates[state.secondaryCurrency] : state.currentExchangeRate) : 0;
                if (state.secondaryCurrency && Number.isFinite(secRate) && secRate > 0 && Math.abs(e.exchangeRate - secRate) / secRate <= 0.15) {
                    e.localCurrency = state.secondaryCurrency;
                } else {
                    e.localCurrency = 'FX';
                }
            } else {
                e.localCurrency = 'USD';
            }
        }
        if (!e.tags) e.tags = [];
        e.date = sanitizeDateString(e.date, '') || getLocalDateString();
        
        // Fair currency lock repair for old data
        if ((!e.exchangeRate || !Number.isFinite(e.exchangeRate) || e.exchangeRate <= 0) && e.localCurrency !== 'USD') {
            e.exchangeRate = (e.amount && e.amount !== 0) ? (e.localAmount / e.amount) : 1;
        }
        if (!Number.isFinite(e.exchangeRate) || e.exchangeRate <= 0) {
            e.exchangeRate = 1;
        }

        // Recover unknown/ghost payer to prevent undefined groupStats crashes
        if (e.payer && typeof e.payer === 'string' && !isForbiddenKey(e.payer) && !state.participants.includes(e.payer)) {
            state.participants.push(e.payer);
            if (!safeHasOwn(state.participantGroups, e.payer)) {
                state.participantGroups[e.payer] = e.payer;
            }
        }
        // Recover unknown/ghost involved participants
        if (Array.isArray(e.involved)) {
            e.involved.forEach(inv => {
                if (inv && typeof inv === 'string' && !isForbiddenKey(inv) && !state.participants.includes(inv)) {
                    state.participants.push(inv);
                    if (!safeHasOwn(state.participantGroups, inv)) {
                        state.participantGroups[inv] = inv;
                    }
                }
            });
        }
    });

    const expensesByRecency = [...state.expenses].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    expensesByRecency.forEach(e => {
        if (e.localCurrency && e.localCurrency !== 'USD' && e.localCurrency !== 'FX' && !isForbiddenKey(e.localCurrency) && Number.isFinite(e.exchangeRate) && e.exchangeRate > 0) {
            if (!safeHasOwn(state.currencyRates, e.localCurrency)) {
                state.currencyRates[e.localCurrency] = e.exchangeRate;
            }
        }
    });

    if (!state.defaultTags || !Array.isArray(state.defaultTags)) {
        state.defaultTags = ['car', 'gas', 'flight', 'stay', 'grocery', 'restaurant'];
    } else {
        state.defaultTags = state.defaultTags.map(t => t === 'guess' ? 'gas' : t);
    }
}

export function saveState(skipAutoSync = false, skipHistorySnapshot = false, preserveLastModified = false) {
    if (!preserveLastModified) {
        if (!state.tripId) {
            state.tripId = generateTripId();
        }
        state.dataRevision = (state.dataRevision || 0) + 1;
        const now = Date.now();
        state.localLastModified = now <= state.localLastModified ? state.localLastModified + 1 : now;
        setUnsyncedLocalData(true);
    }

    if (!skipHistorySnapshot && !preserveLastModified) {
        import('./history.js').then(H => H.pushHistorySnapshot());
    }
    
    const payload = buildTripPayload(true);

    try {
        localStorage.setItem('tripSplitterLatest', JSON.stringify(payload));
    } catch (err) {
        console.error("Failed to persist state to localStorage:", err);
        if (typeof document !== 'undefined') {
            import('./ui.js').then(UI => {
                if (typeof UI.showToast === 'function') {
                    UI.showToast('⚠️ Local storage full! Export a backup and trim notes/history.', 'warning');
                }
            }).catch(() => {});
        }
    }

    if (preserveLastModified) {
        return;
    }

    if (state.isOfflineMode) {
        setPendingCloudSync(true);
        const statusEl = typeof document !== 'undefined' ? document.getElementById('cloud-status') : null;
        if (statusEl) {
            statusEl.innerHTML = `<span style="color: #d97706; font-weight: 700;">📴 Offline (Pending sync)</span>`;
        }
    } else if (typeof state.triggerCloudSync === 'function') {
        state.triggerCloudSync(skipAutoSync);
    }
}

export function loadState() {
    if (typeof localStorage !== 'undefined') {
        state.isOfflineMode = localStorage.getItem('tripSplitter_isOfflineMode') === 'true';
        state.hasPendingCloudSync = localStorage.getItem('tripSplitter_hasPendingCloudSync') === 'true';
        state.hasUnsyncedLocalData = localStorage.getItem('tripSplitter_hasUnsyncedLocalData') === 'true';
        state.lastSyncedHash = localStorage.getItem('tripSplitter_lastSyncedHash') || "";
        state.pinFailedAttempts = parseInt(localStorage.getItem('tripSplitter_pinFailedAttempts') || '0', 10) || 0;
        if (localStorage.getItem('tripSplitter_pendingSync') === 'true') {
            setPendingCloudSync(true);
        }
    }

    const saved = localStorage.getItem('tripSplitterLatest');
    if (saved) {
        try {
            const raw = JSON.parse(saved);
            const data = validateAndSanitizeTripPayload(raw, { defaultTripName: 'My Trip' });
            if (!data) return false;
            state.tripId = data.tripId;
            state.tripName = data.tripName;
            state.tripComment = data.tripComment; 
            state.participants = data.participants;
            state.participantGroups = data.participantGroups;
            state.expenses = data.expenses;
            state.secondaryCurrency = data.secondaryCurrency;
            state.currentExchangeRate = data.currentExchangeRate;
            state.currencyRates = data.currencyRates;
            state.currentSort = data.currentSort;
            state.tripDays = data.tripDays;
            state.showPerDay = data.showPerDay;
            state.tripNotes = data.tripNotes;
            state.tripNotesDelta = data.tripNotesDelta;
            state.autoColorNotes = data.autoColorNotes;
            state.isHeaderCollapsed = data.isHeaderCollapsed;
            state.recentCurrencies = data.recentCurrencies;
            state.localLastModified = data.lastModified;
            state.dataRevision = data.dataRevision;
            state.defaultTags = data.defaultTags;
            state.historyEnabled = data.historyEnabled;

            repairLegacyData();
            return true;
        } catch(err) {
            console.error("Failed to parse saved state:", err);
        }
    }
    return false;
}

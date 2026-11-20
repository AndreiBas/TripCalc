import { CATEGORIES } from './config.js';

export const state = {
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
    sessionPin: "", 
    pinFailedAttempts: 0, 
    cloudAuthPromiseResolve: null,

    localLastModified: 0,
    cloudTimestamps: { manual_trip: 0, manual_trip_2: 0, manual_trip_3: 0, auto_trip: 0 },

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
    hasPendingCloudSync: typeof localStorage !== 'undefined' && localStorage.getItem('tripSplitter_hasPendingCloudSync') === 'true'
};

export function setPendingCloudSync(isPending) {
    state.hasPendingCloudSync = Boolean(isPending);
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem('tripSplitter_hasPendingCloudSync', state.hasPendingCloudSync ? 'true' : 'false');
        localStorage.removeItem('tripSplitter_pendingSync');
    }
}

export function buildTripPayload(includeLastModified = true) {
    const payload = {
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
    }
    if (typeof state.participantGroups === 'undefined' || state.participantGroups === null) {
        state.participantGroups = {};
    }
    if (!state.currencyRates || typeof state.currencyRates !== 'object' || Array.isArray(state.currencyRates)) {
        state.currencyRates = {};
    }
    if (state.secondaryCurrency && isFinite(state.currentExchangeRate) && state.currentExchangeRate > 0 && !state.currencyRates[state.secondaryCurrency]) {
        state.currencyRates[state.secondaryCurrency] = state.currentExchangeRate;
    }
    state.participants.forEach(p => { 
        if (!state.participantGroups[p]) state.participantGroups[p] = p; 
    });

    state.expenses.forEach((e, i) => {
        if (!e.involved) e.involved = [...state.participants];
        if (!e.id) e.id = Math.random().toString(36).substr(2, 9); 
        if (typeof e.ignored === 'undefined') e.ignored = false;
        if (!e.category) e.category = 'Other';
        if (!e.personalExpenses) e.personalExpenses = {}; 
        if (!e.fixedShares) e.fixedShares = {}; 
        if (!e.splitType) e.splitType = 'equal'; 
        if (!e.percentageShares) e.percentageShares = {}; 
        if (typeof e.notes === 'undefined') e.notes = ''; 
        if (!e.timestamp) e.timestamp = Date.now() + i; 
        if (e.localAmount === undefined || e.localAmount === null || isNaN(Number(e.localAmount))) {
            e.localAmount = e.amount;
        }
        const hasForeignMath = isFinite(e.exchangeRate) && e.exchangeRate > 0 && Math.abs(e.exchangeRate - 1) > 0.0001 &&
            isFinite(e.localAmount) && isFinite(e.amount) && Math.abs(e.localAmount - e.amount) > 0.05 &&
            Math.abs((e.localAmount / e.exchangeRate) - e.amount) <= Math.max(0.05, Math.abs(e.amount) * 0.01);
        if (!e.localCurrency) {
            if (hasForeignMath) {
                const secRate = state.secondaryCurrency ? (state.currencyRates[state.secondaryCurrency] || state.currentExchangeRate) : 0;
                if (state.secondaryCurrency && isFinite(secRate) && secRate > 0 && Math.abs(e.exchangeRate - secRate) / secRate <= 0.15) {
                    e.localCurrency = state.secondaryCurrency;
                } else {
                    e.localCurrency = 'FX';
                }
            } else {
                e.localCurrency = 'USD';
            }
        }
        if (!e.tags) e.tags = [];
        if (!e.date) e.date = new Date().toISOString().split('T')[0];
        
        // Fair currency lock repair for old data
        if ((!e.exchangeRate || !isFinite(e.exchangeRate) || e.exchangeRate <= 0) && e.localCurrency !== 'USD') {
            e.exchangeRate = (e.amount && e.amount !== 0) ? (e.localAmount / e.amount) : 1;
        }
        if (!isFinite(e.exchangeRate) || e.exchangeRate <= 0) {
            e.exchangeRate = 1;
        }

        // Recover unknown/ghost payer to prevent undefined groupStats crashes
        if (e.payer && !state.participants.includes(e.payer)) {
            state.participants.push(e.payer);
            if (!state.participantGroups[e.payer]) {
                state.participantGroups[e.payer] = e.payer;
            }
        }
        // Recover unknown/ghost involved participants
        if (Array.isArray(e.involved)) {
            e.involved.forEach(inv => {
                if (inv && !state.participants.includes(inv)) {
                    state.participants.push(inv);
                    if (!state.participantGroups[inv]) {
                        state.participantGroups[inv] = inv;
                    }
                }
            });
        }
    });

    const expensesByRecency = [...state.expenses].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    expensesByRecency.forEach(e => {
        if (e.localCurrency && e.localCurrency !== 'USD' && e.localCurrency !== 'FX' && isFinite(e.exchangeRate) && e.exchangeRate > 0) {
            if (!state.currencyRates[e.localCurrency]) {
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

export function saveState(skipAutoSync = false, skipHistorySnapshot = false) {
    if (!skipHistorySnapshot) {
        import('./history.js').then(H => H.pushHistorySnapshot());
    }
    const now = Date.now();
    state.localLastModified = now <= state.localLastModified ? state.localLastModified + 1 : now;
    
    const payload = buildTripPayload(true);

    try {
        localStorage.setItem('tripSplitterLatest', JSON.stringify(payload));
    } catch (err) {
        console.error("Failed to persist state to localStorage:", err);
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
    const saved = localStorage.getItem('tripSplitterLatest');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            state.tripName = data.tripName || "My Trip";
            state.tripComment = data.tripComment || ""; 
            state.participants = data.participants || [];
            state.participantGroups = data.participantGroups || {};
            state.expenses = data.expenses || [];
            state.secondaryCurrency = data.secondaryCurrency || "";
            state.currentExchangeRate = (data.currentExchangeRate !== undefined && data.currentExchangeRate !== null && !isNaN(data.currentExchangeRate))
                ? Number(data.currentExchangeRate)
                : (state.secondaryCurrency ? 0 : 1);
            state.currencyRates = (data.currencyRates && typeof data.currencyRates === 'object' && !Array.isArray(data.currencyRates))
                ? data.currencyRates
                : {};
            state.currentSort = data.currentSort || 'date-desc';
            state.tripDays = data.tripDays || 1;
            state.showPerDay = data.showPerDay || false;
            state.tripNotes = data.tripNotes || "";
            state.tripNotesDelta = data.tripNotesDelta || null;
            state.autoColorNotes = data.autoColorNotes || false;
            state.isHeaderCollapsed = data.isHeaderCollapsed || false;
            state.recentCurrencies = data.recentCurrencies || [];
            state.localLastModified = data.lastModified || Date.now();
            state.defaultTags = data.defaultTags || ['car', 'gas', 'flight', 'stay', 'grocery', 'restaurant'];
            state.historyEnabled = data.historyEnabled || false;
            
            if (typeof localStorage !== 'undefined') {
                state.isOfflineMode = localStorage.getItem('tripSplitter_isOfflineMode') === 'true';
                state.hasPendingCloudSync = localStorage.getItem('tripSplitter_hasPendingCloudSync') === 'true';
                if (localStorage.getItem('tripSplitter_pendingSync') === 'true') {
                    setPendingCloudSync(true);
                }
            }

            repairLegacyData();
            return true;
        } catch(err) {
            console.error("Failed to parse saved state:", err);
        }
    }
    return false;
}

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

    activeCategoryFilters: new Set(Object.keys(CATEGORIES))
};

export function repairLegacyData() {
    if (typeof state.participantGroups === 'undefined' || state.participantGroups === null) {
        state.participantGroups = {};
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
        if (!e.localCurrency) e.localCurrency = 'USD';
        if (!e.localAmount) e.localAmount = e.amount;
        if (!e.tags) e.tags = [];
        
        // Fair currency lock repair for old data
        if (!e.exchangeRate && e.localCurrency !== 'USD') {
            e.exchangeRate = e.localAmount / e.amount;
        }
    });
}

export function saveState(skipAutoSync = false) {
    state.localLastModified = Date.now();
    
    const payload = { 
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
        lastModified: state.localLastModified
    };

    localStorage.setItem('tripSplitterLatest', JSON.stringify(payload));

    if (typeof state.triggerCloudSync === 'function') {
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
            state.currentExchangeRate = data.currentExchangeRate || 1;
            state.currentSort = data.currentSort || 'date-desc';
            state.tripDays = data.tripDays || 1;
            state.showPerDay = data.showPerDay || false;
            state.tripNotes = data.tripNotes || "";
            state.tripNotesDelta = data.tripNotesDelta || null;
            state.autoColorNotes = data.autoColorNotes || false;
            state.isHeaderCollapsed = data.isHeaderCollapsed || false;
            state.localLastModified = data.lastModified || Date.now();
            
            repairLegacyData();
            return true;
        } catch(err) {
            console.error("Failed to parse saved state:", err);
        }
    }
    return false;
}

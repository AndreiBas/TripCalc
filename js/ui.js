import { state, saveState, loadState } from './state.js';
import { CATEGORIES, COLORS, TAG_COLORS, CURRENCY_SYMBOLS } from './config.js';
import { formatMoney, getPerDayText, getPerDayTextSmall, fetchExchangeRate, updateCurrencySelectors } from './currency.js';

// --- HELPERS ---
export function getColor(name) {
    const index = state.participants.indexOf(name);
    return index === -1 ? '#64748b' : COLORS[index % COLORS.length];
}

export function getGroupColor(groupName) {
    if (!groupName) return '#64748b';
    let hash = 0;
    for (let i = 0; i < groupName.length; i++) {
        hash = groupName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % COLORS.length;
    return COLORS[index];
}

export function formatDateDisplay(dateStr) {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    if (!year || !month || !day) return dateStr;
    const dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `${year} ${months[dateObj.getMonth()]} ${day} ${days[dateObj.getDay()]}`;
}

export function shortName(name) {
    if (!name) return '';
    return name.length > 4 ? name.substring(0, 4) : name;
}

export function getTagStyle(tag) {
    let hash = 0;
    for (let i = 0; i < tag.length; i++) {
        hash = tag.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % TAG_COLORS.length;
    const c = TAG_COLORS[index];
    return `background: ${c.bg}; color: ${c.color}; border: 1px solid ${c.border};`;
}

export function getAllUniqueTags() {
    const tagSet = new Set(state.defaultTags || []);
    state.expenses.forEach(e => {
        if (e.tags && Array.isArray(e.tags)) {
            e.tags.forEach(t => tagSet.add(t));
        }
    });
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
}

export function getTagsFromShownExpenses(cleanSearchText) {
    const groupsMap = {};
    state.participants.forEach(p => {
        const gName = state.participantGroups[p] || p;
        if (!groupsMap[gName]) groupsMap[gName] = [];
        groupsMap[gName].push(p);
    });
    
    const tagSet = new Set();
    state.expenses.forEach(e => {
        if (!e.ignored && doesExpenseMatchFilters(e, groupsMap, cleanSearchText)) {
            if (e.tags && Array.isArray(e.tags)) {
                e.tags.forEach(t => tagSet.add(t));
            }
        }
    });
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
}

export function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.position = 'fixed';
        container.style.top = '24px';
        container.style.left = '50%';
        container.style.transform = 'translateX(-50%)';
        container.style.zIndex = '10000';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '8px';
        container.style.pointerEvents = 'none';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.style.background = 'rgba(15, 23, 42, 0.9)'; // Dark glassmorphism
    toast.style.color = '#ffffff';
    toast.style.padding = '12px 24px';
    toast.style.borderRadius = '30px';
    toast.style.fontSize = '0.9rem';
    toast.style.fontWeight = '700';
    toast.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)';
    toast.style.backdropFilter = 'blur(8px)';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-15px)';
    toast.style.transition = 'opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1), transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
    toast.style.border = '1px solid rgba(255,255,255,0.15)';
    toast.style.pointerEvents = 'auto';
    toast.style.textAlign = 'center';
    
    const icon = type === 'create' ? '✨' : '✏️';
    toast.innerText = `${icon} ${message}`;

    container.appendChild(toast);

    // Trigger reflow
    toast.offsetHeight;

    // Fade in
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';

    // Remove toast after 2.5 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-15px)';
        setTimeout(() => {
            if (toast.parentNode === container) {
                container.removeChild(toast);
            }
            if (container.children.length === 0 && container.parentNode === document.body) {
                document.body.removeChild(container);
            }
        }, 300);
    }, 2500);
}

// --- FILTER MATCHING ---
export function doesExpenseMatchFilters(e, groupsMap, overrideSearchText) {
    const cat = e.category || 'Other';
    
    // Calendar Date Filter
    if (state.selectedCalendarDates && state.selectedCalendarDates.size > 0) {
        if (!state.selectedCalendarDates.has(e.date)) return false;
    }

    if (state.insightFilter) {
        if (cat !== state.insightFilter.cat) return false;
        const groupMembers = groupsMap[state.insightFilter.name] || [state.insightFilter.name];
        const involvesTarget = groupMembers.includes(e.payer) || e.involved.some(p => groupMembers.includes(p));
        if (!involvesTarget) return false;
    } else {
        if (!state.activeCategoryFilters.has(cat)) return false;
    }
    
    const searchInputRaw = (overrideSearchText !== undefined ? overrideSearchText : state.searchText).trim();
    if (!searchInputRaw) return true;

    let requiredTags = [];
    let excludedTags = [];
    let requiredText = [];
    const parts = searchInputRaw.split(/\s+/);
    parts.forEach(p => {
        if (p.startsWith('-#') && p.length > 2) {
            excludedTags.push(p.substring(2).toLowerCase());
        } else if (p.startsWith('#') && p.length > 1) {
            requiredTags.push(p.substring(1).toLowerCase());
        } else if (p !== '#' && p !== '-#') {
            requiredText.push(p.toLowerCase());
        }
    });

    const expTags = (e.tags || []).map(t => t.toLowerCase());
    const hasAllTags = requiredTags.every(rt => expTags.some(t => t.includes(rt)));
    const hasNoExcludedTags = !excludedTags.some(et => expTags.some(t => t.includes(et)));
    
    const involvedNames = e.involved ? e.involved.join(' ') : '';
    const searchableText = `${e.desc} ${e.payer} ${involvedNames} ${e.notes || ''}`.toLowerCase();
    
    const hasAllText = requiredText.every(rt => searchableText.includes(rt));

    return hasAllTags && hasNoExcludedTags && hasAllText;
}

// --- PARTICIPANTS CRUD ---
export function handleParticipantKeyPress(event) { 
    if (event.key === 'Enter') { 
        event.preventDefault(); 
        addParticipant(); 
    } 
}

export function addParticipant() {
    const val = document.getElementById('new-participant').value.trim().toUpperCase();
    let groupVal = document.getElementById('new-participant-group').value.trim();
    if (val && !state.participants.includes(val)) {
        state.participants.push(val); 
        state.participantGroups[val] = groupVal || val;
        document.getElementById('new-participant').value = ''; 
        document.getElementById('new-participant-group').value = ''; 
        saveState(); 
        updateUI();
    } else if (state.participants.includes(val)) {
        alert("Participant already added!");
    }
}

export function renameParticipant(oldName) {
    const newNameInput = prompt(`Rename ${oldName} to (Max 12 chars):`, oldName);
    if (!newNameInput) return;
    const newName = newNameInput.trim().toUpperCase();
    if (newName === oldName || newName === "") return;
    if (newName.length > 12) { 
        alert("Name is too long! Please keep it to 12 characters or less."); 
        return; 
    }
    if (state.participants.includes(newName)) { 
        alert("Name already exists."); 
        return; 
    }

    const idx = state.participants.indexOf(oldName);
    state.participants[idx] = newName;
    state.participantGroups[newName] = state.participantGroups[oldName] === oldName ? newName : state.participantGroups[oldName];
    delete state.participantGroups[oldName];

    state.expenses.forEach(e => {
        if (e.payer === oldName) e.payer = newName;
        const involvedIdx = e.involved.indexOf(oldName);
        if (involvedIdx > -1) e.involved[involvedIdx] = newName;
        if (e.personalExpenses && e.personalExpenses[oldName]) {
            e.personalExpenses[newName] = e.personalExpenses[oldName]; 
            delete e.personalExpenses[oldName];
        }
        if (e.fixedShares && e.fixedShares[oldName] !== undefined) {
            e.fixedShares[newName] = e.fixedShares[oldName]; 
            delete e.fixedShares[oldName];
        }
        if (e.percentageShares && e.percentageShares[oldName]) {
            e.percentageShares[newName] = e.percentageShares[oldName]; 
            delete e.percentageShares[oldName];
        }
    });
    saveState(); 
    updateUI();
}

export function changeGroup(name) {
    const currentGroup = state.participantGroups[name] === name ? "" : state.participantGroups[name];
    let newGroup = prompt(`Assign ${name} to a Family/Group:\n(Leave blank to keep them separate)`, currentGroup);
    if (newGroup === null) return; 
    state.participantGroups[name] = newGroup.trim() || name;
    saveState(); 
    updateUI();
}

export function deleteParticipant(name) {
    const inUse = state.expenses.some(e => e.payer === name || e.involved.includes(name));
    if (inUse) { 
        alert(`Cannot delete ${name} because they are tied to an existing activity.`); 
        return; 
    }
    if (confirm(`Remove ${name} from the trip?`)) {
        state.participants = state.participants.filter(p => p !== name);
        delete state.participantGroups[name];
        saveState(); 
        updateUI();
    }
}

export function saveGroupTemplate() {
    if (state.participants.length === 0 && (!state.defaultTags || state.defaultTags.length === 0)) { 
        alert("Nothing to save."); 
        return; 
    }
    localStorage.setItem('tripSplitter_GroupTemplate', JSON.stringify({
        participants: state.participants, 
        participantGroups: state.participantGroups,
        defaultTags: state.defaultTags
    }));
    alert("Group and tags setup saved! You can load them instantly on your next trip.");
}

export function loadGroupTemplate() {
    const saved = localStorage.getItem('tripSplitter_GroupTemplate');
    if (saved) {
        const data = JSON.parse(saved);
        const savedParticipants = Array.isArray(data) ? data : data.participants;
        const savedGroups = Array.isArray(data) ? {} : (data.participantGroups || {});
        
        let addedPeople = 0;
        savedParticipants.forEach(p => { 
            if (!state.participants.includes(p)) { 
                state.participants.push(p); 
                state.participantGroups[p] = savedGroups[p] || p; 
                addedPeople++; 
            } 
        });
        
        let addedTags = 0;
        if (data && data.defaultTags && Array.isArray(data.defaultTags)) {
            if (!state.defaultTags) state.defaultTags = [];
            data.defaultTags.forEach(t => {
                if (!state.defaultTags.includes(t)) {
                    state.defaultTags.push(t);
                    addedTags++;
                }
            });
        }
        
        saveState(); 
        updateUI(); 
        alert(`Loaded ${addedPeople} participants and ${addedTags} default tags from your saved setup.`);
    } else { 
        alert("No saved setup found."); 
    }
}

// --- STATE ACTIONS ---
export async function resetTrip() {
    if(confirm("Start a new trip? This wipes your current progress! Make sure you saved your file first.")) {
        state.tripName = "My Trip"; 
        state.tripComment = ""; 
        state.participants = []; 
        state.participantGroups = {}; 
        state.expenses = [];
        state.secondaryCurrency = ""; 
        state.currentExchangeRate = 1; 
        state.currentSort = 'date-desc'; 
        state.tripDays = 1;
        state.showPerDay = false; 
        state.tripNotes = ""; 
        state.tripNotesDelta = null; 
        state.autoColorNotes = false;
        state.isHeaderCollapsed = false; 
        state.defaultTags = ['car', 'guess', 'flight', 'stay', 'grocery', 'restaurant'];
        state.localLastModified = Date.now();
        
        document.getElementById('global-currency').value = ""; 
        document.getElementById('ledger-sort').value = "date-desc";
        document.getElementById('trip-name').value = state.tripName; 
        document.getElementById('trip-comment').value = state.tripComment;
        document.getElementById('exp-category').value = 'Other';
        document.getElementById('exp-tags').value = '';
        document.getElementById('per-day-toggle').checked = false;
        document.getElementById('trip-days-input').style.display = 'none'; 
        document.getElementById('trip-days-input').value = 1;
        document.getElementById('qc-usd').value = ''; 
        document.getElementById('qc-foreign').value = '';
        
        const qNotesUsd = document.getElementById('qc-notes-usd');
        if (qNotesUsd) qNotesUsd.value = '';
        const qNotesFx = document.getElementById('qc-notes-foreign');
        if (qNotesFx) qNotesFx.value = '';
        
        applyHeaderState();
        state.activeCategoryFilters = new Set(Object.keys(CATEGORIES)); 
        cancelEdit(); 
        localStorage.removeItem('tripSplitterLatest');
        updateCurrencySelectors(); 
        updateUI();
        document.getElementById('next-payer-container').innerHTML = ''; 
        document.getElementById('cloud-status').innerText = '';
        
        const DB = await import('./db.js');
        DB.compareVersions();
    }
}

export function updateTripName() { 
    state.tripName = document.getElementById('trip-name').value; 
    saveState(); 
}

export function updateTripComment() { 
    state.tripComment = document.getElementById('trip-comment').value; 
    saveState(); 
}

// --- PWA / HEADER INTERACTIONS ---
export function toggleHeader() {
    state.isHeaderCollapsed = !state.isHeaderCollapsed;
    applyHeaderState();
    saveState(true); 
}

export function applyHeaderState() {
    const topBar = document.querySelector('.top-bar-area');
    const btn = document.getElementById('header-toggle-btn');
    if (topBar) {
        if(state.isHeaderCollapsed) {
            topBar.classList.add('header-collapsed');
            if (btn) btn.innerHTML = '▲';
        } else {
            topBar.classList.remove('header-collapsed');
            if (btn) btn.innerHTML = '▼';
        }
    }
}

export function toggleLedger() { 
    const wrapper = document.getElementById('ledger-card-wrapper');
    if (wrapper) wrapper.classList.toggle('ledger-collapsed'); 
}

export function toggleActivityCard() { 
    const wrapper = document.getElementById('activity-card');
    if (wrapper) wrapper.classList.toggle('activity-collapsed'); 
}

export function togglePerDay() {
    state.showPerDay = document.getElementById('per-day-toggle').checked;
    const daysInput = document.getElementById('trip-days-input');
    if (daysInput) {
        daysInput.style.display = state.showPerDay ? 'block' : 'none';
        if (state.showPerDay && !state.tripDays) state.tripDays = 1;
        daysInput.value = state.tripDays;
    }
    saveState(); 
    updateUI();
}

export function updateTripDays() {
    let val = parseInt(document.getElementById('trip-days-input').value);
    if (!isNaN(val) && val > 0) { 
        state.tripDays = val; 
        saveState(); 
        updateUI(); 
    }
}

// --- FORM UI HELPERS ---
export function updateFormColor() {
    const cat = document.getElementById('exp-category').value;
    const info = CATEGORIES[cat] || CATEGORIES['Other'];
    const card = document.getElementById('activity-card');
    const header = document.getElementById('activity-header');

    if (card && header) {
        card.style.backgroundColor = info.bg;
        card.style.borderColor = info.color + '40';
        header.style.color = info.color;
        header.style.borderBottomColor = info.color + '30';
    }
}

export function handleCategoryChange() {
    updateFormColor();
    const cat = document.getElementById('exp-category').value;
    const desc = document.getElementById('exp-desc');
    if (cat === 'Transfer' && desc && desc.value === '') {
        desc.value = 'Debt Repayment';
    }
}

export function updatePayerColor() {
    const pSelect = document.getElementById('exp-payer');
    if (!pSelect) return;
    const val = pSelect.value;
    if (val) { 
        pSelect.style.color = getColor(val); 
        pSelect.style.fontWeight = '800'; 
    } else { 
        pSelect.style.color = 'var(--text)'; 
        pSelect.style.fontWeight = '500'; 
    }
}

export function toggleAllCheckboxes(checkedState) {
    document.querySelectorAll('#participant-list-inputs .part-checkbox').forEach(cb => { 
        cb.checked = checkedState; 
    });
    const master = document.getElementById('master-participant-checkbox');
    if (master) master.checked = checkedState;
    
    const countDisplay = document.getElementById('participant-count-display');
    const checkboxes = document.querySelectorAll('#participant-list-inputs .part-checkbox');
    if (countDisplay && checkboxes.length > 0) {
        const checkedCount = checkedState ? checkboxes.length : 0;
        countDisplay.innerText = `Who participates? (${checkedCount}/${checkboxes.length} selected)`;
    }
    
    calculateRemainingPercentage();
}

export function checkMasterCheckboxState() {
    const master = document.getElementById('master-participant-checkbox');
    const checkboxes = document.querySelectorAll('#participant-list-inputs .part-checkbox');
    
    const countDisplay = document.getElementById('participant-count-display');
    if (countDisplay && checkboxes.length > 0) {
        const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
        countDisplay.innerText = `Who participates? (${checkedCount}/${checkboxes.length} selected)`;
    } else if (countDisplay) {
        countDisplay.innerText = `Who participates?`;
    }

    if (!master) return;
    if (checkboxes.length === 0) { 
        master.checked = false; 
        return; 
    }
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    const someChecked = Array.from(checkboxes).some(cb => cb.checked);
    master.checked = allChecked;
    master.indeterminate = someChecked && !allChecked;
    calculateRemainingPercentage();
}

export function updateSplitTypeUI() {
    const type = document.getElementById('exp-split-type').value;
    const helper = document.getElementById('split-helper-text');
    const extraInputs = document.querySelectorAll('.part-personal');
    const fixedInputs = document.querySelectorAll('.part-fixed');
    
    if (!helper) return;

    if (type === 'percentage') {
        helper.innerHTML = `<em>Enter % for specific people. The rest divides equally.</em> <strong id="perc-remaining" style="margin-left: 5px; padding: 2px 8px; background: #e2e8f0; border-radius: 6px;">100% left</strong>`;
        extraInputs.forEach(input => { 
            input.placeholder = "Share %"; 
            input.max = "100"; 
            if(!state.editingExpenseId) input.value = ''; 
        });
        fixedInputs.forEach(input => input.style.display = 'none');
        calculateRemainingPercentage();
    } else {
        const cur = document.getElementById('exp-currency').value;
        const sym = CURRENCY_SYMBOLS[cur] ? CURRENCY_SYMBOLS[cur] : cur;
        helper.innerHTML = `<em>Use <strong>+ Extra</strong> to add to their base share, or <strong>= Exact</strong> to override it completely.</em>`;
        extraInputs.forEach(input => { 
            input.placeholder = `+ Extra ${sym}`; 
            input.removeAttribute('max'); 
            if(!state.editingExpenseId) input.value = ''; 
        });
        fixedInputs.forEach(input => { 
            input.placeholder = `= Exact ${sym}`; 
            if(!state.editingExpenseId) input.value = ''; 
            input.style.display = 'block'; 
        });
    }
}

export function calculateRemainingPercentage() {
    const splitTypeEl = document.getElementById('exp-split-type');
    if (!splitTypeEl || splitTypeEl.value !== 'percentage') return;
    let totalEntered = 0;
    document.querySelectorAll('.participant-row').forEach(row => {
        const cb = row.querySelector('.part-checkbox');
        if(cb && cb.checked) {
            const val = parseFloat(row.querySelector('.part-personal').value);
            if (!isNaN(val)) totalEntered += val;
        }
    });
    const remaining = 100 - totalEntered;
    const remEl = document.getElementById('perc-remaining');
    if (remEl) {
        const displayRem = Math.abs(remaining) < 0.01 ? 0 : remaining; 
        remEl.innerText = `${displayRem.toFixed(1)}% left`;
        remEl.style.color = remaining < -0.01 ? 'var(--danger)' : 'var(--text)';
        remEl.style.background = remaining < -0.01 ? '#fee2e2' : '#e2e8f0';
    }
}

export function updateFormCurrencyUI() {
    const localCurrency = document.getElementById('exp-currency').value;
    const rateRow = document.getElementById('rate-row');
    const rateLabel = document.getElementById('exp-rate-currency-label');
    const rateInput = document.getElementById('exp-exchange-rate');
    
    if (!rateRow || !rateLabel || !rateInput) return;

    if (localCurrency !== 'USD') {
        rateRow.style.display = 'flex';
        rateLabel.innerText = localCurrency;
        if (!rateInput.value && state.currentExchangeRate > 0) {
            rateInput.value = state.currentExchangeRate.toFixed(2);
        }
    } else {
        rateRow.style.display = 'none';
        rateInput.value = '';
    }
}

export async function refreshFormRate() {
    const localCurrency = document.getElementById('exp-currency').value;
    if (localCurrency === 'USD') return;
    
    const btn = document.querySelector('#rate-row button');
    if (btn) btn.innerText = "⏳";
    const success = await fetchExchangeRate(localCurrency, false);
    if (success && state.currentExchangeRate > 0) {
        const rateInput = document.getElementById('exp-exchange-rate');
        if (rateInput) rateInput.value = state.currentExchangeRate.toFixed(2);
    }
    if (btn) btn.innerText = "🔄 Fetch Latest";
}

// --- DYNAMIC TAG SUGGESTIONS ---
export function getRecentTags() {
    const recent = [];
    const sortedExpenses = [...state.expenses].sort((a, b) => b.timestamp - a.timestamp);
    for (const e of sortedExpenses) {
        if (!e.ignored && e.tags && Array.isArray(e.tags)) {
            for (const t of e.tags) {
                // Exclude default tags from recency ranking
                if (state.defaultTags && state.defaultTags.includes(t.toLowerCase())) {
                    continue;
                }
                const lowerTag = t.toLowerCase();
                if (!recent.includes(lowerTag)) {
                    recent.push(lowerTag);
                    if (recent.length === 2) return recent;
                }
            }
        }
    }
    return recent;
}

export function addDefaultTag() {
    const input = document.getElementById('new-default-tag');
    if (!input) return;
    let val = input.value.trim().toLowerCase();
    if (val.startsWith('#')) val = val.substring(1).trim();
    val = val.replace(/[^a-z0-9]/g, ''); // tags should be alphanumeric
    if (!val) return;
    
    if (!state.defaultTags) state.defaultTags = [];
    if (state.defaultTags.includes(val)) {
        alert("Tag already exists in defaults!");
        return;
    }
    state.defaultTags.push(val);
    input.value = '';
    saveState();
    updateUI();
}

export function handleDefaultTagKeyPress(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        addDefaultTag();
    }
}

export function renameDefaultTag(oldTag) {
    const newTagInput = prompt(`Rename tag #${oldTag} to (alphanumeric only):`, oldTag);
    if (!newTagInput) return;
    let newTag = newTagInput.trim().toLowerCase();
    if (newTag.startsWith('#')) newTag = newTag.substring(1).trim();
    newTag = newTag.replace(/[^a-z0-9]/g, '');
    if (newTag === oldTag || newTag === "") return;
    
    const isDefault = state.defaultTags && state.defaultTags.includes(oldTag);
    if (isDefault && state.defaultTags.includes(newTag)) {
        alert("Tag already exists in defaults.");
        return;
    }
    
    // Update defaults array if applicable
    if (isDefault) {
        const idx = state.defaultTags.indexOf(oldTag);
        if (idx > -1) {
            state.defaultTags[idx] = newTag;
        }
    }
    
    // Update in all expenses
    state.expenses.forEach(e => {
        if (e.tags && Array.isArray(e.tags)) {
            const tIdx = e.tags.indexOf(oldTag);
            if (tIdx > -1) {
                if (e.tags.includes(newTag)) {
                    e.tags.splice(tIdx, 1);
                } else {
                    e.tags[tIdx] = newTag;
                }
                e.tags.sort((a, b) => a.localeCompare(b));
            }
        }
    });
    
    saveState();
    updateUI();
}

export function deleteDefaultTag(tag) {
    if (confirm(`Remove tag #${tag} globally? This will delete it from all activities and defaults.`)) {
        if (state.defaultTags) {
            state.defaultTags = state.defaultTags.filter(t => t !== tag);
        }
        
        // Remove from all activities
        state.expenses.forEach(e => {
            if (e.tags && Array.isArray(e.tags)) {
                e.tags = e.tags.filter(t => t !== tag);
            }
        });
        
        saveState();
        updateUI();
    }
}

export function handleFormTagInput(e) {
    const input = e.target;
    const value = input.value;
    const popup = document.getElementById('form-tag-suggestions');
    const allTags = getAllUniqueTags();

    if (!popup) return;

    if (allTags.length === 0) {
        popup.style.display = 'none';
        return;
    }

    const cursorPos = input.selectionStart;
    const textBeforeCursor = value.substring(0, cursorPos);
    const words = textBeforeCursor.split(/\s+/);
    const currentWord = words[words.length - 1];

    if (!currentWord.startsWith('#')) {
        popup.style.display = 'none';
        return;
    }

    const query = currentWord.substring(1).toLowerCase();
    
    // Filter out tags already typed in the input field (excluding current query)
    const typedTags = (value.match(/#(\w+)/g) || [])
        .map(t => t.substring(1).toLowerCase())
        .filter(t => t !== query);
        
    const filteredTags = allTags.filter(t => !typedTags.includes(t.toLowerCase()));
    const matches = filteredTags.filter(t => t.toLowerCase().includes(query));

    if (matches.length > 0) {
        const recentTags = getRecentTags();
        const recentMatches = [];
        const normalMatches = [];
        
        matches.forEach(m => {
            if (recentTags.includes(m.toLowerCase())) {
                recentMatches.push(m);
            } else {
                normalMatches.push(m);
            }
        });
        
        recentMatches.sort((a, b) => {
            return recentTags.indexOf(a.toLowerCase()) - recentTags.indexOf(b.toLowerCase());
        });
        
        normalMatches.sort((a, b) => a.localeCompare(b));
        
        const finalMatches = [...recentMatches, ...normalMatches];
        
        popup.innerHTML = finalMatches.map(t => {
            const isRecent = recentTags.includes(t.toLowerCase());
            const label = isRecent ? `🕒 #${t}` : `#${t}`;
            return `<div class="suggestion-item" onclick="selectTagForForm('${t}')"><span class="tag-pill" style="${getTagStyle(t)}">${label}</span></div>`;
        }).join('');
        popup.style.display = 'block';
        popup.style.top = (input.offsetTop + input.offsetHeight) + 'px';
    } else {
        popup.style.display = 'none';
    }
}

export function selectTagForForm(tag) {
    const input = document.getElementById('exp-tags');
    if (!input) return;
    const value = input.value;
    const cursorPos = input.selectionStart;
    const textBeforeCursor = value.substring(0, cursorPos);
    const wordsBefore = textBeforeCursor.split(/\s+/);
    const currentWord = wordsBefore[wordsBefore.length - 1];

    if (currentWord !== "") {
        wordsBefore[wordsBefore.length - 1] = '#' + tag;
        const newTextBefore = wordsBefore.join(' ') + ' ';
        input.value = newTextBefore + value.substring(cursorPos);
    } else {
        const prefix = (value.length > 0 && !textBeforeCursor.endsWith(' ')) ? ' ' : '';
        input.value = textBeforeCursor + prefix + '#' + tag + ' ' + value.substring(cursorPos);
    }
    
    const popup = document.getElementById('form-tag-suggestions');
    if (popup) popup.style.display = 'none';
    input.focus();
}

export function handleSearchInput(e) {
    handleSearchChange(); 
    
    const input = e.target;
    const value = input.value;
    const popup = document.getElementById('search-tag-suggestions');
    
    if (!popup) return;

    if (value.trim() === '') {
        const allTags = getTagsFromShownExpenses('');
        if (allTags.length > 0) {
            popup.innerHTML = allTags.map(t => `<div class="suggestion-item" onclick="selectTagForSearch('${t}', false)"><span class="tag-pill" style="${getTagStyle(t)}">#${t}</span></div>`).join('');
            popup.style.display = 'block';
        } else {
            popup.style.display = 'none';
        }
        return;
    }

    const cursorPos = input.selectionStart;
    const textBeforeCursor = value.substring(0, cursorPos);
    const words = textBeforeCursor.split(/\s+/);
    const currentWord = words[words.length - 1];

    const isNegative = currentWord.startsWith('-#');
    const isPositive = currentWord.startsWith('#');

    if (isNegative || isPositive) {
        const prefix = isNegative ? '-#' : '#';
        const query = currentWord.substring(prefix.length).toLowerCase();
        
        const wordIdx = textBeforeCursor.lastIndexOf(currentWord);
        const cleanSearchText = (wordIdx > -1) ? (textBeforeCursor.substring(0, wordIdx) + textBeforeCursor.substring(wordIdx + currentWord.length)) : textBeforeCursor;
        
        const allTags = getTagsFromShownExpenses(cleanSearchText);
        const matches = allTags.filter(t => t.toLowerCase().includes(query));

        if (matches.length > 0) {
            popup.innerHTML = matches.map(t => `<div class="suggestion-item" onclick="selectTagForSearch('${t}', ${isNegative})"><span class="tag-pill" style="${getTagStyle(t)}">${prefix}${t}</span></div>`).join('');
            popup.style.display = 'block';
        } else {
            popup.style.display = 'none';
        }
    } else {
        popup.style.display = 'none';
    }
}

export function selectTagForSearch(tag, isNegative) {
    const input = document.getElementById('search-filter');
    if (!input) return;
    const value = input.value;
    const prefix = isNegative ? '-#' : '#';
    
    if (value.trim() === '') {
        input.value = prefix + tag + ' ';
    } else {
        const cursorPos = input.selectionStart;
        const textBeforeCursor = value.substring(0, cursorPos);
        const wordsBefore = textBeforeCursor.split(/\s+/);
        const currentWord = wordsBefore[wordsBefore.length - 1];
        
        if (currentWord.startsWith('-#')) {
            wordsBefore[wordsBefore.length - 1] = '-#' + tag;
            const newTextBefore = wordsBefore.join(' ') + ' ';
            input.value = newTextBefore + value.substring(cursorPos);
        } else if (currentWord.startsWith('#')) {
            wordsBefore[wordsBefore.length - 1] = '#' + tag;
            const newTextBefore = wordsBefore.join(' ') + ' ';
            input.value = newTextBefore + value.substring(cursorPos);
        } else {
            input.value = value + (value.endsWith(' ') ? '' : ' ') + prefix + tag + ' ';
        }
    }
    
    const popup = document.getElementById('search-tag-suggestions');
    if (popup) popup.style.display = 'none';
    input.focus();
    handleSearchChange(); 
}

export function toggleCategoryFilter(cat) {
    const totalCategories = Object.keys(CATEGORIES).length;
    const isCatActive = state.activeCategoryFilters.has(cat);
    const activeCount = state.activeCategoryFilters.size;

    if (activeCount === totalCategories) {
        // If all are active, isolate the clicked category
        state.activeCategoryFilters.clear();
        state.activeCategoryFilters.add(cat);
    } else if (isCatActive) {
        if (activeCount === 1) {
            // If it is the only active one, toggle it to restore all categories
            state.activeCategoryFilters = new Set(Object.keys(CATEGORIES));
        } else {
            // Otherwise, remove it from the filter set
            state.activeCategoryFilters.delete(cat);
        }
    } else {
        // Add inactive category to the filter set
        state.activeCategoryFilters.add(cat);
    }
    updateUI();
}

export function filterByInsight(name, cat) {
    state.insightFilter = { name, cat };
    const filterEl = document.getElementById('search-filter');
    if (filterEl) filterEl.scrollIntoView({behavior: 'smooth', block: 'center'});
    updateUI();
}

export function handleSortChange() { 
    state.currentSort = document.getElementById('ledger-sort').value; 
    saveState(); 
    updateUI(); 
}

export function handleSearchChange() { 
    clearTimeout(state.searchTimeout);
    state.searchTimeout = setTimeout(() => {
        state.searchText = document.getElementById('search-filter').value.toLowerCase(); 
        const clearBtn = document.getElementById('clear-search-btn');
        if (clearBtn) clearBtn.style.display = state.searchText.length > 0 ? 'block' : 'none';
        updateUI(); 
    }, 200);
}

export async function clearSearch() {
    state.insightFilter = null;
    if (state.selectedCalendarDates) {
        state.selectedCalendarDates.clear();
    }
    try {
        const { renderCalendar } = await import('./calendar.js');
        renderCalendar();
    } catch(e) {
        console.error(e);
    }
    const searchInput = document.getElementById('search-filter');
    if (searchInput) {
        searchInput.value = '';
        searchInput.readOnly = false;
        searchInput.style.color = 'var(--text)';
        searchInput.style.fontWeight = '500';
    }
    state.searchText = '';
    clearTimeout(state.searchTimeout);
    const clearBtn = document.getElementById('clear-search-btn');
    if (clearBtn) clearBtn.style.display = 'none';
    updateUI();
}

export function clearCalendarFilter() {
    if (state.selectedCalendarDates) {
        state.selectedCalendarDates.clear();
    }
    try {
        import('./calendar.js').then(({ renderCalendar }) => renderCalendar());
    } catch (e) {}
    updateUI();
}

export function clearInsightFilter() {
    state.insightFilter = null;
    updateUI();
}

// --- EXPENSES OPERATIONS ---
export function saveExpense() {
    const category = document.getElementById('exp-category').value;
    const desc = document.getElementById('exp-desc').value;
    
    const rawTags = document.getElementById('exp-tags').value;
    const tags = (rawTags.match(/#(\w+)/g) || []).map(t => t.substring(1).toLowerCase()).sort((a, b) => a.localeCompare(b));
    
    const notes = document.getElementById('exp-notes').value.trim();
    const date = document.getElementById('exp-date').value;
    const localAmount = parseFloat(document.getElementById('exp-amount').value);
    const localCurrency = document.getElementById('exp-currency').value;
    const payer = document.getElementById('exp-payer').value;
    const splitType = document.getElementById('exp-split-type').value;
    
    const selected = [];
    const personalExpensesLocal = {};
    const fixedSharesLocal = {};
    const percentageShares = {};
    
    let totalPersonalAmtLocal = 0;
    let totalFixedAmtLocal = 0;
    let totalPercentageEntered = 0;

    document.querySelectorAll('.participant-row').forEach(row => {
        const cb = row.querySelector('.part-checkbox');
        if (cb && cb.checked) {
            const name = cb.value;
            selected.push(name);
            
            const extraInput = row.querySelector('.part-personal').value;
            const extraAmt = parseFloat(extraInput);
            
            const fixedInput = row.querySelector('.part-fixed').value;
            const fixedAmt = parseFloat(fixedInput);
            
            if (splitType === 'equal') {
                if (!isNaN(fixedAmt) && fixedAmt >= 0) {
                    fixedSharesLocal[name] = fixedAmt;
                    totalFixedAmtLocal += fixedAmt;
                } else if (!isNaN(extraAmt) && extraAmt > 0) {
                    personalExpensesLocal[name] = extraAmt; 
                    totalPersonalAmtLocal += extraAmt;
                }
            } else {
                if (!isNaN(extraAmt) && extraAmt > 0) {
                    percentageShares[name] = extraAmt; 
                    totalPercentageEntered += extraAmt;
                }
            }
        }
    });

    if (!desc || isNaN(localAmount) || localAmount <= 0 || !payer || selected.length === 0) {
        alert("Please fill all fields, enter a valid amount, and select at least one participant."); 
        return;
    }
    if (splitType === 'equal' && (totalPersonalAmtLocal + totalFixedAmtLocal) > localAmount) {
        alert(`The total of Extras and Exact shares (${totalPersonalAmtLocal + totalFixedAmtLocal}) cannot exceed the total check amount (${localAmount}).`); 
        return;
    }
    if (splitType === 'percentage' && totalPercentageEntered > 100.01) {
        alert(`Total percentages entered (${totalPercentageEntered}%) cannot exceed 100%.`); 
        return;
    }

    let rateToUse = 1;
    if (localCurrency !== 'USD') {
        rateToUse = parseFloat(document.getElementById('exp-exchange-rate').value);
        if (isNaN(rateToUse) || rateToUse <= 0) {
            rateToUse = state.currentExchangeRate;
        }
    }

    let amountUsd = localAmount;
    let personalExpensesUsd = {};
    let fixedSharesUsd = {};
    
    if (localCurrency !== 'USD' && rateToUse > 0) {
        amountUsd = localAmount / rateToUse;
        if (splitType === 'equal') {
            Object.keys(personalExpensesLocal).forEach(k => { personalExpensesUsd[k] = personalExpensesLocal[k] / rateToUse; });
            Object.keys(fixedSharesLocal).forEach(k => { fixedSharesUsd[k] = fixedSharesLocal[k] / rateToUse; });
        }
    } else { 
        personalExpensesUsd = personalExpensesLocal; 
        fixedSharesUsd = fixedSharesLocal;
    }

    if (state.editingExpenseId) {
        const index = state.expenses.findIndex(e => e.id === state.editingExpenseId);
        if (index > -1) {
            state.expenses[index] = { 
                id: state.editingExpenseId, category, desc, tags, notes, date, amount: amountUsd, localAmount, localCurrency, 
                payer, splitType, involved: selected, personalExpenses: personalExpensesUsd, fixedShares: fixedSharesUsd, 
                percentageShares, ignored: state.expenses[index].ignored, timestamp: Date.now(),
                exchangeRate: rateToUse
            };
        }
        cancelEdit(); 
        showToast("Activity updated!", 'edit'); 
    } else {
        state.expenses.push({ 
            id: Math.random().toString(36).substr(2, 9), category, desc, tags, notes, date, amount: amountUsd, localAmount, localCurrency, 
            payer, splitType, involved: selected, personalExpenses: personalExpensesUsd, fixedShares: fixedSharesUsd,
            percentageShares, ignored: false, timestamp: Date.now(),
            exchangeRate: rateToUse
        });
        
        document.getElementById('exp-desc').value = ''; 
        document.getElementById('exp-tags').value = '';
        document.getElementById('exp-notes').value = '';
        document.getElementById('exp-amount').value = ''; 
        document.querySelectorAll('.part-personal').forEach(input => input.value = ''); 
        document.querySelectorAll('.part-fixed').forEach(input => input.value = ''); 
        calculateRemainingPercentage();
        updateFormColor();
        updateFormCurrencyUI();
        showToast("Activity added!", 'create');
    }
    saveState(); 
    updateUI();
}

export function editExpense(id) {
    const exp = state.expenses.find(e => e.id === id);
    if (!exp) return;

    state.editingExpenseId = id;
    document.getElementById('activity-title-text').innerText = "✏️ Edit Activity";
    document.getElementById('exp-category').value = exp.category || 'Other';
    document.getElementById('exp-desc').value = exp.desc;
    document.getElementById('exp-tags').value = exp.tags ? exp.tags.map(t => '#' + t).join(' ') + ' ' : '';
    document.getElementById('exp-notes').value = exp.notes || '';
    document.getElementById('exp-date').value = exp.date;
    
    document.getElementById('exp-currency').value = exp.localCurrency || 'USD';
    updateFormCurrencyUI();
    if (exp.localCurrency !== 'USD') {
        document.getElementById('exp-exchange-rate').value = (exp.exchangeRate || state.currentExchangeRate).toFixed(2);
    }
    
    document.getElementById('exp-split-type').value = exp.splitType || 'equal';
    
    renderParticipantInputs();
    updateSplitTypeUI(); 
    
    document.querySelectorAll('.participant-row').forEach(row => {
        const cb = row.querySelector('.part-checkbox');
        const extraInput = row.querySelector('.part-personal');
        const fixedInput = row.querySelector('.part-fixed');
        const name = cb.value;
        
        if (exp.involved.includes(name)) {
            cb.checked = true;
            if (exp.splitType === 'percentage' && exp.percentageShares && exp.percentageShares[name]) {
                extraInput.value = exp.percentageShares[name];
            } else if (!exp.splitType || exp.splitType === 'equal') {
                const safeRate = exp.exchangeRate || state.currentExchangeRate || 1;
                if (exp.personalExpenses && exp.personalExpenses[name]) {
                    let pVal = exp.personalExpenses[name];
                    if (exp.localCurrency !== 'USD') pVal = pVal * safeRate;
                    extraInput.value = pVal.toFixed(2);
                } else { 
                    extraInput.value = ''; 
                }
                
                if (exp.fixedShares && exp.fixedShares[name] !== undefined) {
                    let fVal = exp.fixedShares[name];
                    if (exp.localCurrency !== 'USD') fVal = fVal * safeRate;
                    fixedInput.value = fVal.toFixed(2);
                } else { 
                    fixedInput.value = ''; 
                }
            } else { 
                extraInput.value = ''; 
                fixedInput.value = ''; 
            }
        } else { 
            cb.checked = false; 
            extraInput.value = ''; 
            fixedInput.value = ''; 
        }
    });
    checkMasterCheckboxState();

    document.getElementById('save-expense-btn').innerText = "Update Activity";
    document.getElementById('cancel-edit-btn').style.display = "block";
    
    const activityCard = document.getElementById('activity-card');
    if (activityCard) {
        activityCard.classList.add('edit-mode');
        activityCard.classList.remove('activity-collapsed'); 
    }
    
    document.getElementById('exp-amount').value = exp.localAmount || (exp.amount * (exp.exchangeRate||1));
    
    updateUI(); 
    document.getElementById('exp-payer').value = exp.payer; 
    updatePayerColor(); 
    updateFormColor();
    
    setTimeout(() => {
        if (window.innerWidth >= 1024) {
            const colLeft = document.querySelector('.col-left');
            if (colLeft) colLeft.scrollTo({ top: 0, behavior: 'smooth' });
            const activeRow = document.getElementById(`exp-row-${id}`);
            const colMid = document.querySelector('.col-mid');
            if (activeRow && colMid) colMid.scrollTo({ top: activeRow.offsetTop - 120, behavior: 'smooth' }); 
        } else if (activityCard) { 
            activityCard.scrollIntoView({ behavior: 'smooth', block: 'start' }); 
        }
    }, 50);
}

export function duplicateExpense(id) {
    const exp = state.expenses.find(e => e.id === id);
    if (exp) {
        const newExp = JSON.parse(JSON.stringify(exp));
        newExp.id = Math.random().toString(36).substr(2, 9); 
        newExp.timestamp = Date.now(); 
        
        let baseDesc = exp.desc.replace(/ #\d+$/, ''); 
        let maxNum = 1; 
        state.expenses.forEach(e => {
            let m = e.desc.match(/(.*?) #(\d+)$/);
            let name = m ? m[1] : e.desc; 
            let num = m ? parseInt(m[2], 10) : 1;
            if (name === baseDesc && num >= maxNum) maxNum = num;
        });
        newExp.desc = `${baseDesc} #${maxNum + 1}`;
        state.expenses.push(newExp); 
        saveState(); 
        updateUI();

        setTimeout(() => {
            const row = document.getElementById(`exp-row-${newExp.id}`);
            if (row) {
                if (window.innerWidth >= 1024) {
                    const colMid = document.querySelector('.col-mid');
                    if (colMid) colMid.scrollTo({ top: row.offsetTop - 120, behavior: 'smooth' });
                } else { 
                    row.scrollIntoView({ behavior: 'smooth', block: 'center' }); 
                }
                const originalBg = row.style.background;
                row.style.transition = 'background-color 0.5s ease'; 
                row.style.backgroundColor = '#fef08a'; 
                setTimeout(() => { row.style.backgroundColor = originalBg; }, 1200);
            }
        }, 50);
    }
}

export function deleteExpense(id) {
    if (confirm("Delete this activity completely?")) {
        if (state.editingExpenseId === id) cancelEdit();
        state.expenses = state.expenses.filter(e => e.id !== id); 
        saveState(); 
        updateUI();
    }
}

export function toggleIgnore(id) {
    const exp = state.expenses.find(e => e.id === id);
    if (exp) { 
        exp.ignored = !exp.ignored; 
        saveState(); 
        updateUI(); 
    }
}

export function toggleAllExpenses() {
    if (state.expenses.length === 0) return;
    const hasActive = state.expenses.some(e => !e.ignored);
    const targetIgnoreState = hasActive;
    const actionText = targetIgnoreState ? "ignore" : "include";
    if (confirm(`Are you sure you want to ${actionText} ALL activities?`)) {
        state.expenses.forEach(e => e.ignored = targetIgnoreState); 
        saveState(); 
        updateUI();
    }
}

export function cancelEdit() {
    state.editingExpenseId = null;
    document.getElementById('activity-title-text').innerText = "➕ Add Activity";
    document.getElementById('save-expense-btn').innerText = "Save Activity";
    document.getElementById('cancel-edit-btn').style.display = "none";
    document.getElementById('exp-category').value = 'Other';
    document.getElementById('exp-desc').value = '';
    document.getElementById('exp-tags').value = '';
    document.getElementById('exp-notes').value = '';
    document.getElementById('exp-amount').value = '';
    document.getElementById('exp-payer').value = '';
    document.getElementById('exp-split-type').value = 'equal';
    document.getElementById('activity-card').classList.remove('edit-mode');
    updatePayerColor(); 
    updateSplitTypeUI();
    
    const defaultCur = state.secondaryCurrency || 'USD';
    document.getElementById('exp-currency').value = defaultCur;
    updateFormCurrencyUI();
    if (defaultCur !== 'USD') {
        document.getElementById('exp-exchange-rate').value = state.currentExchangeRate.toFixed(2);
    }
    
    document.querySelectorAll('.part-personal').forEach(input => input.value = ''); 
    document.querySelectorAll('.part-fixed').forEach(input => input.value = ''); 
    
    const checkboxes = document.querySelectorAll('#participant-list-inputs .part-checkbox');
    checkboxes.forEach(cb => cb.checked = true);
    checkMasterCheckboxState();
    
    updateFormColor();
    updateUI();
}

// --- RENDERING ROUTINES ---
export function renderCategoryFilters() {
    const container = document.getElementById('category-filters'); 
    if (!container) return;
    let html = '';
    Object.keys(CATEGORIES).forEach(cat => {
        const info = CATEGORIES[cat]; 
        const isActive = state.activeCategoryFilters.has(cat);
        const opacity = isActive ? '1' : '0.4'; 
        const bg = isActive ? info.bg : '#ffffff';
        const border = isActive ? info.color : '#cbd5e1'; 
        const textCol = isActive ? info.color : '#64748b';
        html += `<button class="cat-filter-btn" style="opacity: ${opacity}; background: ${bg}; border: 1px solid ${border}; color: ${textCol};" onclick="toggleCategoryFilter('${cat}')" title="Toggle ${cat}">${info.icon} ${cat}</button>`;
    });
    container.innerHTML = html;
}

export function renderParticipantInputs() {
    const pListInputs = document.getElementById('participant-list-inputs');
    if (!pListInputs) return;
    pListInputs.innerHTML = state.participants.map(p => `
        <div class="participant-row">
            <label class="checkbox-item" style="color: ${getColor(p)}" title="${p}">
                <input type="checkbox" value="${p}" class="part-checkbox" checked onchange="checkMasterCheckboxState()"> 
                <span>${shortName(p)}</span>
            </label>
            <div class="inputs-group">
                <input type="number" class="part-personal tabular-nums" data-name="${p}" placeholder="+ Extra $" step="0.01" min="0" oninput="calculateRemainingPercentage()">
                <input type="number" class="part-fixed tabular-nums" data-name="${p}" placeholder="= Exact $" step="0.01" min="0">
            </div>
        </div>
    `).join('');
    checkMasterCheckboxState();
}

export function updateAutocomplete() {
    const dataList = document.getElementById('desc-suggestions');
    if (!dataList) return;
    const uniqueDescs = [...new Set(state.expenses.map(e => e.desc.replace(/ #\d+$/, '')))].filter(d => d);
    dataList.innerHTML = uniqueDescs.map(d => `<option value="${d}">`).join('');
}

export function syncStateToDOM() {
    const nameInput = document.getElementById('trip-name');
    if (nameInput) nameInput.value = state.tripName || 'My Trip';
    
    const commentInput = document.getElementById('trip-comment');
    if (commentInput) commentInput.value = state.tripComment || '';
    
    const curInput = document.getElementById('global-currency');
    if (curInput) curInput.value = state.secondaryCurrency || '';
    
    const sortInput = document.getElementById('ledger-sort');
    if (sortInput) sortInput.value = state.currentSort || 'date-desc';
    
    const daysToggle = document.getElementById('per-day-toggle');
    if (daysToggle) daysToggle.checked = state.showPerDay || false;
    
    const daysInput = document.getElementById('trip-days-input');
    if (daysInput) {
        daysInput.value = state.tripDays || 1;
        daysInput.style.display = state.showPerDay ? 'block' : 'none';
    }
}

export function updateUI() {
    updateAutocomplete(); 
    renderCategoryFilters();

    const toggleAllBtn = document.getElementById('toggle-all-btn');
    if (toggleAllBtn) {
        if (state.expenses.length === 0) {
            toggleAllBtn.style.display = 'none';
        } else {
            toggleAllBtn.style.display = 'inline-flex';
            const hasActive = state.expenses.some(e => !e.ignored);
            if (hasActive) {
                toggleAllBtn.innerHTML = '🚫 All';
                toggleAllBtn.title = 'Ignore all activities in calculations';
            } else {
                toggleAllBtn.innerHTML = '✅ All';
                toggleAllBtn.title = 'Include all activities in calculations';
            }
        }
    }

    const pList = document.getElementById('participant-list');
    if (pList) {
        pList.innerHTML = state.participants.length ? state.participants.map(p => {
            const c = getColor(p);
            const gName = state.participantGroups[p];
            const hasGroup = gName && gName !== p;
            const groupText = hasGroup ? `👥 ${gName}` : '👤 Edit Group';
            const groupColor = hasGroup ? getGroupColor(gName) : '#64748b';
            return `
            <div class="tag" style="color: ${c}; border-color: ${c}40;" title="${p}">
                <span class="tag-name" onclick="renameParticipant('${p}')">${p}</span>
                <span class="tag-group-btn" style="color: ${groupColor}; font-weight: ${hasGroup ? '700' : '500'};" onclick="changeGroup('${p}')" title="Assign to a group">${groupText}</span>
                <span class="tag-del" onclick="deleteParticipant('${p}')">&times;</span>
            </div>`
        }).join('') : '<em style="color:var(--secondary); font-size:0.9rem;">No participants added yet.</em>';
    }

    const tList = document.getElementById('default-tags-list');
    if (tList) {
        const allTags = getAllUniqueTags();
        tList.innerHTML = allTags.length ? allTags.map(t => {
            return `
            <div class="tag" style="${getTagStyle(t)}; margin-top: 4px;" title="${t}">
                <span class="tag-name" onclick="renameDefaultTag('${t}')">#${t}</span>
                <span class="tag-del" onclick="deleteDefaultTag('${t}')">&times;</span>
            </div>`
        }).join('') : '<em style="color:var(--secondary); font-size:0.9rem;">No tags added yet.</em>';
    }

    const pSelect = document.getElementById('exp-payer');
    if (pSelect) {
        const currentPayer = pSelect.value;
        pSelect.innerHTML = '<option value="" style="color: var(--text); font-weight: 500;">Who paid?</option>' + state.participants.map(p => `<option value="${p}" style="color: ${getColor(p)}; font-weight: 800;" title="${p}">${shortName(p)}</option>`).join('');
        if(!state.editingExpenseId) pSelect.value = currentPayer; 
        updatePayerColor();
    }

    if (!state.editingExpenseId) {
        renderParticipantInputs();
        updateSplitTypeUI();
    }

    const groupsMap = {};
    state.participants.forEach(p => {
        const gName = state.participantGroups[p] || p;
        if (!groupsMap[gName]) groupsMap[gName] = [];
        groupsMap[gName].push(p);
    });

    const categoryTotals = {};
    const categoryParticipations = {}; 
    const categoryActivityCounts = {}; 
    
    const groupStats = {};
    Object.keys(groupsMap).forEach(g => {
        groupStats[g] = { paid: 0, owed: 0, members: groupsMap[g], catShares: {}, catPaid: {}, catActivitySets: {}, memberStats: {} };
        groupsMap[g].forEach(m => {
            groupStats[g].memberStats[m] = { paid: 0, owed: 0, catShares: {}, catPaid: {} };
            Object.keys(CATEGORIES).forEach(c => { 
                groupStats[g].memberStats[m].catShares[c] = 0; 
                groupStats[g].memberStats[m].catPaid[c] = 0; 
            });
        });
        Object.keys(CATEGORIES).forEach(c => {
            groupStats[g].catShares[c] = 0;
            groupStats[g].catPaid[c] = 0;
            groupStats[g].catActivitySets[c] = new Set();
        });
    });

    Object.keys(CATEGORIES).forEach(c => { 
        categoryTotals[c] = 0; 
        categoryParticipations[c] = 0; 
        categoryActivityCounts[c] = 0; 
    });
    
    let totalSpent = 0;
    let biggestSplurge = { desc: 'None', amount: 0, category: 'Other' };
    let validActiveCount = 0;
    
    let dateTotals = {};
    let payerCounts = {};

    state.expenses.forEach(e => {
        if (e.ignored || !doesExpenseMatchFilters(e, groupsMap)) return; 
        
        validActiveCount++;
        const payerGroup = state.participantGroups[e.payer] || e.payer;
        const cat = e.category || 'Other';
        
        if (cat !== 'Transfer') {
            totalSpent += e.amount;
            if (e.amount > biggestSplurge.amount) {
                biggestSplurge = { desc: e.desc, amount: e.amount, category: e.category };
            }
            dateTotals[e.date] = (dateTotals[e.date] || 0) + e.amount;
        }
        
        categoryTotals[cat] += e.amount;
        categoryParticipations[cat] += e.involved.length;
        categoryActivityCounts[cat] += 1;

        groupStats[payerGroup].paid += e.amount;
        groupStats[payerGroup].memberStats[e.payer].paid += e.amount;
        
        groupStats[payerGroup].catPaid[cat] += e.amount;
        groupStats[payerGroup].memberStats[e.payer].catPaid[cat] += e.amount;
        payerCounts[e.payer] = (payerCounts[e.payer] || 0) + 1;
        
        if (e.splitType === 'percentage') {
            let totalEnteredPerc = 0; 
            let unenteredCount = 0;
            e.involved.forEach(inv => {
                if (e.percentageShares && e.percentageShares[inv] !== undefined) totalEnteredPerc += e.percentageShares[inv];
                else unenteredCount++;
            });
            let defaultPerc = unenteredCount > 0 ? Math.max(0, 100 - totalEnteredPerc) / unenteredCount : 0;
            
            e.involved.forEach(p => {
                const involvedGroup = state.participantGroups[p] || p;
                const pPerc = (e.percentageShares && e.percentageShares[p] !== undefined) ? e.percentageShares[p] : defaultPerc;
                const finalShare = e.amount * (pPerc / 100);
                
                if (finalShare > 0) {
                    if (cat === 'Transfer') {
                        groupStats[involvedGroup].paid -= finalShare;
                        groupStats[involvedGroup].memberStats[p].paid -= finalShare;
                    } else {
                        groupStats[involvedGroup].owed += finalShare;
                        groupStats[involvedGroup].memberStats[p].owed += finalShare;
                    }
                    groupStats[involvedGroup].catShares[cat] += finalShare; 
                    groupStats[involvedGroup].memberStats[p].catShares[cat] += finalShare;
                    groupStats[involvedGroup].catActivitySets[cat].add(e.id);
                }
            });
        } else {
            let totalPersonalForExp = 0;
            let totalFixedForExp = 0;
            let unfixedCount = 0;

            e.involved.forEach(p => {
                if (e.fixedShares && e.fixedShares[p] !== undefined) {
                    totalFixedForExp += e.fixedShares[p];
                } else {
                    unfixedCount++;
                    if (e.personalExpenses && e.personalExpenses[p]) {
                        totalPersonalForExp += e.personalExpenses[p];
                    }
                }
            });

            const sharedAmount = Math.max(0, e.amount - totalFixedForExp - totalPersonalForExp);
            const baseShare = unfixedCount > 0 ? sharedAmount / unfixedCount : 0;

            e.involved.forEach(p => {
                const involvedGroup = state.participantGroups[p] || p;
                let finalShare = 0;
                
                if (e.fixedShares && e.fixedShares[p] !== undefined) {
                    finalShare = e.fixedShares[p];
                } else {
                    const personal = (e.personalExpenses && e.personalExpenses[p]) ? e.personalExpenses[p] : 0;
                    finalShare = baseShare + personal;
                }
                
                if (finalShare > 0) {
                    if (cat === 'Transfer') {
                        groupStats[involvedGroup].paid -= finalShare;
                        groupStats[involvedGroup].memberStats[p].paid -= finalShare;
                    } else {
                        groupStats[involvedGroup].owed += finalShare;
                        groupStats[involvedGroup].memberStats[p].owed += finalShare;
                    }
                    groupStats[involvedGroup].catShares[cat] += finalShare; 
                    groupStats[involvedGroup].memberStats[p].catShares[cat] += finalShare;
                    groupStats[involvedGroup].catActivitySets[cat].add(e.id);
                }
            });
        }
    });
    
    let mostExpensiveDay = { date: '', amount: 0 };
    Object.keys(dateTotals).forEach(d => {
        if (dateTotals[d] > mostExpensiveDay.amount) mostExpensiveDay = { date: d, amount: dateTotals[d] };
    });
    
    let tripBanker = { name: 'None', paid: 0, count: 0 };
    Object.keys(groupStats).forEach(gName => {
        groupStats[gName].members.forEach(m => {
            if (groupStats[gName].memberStats[m].paid > tripBanker.paid) {
                tripBanker = { 
                    name: m, 
                    paid: groupStats[gName].memberStats[m].paid,
                    count: payerCounts[m] || 0
                };
            }
        });
    });

    // Ledger Output
    const eList = document.getElementById('expense-list');
    let sorted = [...state.expenses];
    if (state.currentSort === 'date-desc') { 
        sorted.sort((a,b) => new Date(b.date) - new Date(a.date) || b.timestamp - a.timestamp); 
    } else if (state.currentSort === 'date-asc') { 
        sorted.sort((a,b) => new Date(a.date) - new Date(b.date) || a.timestamp - b.timestamp); 
    } else if (state.currentSort === 'amt-desc') { 
        sorted.sort((a,b) => b.amount - a.amount || b.timestamp - a.timestamp); 
    } else if (state.currentSort === 'amt-asc') { 
        sorted.sort((a,b) => a.amount - b.amount || a.timestamp - b.timestamp); 
    } else if (state.currentSort === 'payer-asc') { 
        sorted.sort((a,b) => a.payer.localeCompare(b.payer) || new Date(b.date) - new Date(a.date) || b.timestamp - a.timestamp); 
    }

    const filteredExpenses = sorted.filter(e => doesExpenseMatchFilters(e, groupsMap));
    state.filteredExpenses = filteredExpenses;
    
    const searchInput = document.getElementById('search-filter');
    const clearBtn = document.getElementById('clear-search-btn');
    if (searchInput && clearBtn) {
        const hasText = state.searchText && state.searchText.length > 0;
        const hasCalendar = state.selectedCalendarDates && state.selectedCalendarDates.size > 0;
        const hasInsight = !!state.insightFilter;
        
        clearBtn.style.display = (hasText || hasCalendar || hasInsight) ? 'block' : 'none';
        searchInput.readOnly = false;
        searchInput.style.color = 'var(--text)';
        searchInput.style.fontWeight = '500';
        if (!state.searchText) {
            searchInput.value = '';
        }
    }

    const activeFiltersBar = document.getElementById('active-filters-bar');
    if (activeFiltersBar) {
        let badgesHtml = '';
        
        if (state.selectedCalendarDates && state.selectedCalendarDates.size > 0) {
            const count = state.selectedCalendarDates.size;
            badgesHtml += `
            <div class="tag" style="background: rgba(187, 247, 208, 0.4); color: var(--primary); border: 1px solid rgba(187, 247, 208, 0.8); font-size: 0.8rem; font-weight: 700; padding: 2px 6px; display: inline-flex; align-items: center; gap: 4px; border-radius: var(--radius-sm);">
                <span>📅 Calendar (${count} day${count > 1 ? 's' : ''})</span>
                <span style="cursor: pointer; font-weight: 800; font-size: 0.95rem; margin-left: 2px;" onclick="clearCalendarFilter()">&times;</span>
            </div>`;
        }
        
        if (state.insightFilter) {
            badgesHtml += `
            <div class="tag" style="background: rgba(199, 210, 254, 0.4); color: #4f46e5; border: 1px solid rgba(199, 210, 254, 0.8); font-size: 0.8rem; font-weight: 700; padding: 2px 6px; display: inline-flex; align-items: center; gap: 4px; border-radius: var(--radius-sm);">
                <span>👤 Filter: ${state.insightFilter.name} (${state.insightFilter.cat})</span>
                <span style="cursor: pointer; font-weight: 800; font-size: 0.95rem; margin-left: 2px;" onclick="clearInsightFilter()">&times;</span>
            </div>`;
        }
        
        if (badgesHtml) {
            activeFiltersBar.innerHTML = badgesHtml;
            activeFiltersBar.style.display = 'flex';
        } else {
            activeFiltersBar.innerHTML = '';
            activeFiltersBar.style.display = 'none';
        }
    }

    const ledgerCountEl = document.getElementById('ledger-count');
    if (ledgerCountEl) {
        const activeFilteredCount = filteredExpenses.filter(e => !e.ignored).length;
        if (activeFilteredCount !== filteredExpenses.length) {
            ledgerCountEl.innerText = `(${activeFilteredCount}/${filteredExpenses.length})`;
        } else {
            ledgerCountEl.innerText = `(${filteredExpenses.length})`;
        }
    }

    if (eList) {
        eList.innerHTML = filteredExpenses.length ? filteredExpenses.map(e => {
            const payerColor = getColor(e.payer); 
            const catInfo = CATEGORIES[e.category] || CATEGORIES['Other'];
            const formattedDate = formatDateDisplay(e.date);
            let breakdownHtml = '';
            const localSym = CURRENCY_SYMBOLS[e.localCurrency] ? CURRENCY_SYMBOLS[e.localCurrency] : (e.localCurrency ? e.localCurrency + ' ' : '$');
            let displayMainAmount = `${localSym}${e.localAmount.toFixed(2)}`;
            let displaySubAmount = '';
            
            if (e.localCurrency !== 'USD') {
                displaySubAmount = `<br><span style="font-size: 0.85rem; color: var(--secondary);">($${e.amount.toFixed(2)} USD @ ${(e.exchangeRate||1).toFixed(4)})</span>`;
            }

            if (e.splitType === 'percentage') {
                let totalEnteredPerc = 0; 
                let unenteredCount = 0;
                e.involved.forEach(inv => {
                    if (e.percentageShares && e.percentageShares[inv] !== undefined) totalEnteredPerc += e.percentageShares[inv];
                    else unenteredCount++;
                });
                let defaultPerc = unenteredCount > 0 ? Math.max(0, 100 - totalEnteredPerc) / unenteredCount : 0;
                breakdownHtml = e.involved.map(p => {
                    const pPerc = (e.percentageShares && e.percentageShares[p] !== undefined) ? e.percentageShares[p] : defaultPerc;
                    const finalShare = e.amount * (pPerc / 100);
                    return `<span style="white-space: nowrap;" title="${p}"><span style="color: ${getColor(p)}; font-weight: 700;">${shortName(p)}</span> <span class="tabular-nums" style="font-size: 0.85rem; color: var(--secondary);">(${formatMoney(finalShare)} / ${pPerc.toFixed(1)}%)</span></span>`;
                }).join(', ');
            } else {
                let totalPersonalForExp = 0;
                let totalFixedForExp = 0;
                let unfixedCount = 0;

                e.involved.forEach(p => {
                    if (e.fixedShares && e.fixedShares[p] !== undefined) {
                        totalFixedForExp += e.fixedShares[p];
                    } else {
                        unfixedCount++;
                        if (e.personalExpenses && e.personalExpenses[p]) {
                            totalPersonalForExp += e.personalExpenses[p];
                        }
                    }
                });

                const sharedAmount = Math.max(0, e.amount - totalFixedForExp - totalPersonalForExp); 
                const baseShare = unfixedCount > 0 ? sharedAmount / unfixedCount : 0;
                
                breakdownHtml = e.involved.map(p => {
                    if (e.fixedShares && e.fixedShares[p] !== undefined) {
                        const fixedShare = e.fixedShares[p];
                        return `<span style="white-space: nowrap;" title="${p}"><span style="color: ${getColor(p)}; font-weight: 700;">${shortName(p)}</span> <span class="tabular-nums" style="font-size: 0.85rem; color: var(--secondary);">(${formatMoney(fixedShare)} <span style="color:#d97706;">exact</span>)</span></span>`;
                    } else {
                        const personal = (e.personalExpenses && e.personalExpenses[p]) ? e.personalExpenses[p] : 0;
                        const finalShare = baseShare + personal;
                        let personalNote = personal > 0 ? ` <span style="font-size:0.75rem; color: var(--primary);">(+ ${formatMoney(personal)} extra)</span>` : '';
                        return `<span style="white-space: nowrap;" title="${p}"><span style="color: ${getColor(p)}; font-weight: 700;">${shortName(p)}</span> <span class="tabular-nums" style="font-size: 0.85rem; color: var(--secondary);">(${formatMoney(finalShare)}${personalNote})</span></span>`;
                    }
                }).join(', ');
            }

            const tagsHtml = (e.tags || []).length > 0 ? `<div style="margin-top: 6px;">` + [...e.tags].sort((a, b) => a.localeCompare(b)).map(t => `<span class="tag-pill" style="${getTagStyle(t)}" onclick="selectTagForSearch('${t}')" title="Filter by #${t}">#${t}</span>`).join('') + `</div>` : '';

            let notesHtml = '';
            if (e.notes && e.notes.trim() !== '') {
                const isUrl = e.notes.startsWith('http://') || e.notes.startsWith('https://');
                const noteContent = isUrl ? `<a href="${e.notes}" target="_blank" style="color: var(--primary); text-decoration: underline; word-break: break-all;">${e.notes}</a>` : `<span style="word-break: break-word;">${e.notes}</span>`;
                notesHtml = `<div style="margin-top: 10px; padding: 8px 12px; background: rgba(255, 255, 255, 0.5); border-radius: var(--radius-sm); font-size: 0.85rem; color: var(--secondary); border: 1px solid rgba(226, 232, 240, 0.6); border-left: 4px solid ${catInfo.color};">${noteContent}</div>`;
            }

            const isEditing = state.editingExpenseId === e.id; 
            const editingClass = isEditing ? 'is-editing' : '';
            let cardStyle = `background: linear-gradient(135deg, ${catInfo.bg}, rgba(255, 255, 255, 0.45)); border: 1px solid ${catInfo.color}30; border-left: 6px solid ${catInfo.color};`; 
            const ignoredClass = e.ignored ? 'ignored' : '';

            return `
            <div id="exp-row-${e.id}" class="expense-item ${ignoredClass} ${editingClass}" style="${cardStyle}">
                <div class="expense-details">
                    <span style="color:${catInfo.color}; font-weight: 800; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em;">${catInfo.icon} ${e.category}</span><br>
                    <strong style="font-size: 1.15rem; color: #0f172a; letter-spacing: -0.01em;">${e.desc}</strong>
                    ${e.ignored ? '<span style="color: var(--danger); font-size: 0.75rem; font-weight: 800; margin-left: 6px; background: #fee2e2; padding: 2px 4px; border-radius: 4px;">IGNORED</span>' : ''}<br>
                    <span style="font-size:0.9rem; color:var(--secondary); font-weight: 500;">
                        ${formattedDate} • Paid by <span style="color:${payerColor}; font-weight:800;" title="${e.payer}">${shortName(e.payer)}</span> • 👥 <strong>${e.involved.length}</strong> involved<br>
                        <div style="margin-top: 6px; padding-left: 8px; border-left: 2px solid rgba(226,232,240,0.8); font-size: 0.85rem; line-height: 1.4;">
                            <strong style="color: var(--text);">For:</strong> ${breakdownHtml}
                        </div>
                    </span>
                    ${tagsHtml}
                    ${notesHtml}
                </div>
                <div class="expense-amount-actions">
                    <div class="expense-amount">${displayMainAmount}${displaySubAmount}</div>
                    <div class="expense-actions">
                        <button class="outline small" style="background: white;" onclick="duplicateExpense('${e.id}')" title="Duplicate Activity">📋</button>
                        <button class="outline small" style="background: white;" onclick="toggleIgnore('${e.id}')" title="Toggle Ignore">${e.ignored ? '✅' : '🚫'}</button>
                        <button class="outline small" style="background: white;" onclick="openMultipleEditTags()" title="Multiple Edit">🏷️</button>
                        <button class="outline small" style="background: white;" onclick="editExpense('${e.id}')" title="Edit">✏️</button>
                        <button class="outline small" style="background: white; color: var(--danger);" onclick="deleteExpense('${e.id}')" title="Delete">🗑️</button>
                    </div>
                </div>
            </div>`
        }).join('') : '<div style="padding: 20px 10px; text-align: center; color: var(--secondary); background: #ffffff; border-radius: var(--radius-sm); border: 1px dashed var(--border);"><em>No activities match the current filters or search.</em></div>';
    }

    const badgeContainer = document.getElementById('next-payer-container');
    if (badgeContainer) {
        if (validActiveCount > 0 && state.participants.length > 0) {
            let topDebtor = null; 
            let maxDebt = 0.01; 
            Object.keys(groupStats).forEach(gName => {
                const diff = groupStats[gName].paid - groupStats[gName].owed;
                if (diff < -maxDebt) { 
                    maxDebt = Math.abs(diff); 
                    topDebtor = gName; 
                }
            });
            if (topDebtor) {
                badgeContainer.innerHTML = `<div class="next-payer-badge">🚨 Pay Next? <strong style="color: ${getColor(groupStats[topDebtor].members[0])};" title="${topDebtor}">${shortName(topDebtor)}</strong> <span class="tabular-nums">(Owes ${formatMoney(maxDebt)})</span></div>`;
            } else {
                badgeContainer.innerHTML = `<div class="next-payer-badge" style="color: var(--green); border-color: #bbf7d0; background: #f0fdf4;">🎉 Everyone perfectly settled!</div>`;
            }
        } else { 
            badgeContainer.innerHTML = ''; 
        }
    }

    const statsDiv = document.getElementById('ledger-stats');
    if (statsDiv) {
        if (validActiveCount > 0 && state.participants.length > 0) {
            let burnRateHtml = '';
            if (state.showPerDay && state.tripDays > 0 && state.participants.length > 0) {
                const burnRate = totalSpent / state.tripDays / state.participants.length;
                burnRateHtml = `<div style="font-size: 0.85rem; color: var(--secondary); margin-top: 6px;">🔥 Burn Rate: <strong class="tabular-nums" style="color: var(--danger);">${formatMoney(burnRate)}</strong> / pers / day</div>`;
            }

            let statsHtml = `
            <div class="global-stats-grid">
                <div class="global-stat-box">
                    <span class="global-stat-label">Filtered Trip Cost</span>
                    <div style="display: flex; align-items: center; flex-wrap: wrap;">
                        <span class="global-stat-value tabular-nums" style="color: var(--primary);">${formatMoney(totalSpent)}</span>
                        ${getPerDayText(totalSpent)}
                    </div>
                    ${burnRateHtml}
                </div>
                <div class="global-stat-box" style="background: #fff1f2; border-color: #fecdd3;">
                    <span class="global-stat-label" style="color: #be123c;">Biggest Splurge</span>
                    <span class="global-stat-value" style="font-size: 1.1rem; color: #be123c;">
                        ${CATEGORIES[biggestSplurge.category]?.icon || '📝'} ${biggestSplurge.desc} <strong class="tabular-nums" style="font-size: 1.15rem;">(${formatMoney(biggestSplurge.amount)})</strong>
                    </span>
                </div>
                <div class="global-stat-box">
                    <span class="global-stat-label">📅 Most Exp. Day</span>
                    <span class="global-stat-value" style="font-size: 1.1rem;">
                        ${mostExpensiveDay.date ? formatDateDisplay(mostExpensiveDay.date) : 'N/A'} <strong class="tabular-nums">(${formatMoney(mostExpensiveDay.amount)})</strong>
                    </span>
                </div>
                <div class="global-stat-box">
                    <span class="global-stat-label">🏆 Trip Banker</span>
                    <span class="global-stat-value" style="font-size: 1.1rem; color: ${getColor(tripBanker.name)}" title="${tripBanker.name}">
                        ${shortName(tripBanker.name)} <strong class="tabular-nums" style="color: var(--text);">(${formatMoney(tripBanker.paid)})</strong>
                    </span>
                    <div style="font-size: 0.8rem; color: var(--secondary); margin-top: 2px;">Fronted money for ${tripBanker.count} acts</div>
                </div>
            </div>`;
            
            statsHtml += `<div class="section-label">Category Breakdown & Averages</div>`;
            statsHtml += `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; margin-bottom: 24px;">`;
            Object.keys(categoryTotals).forEach(cat => {
                if (cat !== 'Transfer' && categoryTotals[cat] > 0) {
                    const info = CATEGORIES[cat]; 
                    const avgPerPerson = categoryTotals[cat] / categoryParticipations[cat];
                    const catPerc = totalSpent > 0 ? ((categoryTotals[cat] / totalSpent) * 100).toFixed(1) : 0;
                    
                    statsHtml += `
                    <div style="background:${info.bg}; border: 1px solid ${info.color}40; border-radius: var(--radius-sm); padding: 12px; display: flex; flex-direction: column; align-items: center; box-shadow: var(--shadow-sm); border-top: 4px solid ${info.color};">
                        <div style="font-size: 0.9rem; font-weight: 800; color: ${info.color};">${info.icon} ${cat}</div>
                        <div style="font-size: 0.75rem; color: var(--secondary); font-weight: 600; margin-bottom: 6px;">${categoryActivityCounts[cat]} Acts • ${catPerc}% of total</div>
                        <div style="display: flex; align-items: center; justify-content: center; flex-direction: column;">
                            <div class="tabular-nums" style="font-size: 1.2rem; color: var(--text); font-weight: 900;">${formatMoney(categoryTotals[cat])}</div>
                            ${state.showPerDay && state.tripDays > 0 ? `<div class="tabular-nums" style="font-size: 0.75rem; color: var(--primary); font-weight: 700; margin-top: 2px;">${formatMoney(categoryTotals[cat] / state.tripDays)} / day</div>` : ''}
                        </div>
                        <div style="font-size: 0.8rem; color: var(--secondary); margin-top: 8px; border-top: 1px solid ${info.color}30; padding-top: 6px; width: 100%; text-align: center;">
                            <strong class="tabular-nums">Avg Act: ${formatMoney(avgPerPerson)}</strong> / person
                        </div>
                    </div>`;
                }
            });
            statsHtml += `</div>`;

            statsHtml += `<div class="section-label">Group / Personal Insights</div>`;
            statsHtml += `<div class="stats-grid">`;
            
            Object.keys(groupStats).forEach(gName => {
                const stats = groupStats[gName];
                if (stats.owed === 0 && stats.paid === 0) return; 
                const isGroup = stats.members.length > 1 || stats.members[0] !== gName;
                const repColor = isGroup ? getGroupColor(gName) : getColor(stats.members[0]); 
                let topCat = null; 
                let maxCatAmt = 0;
                
                let catBreakdownHtml = '<div style="margin-top: 12px; display: flex; flex-direction: column; gap: 8px;">';
                Object.keys(CATEGORIES).forEach(cat => {
                    const amt = stats.catShares[cat];
                    const paidAmt = stats.catPaid[cat];
                    const icon = CATEGORIES[cat].icon; 
                    const catColor = CATEGORIES[cat].color; 
                    const catBg = CATEGORIES[cat].bg; 
                    
                    if (cat !== 'Transfer') {
                        if (amt > 0) {
                            if (amt > maxCatAmt) { 
                                maxCatAmt = amt; 
                                topCat = cat; 
                            }
                            const catActCount = stats.catActivitySets[cat].size; 
                            const catAvg = catActCount > 0 ? formatMoney(amt / catActCount) : '0.00';
                            
                            catBreakdownHtml += `
                                <div onclick="filterByInsight('${gName}', '${cat}')" title="📊 ${cat} Insights:&#10;• Total Activities: ${catActCount}&#10;• Total Spent: ${formatMoney(amt)}&#10;• Avg / Activity: ${catAvg}" style="cursor: pointer; display:flex; justify-content:space-between; align-items: center; background: ${catBg}; border: 1px solid ${catColor}40; padding: 8px 10px; border-radius: var(--radius-sm); transition: transform 0.2s;">
                                    <span style="color: ${catColor}; font-weight: 800; font-size: 0.85rem;">${icon} ${cat}</span> 
                                    <div style="text-align: right; line-height: 1.3; display: flex; flex-direction: column; align-items: flex-end;">
                                        <div style="display: flex; justify-content: flex-end; align-items: center; flex-wrap: wrap;">
                                            <span class="tabular-nums" style="color: var(--text); font-weight: 800; font-size: 0.95rem;">${formatMoney(amt)}</span>
                                            ${getPerDayTextSmall(amt)}
                                        </div>
                                        <span class="tabular-nums" style="font-size: 0.75rem; color: var(--secondary); font-weight: 600;">Avg: ${catAvg}/act</span>
                                    </div>
                                </div>`;
                        }
                    } else {
                        if (paidAmt > 0) {
                            catBreakdownHtml += `
                                <div onclick="filterByInsight('${gName}', '${cat}')" style="cursor: pointer; display:flex; justify-content:space-between; align-items: center; background: ${catBg}; border: 1px solid ${catColor}40; padding: 8px 10px; border-radius: var(--radius-sm);">
                                    <span style="color: ${catColor}; font-weight: 800; font-size: 0.85rem;">${icon} ${cat} (Paid)</span> 
                                    <div style="text-align: right; line-height: 1.3;">
                                        <div style="display: flex; justify-content: flex-end; align-items: center; flex-wrap: wrap;">
                                            <span class="tabular-nums" style="color: var(--text); font-weight: 800; font-size: 0.95rem;">${formatMoney(paidAmt)}</span>
                                            ${getPerDayTextSmall(paidAmt)}
                                        </div>
                                    </div>
                                </div>`;
                        }
                        if (amt > 0) {
                            catBreakdownHtml += `
                                <div onclick="filterByInsight('${gName}', '${cat}')" style="cursor: pointer; display:flex; justify-content:space-between; align-items: center; background: #fef2f2; border: 1px solid #fecdd3; padding: 8px 10px; border-radius: var(--radius-sm);">
                                    <span style="color: var(--danger); font-weight: 800; font-size: 0.85rem;">${icon} ${cat} (Received)</span> 
                                    <div style="text-align: right; line-height: 1.3;">
                                        <div style="display: flex; justify-content: flex-end; align-items: center; flex-wrap: wrap;">
                                            <span class="tabular-nums" style="color: var(--danger); font-weight: 800; font-size: 0.95rem;">+${formatMoney(amt)}</span>
                                            ${getPerDayTextSmall(amt)}
                                        </div>
                                    </div>
                                </div>`;
                        }
                    }
                });
                catBreakdownHtml += '</div>';

                let individualBreakdownHtml = '';
                if (stats.members.length > 1) {
                    individualBreakdownHtml += `<details class="indiv-details"><summary>Individual Breakdown</summary><div class="indiv-content">`;
                    stats.members.forEach(m => {
                        const mStats = stats.memberStats[m];
                        if (mStats.paid > 0 || mStats.owed > 0) {
                            let mCatHtml = '';
                            Object.keys(CATEGORIES).forEach(cat => {
                                const amt = mStats.catShares[cat];
                                const paidAmt = mStats.catPaid[cat];
                                const icon = CATEGORIES[cat].icon;
                                const catColor = CATEGORIES[cat].color;
                                const catBg = CATEGORIES[cat].bg;
                                
                                if (cat !== 'Transfer') {
                                    if (amt > 0) {
                                        mCatHtml += `<span onclick="filterByInsight('${m}', '${cat}')" style="cursor: pointer; display: inline-flex; align-items: center; background: ${catBg}; padding: 4px 8px; border-radius: 6px; border: 1px solid ${catColor}40; font-size: 0.75rem; color: ${catColor}; font-weight: 700;">${icon} <span class="tabular-nums" style="margin-left: 4px;">${formatMoney(amt)}</span>${getPerDayTextSmall(amt)}</span>`;
                                    }
                                } else {
                                    if (paidAmt > 0) {
                                        mCatHtml += `<span onclick="filterByInsight('${m}', '${cat}')" style="cursor: pointer; display: inline-flex; align-items: center; background: ${catBg}; padding: 4px 8px; border-radius: 6px; border: 1px solid ${catColor}40; font-size: 0.75rem; color: ${catColor}; font-weight: 700;">${icon} <span class="tabular-nums" style="margin-left: 4px;">${formatMoney(paidAmt)}</span>${getPerDayTextSmall(paidAmt)}</span>`;
                                    }
                                    if (amt > 0) {
                                        mCatHtml += `<span onclick="filterByInsight('${m}', '${cat}')" style="cursor: pointer; display: inline-flex; align-items: center; background: #fef2f2; padding: 4px 8px; border-radius: 6px; border: 1px solid #fecdd3; font-size: 0.75rem; color: var(--danger); font-weight: 700;">${icon} <span class="tabular-nums" style="margin-left: 4px;">+${formatMoney(amt)}</span>${getPerDayTextSmall(amt)}</span>`;
                                    }
                                }
                            });
                            individualBreakdownHtml += `
                                <div style="background: #f8fafc; padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
                                    <div style="display:flex; justify-content:space-between; align-items: center; font-size: 0.85rem; margin-bottom: 6px;">
                                        <span style="color: ${getColor(m)}; font-weight: 800; font-size: 0.95rem;" title="${m}">${shortName(m)}</span>
                                        <div style="text-align: right; line-height: 1.4; display: flex; flex-direction: column; align-items: flex-end;">
                                            <div style="display:flex; align-items: center; flex-wrap: wrap; justify-content: flex-end;"><span style="color: var(--secondary); font-size: 0.75rem; margin-right: 4px;">Share:</span><strong class="tabular-nums" style="color: var(--text);">${formatMoney(mStats.owed)}</strong>${getPerDayTextSmall(mStats.owed)}</div>
                                            <div style="display:flex; align-items: center; flex-wrap: wrap; justify-content: flex-end;"><span style="color: var(--secondary); font-size: 0.75rem; margin-right: 4px;">Paid:</span><strong class="tabular-nums" style="color: var(--text);">${formatMoney(mStats.paid)}</strong>${getPerDayTextSmall(mStats.paid)}</div>
                                        </div>
                                    </div>
                                    <div style="display:flex; flex-wrap: wrap; gap: 4px;">${mCatHtml}</div>
                                </div>`;
                        }
                    });
                    individualBreakdownHtml += `</div></details>`;
                }

                const totalGroupActs = new Set();
                Object.keys(stats.catActivitySets).forEach(cat => { 
                    if(cat !== 'Transfer') {
                        stats.catActivitySets[cat].forEach(id => totalGroupActs.add(id)); 
                    }
                });
                const avgPerActivity = totalGroupActs.size > 0 ? formatMoney(stats.owed / totalGroupActs.size) : '0.00';
                const topCatDisplay = topCat ? `<span style="color: ${CATEGORIES[topCat].color}; font-weight: 800;">${CATEGORIES[topCat].icon} ${topCat}</span>` : '<span style="color: var(--secondary);">None</span>';
                const memberSubtext = stats.members.length > 1 ? `<div class="stat-members" title="${stats.members.join(', ')}">Includes: ${stats.members.map(m => `<span style="color: ${getColor(m)}; font-weight: 800;">${shortName(m)}</span>`).join(', ')}</div>` : '';

                statsHtml += `
                    <div class="stat-card" style="border-top: 5px solid ${repColor};">
                        <div class="stat-name" style="color: ${repColor};" title="${gName}">${shortName(gName)}</div>
                        ${memberSubtext}
                        <div style="background: #f8fafc; padding: 10px 14px; border-radius: var(--radius-sm); margin-bottom: 12px; font-size: 0.85rem; border: 1px solid var(--border);">
                            <div style="display:flex; justify-content:space-between; margin-bottom: 6px; align-items: center;">
                                <span style="color: var(--secondary); font-weight: 600;">Avg/Activity:</span> <strong class="tabular-nums" style="color: var(--text); font-size: 0.95rem;">${avgPerActivity}</strong>
                            </div>
                            <div style="display:flex; justify-content:space-between; align-items: center;">
                                <span style="color: var(--secondary); font-weight: 600;">Top Spend:</span> ${topCatDisplay}
                            </div>
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-bottom: 12px; font-size: 1rem; align-items: center;">
                            <span style="font-weight: 600; color: var(--secondary);">Net Paid:</span> 
                            <div style="display: flex; align-items: center; flex-wrap: wrap;">
                                <strong class="tabular-nums" style="color: var(--text); font-size: 1.1rem;">${formatMoney(stats.paid)}</strong>
                                ${getPerDayText(stats.paid)}
                            </div>
                        </div>
                        <div style="border-top: 1px solid var(--border); padding-top: 12px;">
                            <div style="display:flex; justify-content:space-between; font-weight: 900; font-size: 1.1rem; margin-bottom: 6px; align-items: center;">
                                <span>Total Share:</span> 
                                <div style="display: flex; align-items: center; flex-wrap: wrap; justify-content: flex-end;">
                                    <span class="tabular-nums">${formatMoney(stats.owed)}</span>
                                    ${getPerDayText(stats.owed)}
                                </div>
                            </div>
                            ${catBreakdownHtml}
                            ${individualBreakdownHtml}
                        </div>
                    </div>`;
            });
            statsHtml += `</div>`;
            statsDiv.innerHTML = statsHtml;
        } else {
            statsDiv.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--secondary); background: #ffffff; border-radius: var(--radius-sm); border: 1px dashed var(--border);"><em>Ensure you have active expenses and matching filters.</em></div>';
        }
    }

    state.currentStats = {
        groupStats, categoryTotals, categoryParticipations, categoryActivityCounts,
        biggestSplurge, mostExpensiveDay, tripBanker, totalSpent, validActiveCount
    };
    state.currentFilteredExpenses = filteredExpenses;
    state.currentTotalSpent = totalSpent;

    renderGroupBalances(groupStats, validActiveCount);
}

export function renderGroupBalances(groupStats, activeCount) {
    const bList = document.getElementById('balances-list');
    if (!bList) return;

    if (!state.participants.length || activeCount === 0) {
        bList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--secondary); background: #ffffff; border-radius: var(--radius-sm); border: 1px dashed var(--border);"><em>Ensure you have active expenses and matching filters.</em></div>';
        return;
    }

    const groupBalances = [];
    let html = '<div class="section-label" style="margin-top: 0;">Overall Standing (Filtered)</div>';
    Object.keys(groupStats).forEach(gName => {
        const diff = groupStats[gName].paid - groupStats[gName].owed;
        const isGroup = groupStats[gName].members.length > 1 || groupStats[gName].members[0] !== gName;
        const gColor = isGroup ? getGroupColor(gName) : getColor(groupStats[gName].members[0]);
        groupBalances.push({ name: gName, net: diff, color: gColor }); 
        let txt = diff > 0.01 ? `is owed ${formatMoney(diff)}` : (diff < -0.01 ? `owes ${formatMoney(Math.abs(diff))}` : 'is settled');
        let cls = diff > 0.01 ? 'owed' : (diff < -0.01 ? 'owes' : '');
        const memberText = groupStats[gName].members.length > 1 ? `<div style="font-size: 0.8rem; color: var(--secondary); margin-top: 4px; font-weight: 500;">Members: ${groupStats[gName].members.join(', ')}</div>` : '';
        html += `<div class="balance-item" style="flex-direction: column; align-items: flex-start; padding: 12px 0;">
                    <div style="display: flex; justify-content: space-between; width: 100%;">
                        <span style="color: ${groupBalances[groupBalances.length-1].color}; font-weight: 900; font-size: 1.1rem;">${gName}</span>
                        <span class="${cls} tabular-nums" style="font-size: 1.1rem;">${txt}</span>
                    </div>
                    ${memberText}
                 </div>`;
    });

    state.currentGroupBalances = groupBalances; 
    
    html += '<div class="section-label" style="margin-top: 24px;">How to Settle Up</div>';
    let debtors = groupBalances.filter(b => b.net < -0.01).map(b => ({ name: b.name, debt: Math.abs(b.net), color: b.color })).sort((a,b) => b.debt - a.debt);
    let creditors = groupBalances.filter(b => b.net > 0.01).map(b => ({ name: b.name, credit: b.net, color: b.color })).sort((a,b) => b.credit - a.credit);
    
    state.currentSettlements = []; 
    let d = 0, c = 0; 
    while (d < debtors.length && c < creditors.length) {
        let debtor = debtors[d]; 
        let creditor = creditors[c];
        let amount = Math.min(debtor.debt, creditor.credit);
        if (amount > 0.01) { 
            state.currentSettlements.push({ from: debtor, to: creditor, amount: amount }); 
        }
        debtor.debt -= amount; 
        creditor.credit -= amount;
        if (debtor.debt < 0.01) d++;
        if (creditor.credit < 0.01) c++;
    }

    if (state.currentSettlements.length === 0) {
        html += '<div style="padding: 16px; text-align: center; color: var(--green); font-weight: 800; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: var(--radius-sm); font-size: 1.05rem;">🎉 Everyone is fully settled!</div>';
    } else {
        html += '<div class="settlement-box">';
        state.currentSettlements.forEach(s => {
            html += `<div class="settlement-item">
                        <span><strong style="color:${s.from.color}; font-size: 1.05rem;">${s.from.name}</strong> pays <strong style="color:${s.to.color}; font-size: 1.05rem;">${s.to.name}</strong></span>
                        <span class="tabular-nums" style="font-weight: 900; color: var(--text); font-size: 1.1rem;">Out: ${formatMoney(s.amount)}</span>
                     </div>`;
        });
        html += '</div>';
    }
    bList.innerHTML = html;
}

// Close suggestions popups when clicking outside
document.addEventListener('click', function(e) {
    const formPopup = document.getElementById('form-tag-suggestions');
    const formInput = document.getElementById('exp-tags');
    if (formPopup && formPopup.style.display === 'block') {
        if (formInput && !formInput.contains(e.target) && !formPopup.contains(e.target)) {
            formPopup.style.display = 'none';
        }
    }
    
    const searchPopup = document.getElementById('search-tag-suggestions');
    const searchInput = document.getElementById('search-filter');
    if (searchPopup && searchPopup.style.display === 'block') {
        if (searchInput && !searchInput.contains(e.target) && !searchPopup.contains(e.target)) {
            searchPopup.style.display = 'none';
        }
    }
});

// Bind to window for HTML event handlers compatibility
window.addParticipant = addParticipant;
window.renameParticipant = renameParticipant;
window.changeGroup = changeGroup;
window.deleteParticipant = deleteParticipant;
window.saveGroupTemplate = saveGroupTemplate;
window.loadGroupTemplate = loadGroupTemplate;
window.resetTrip = resetTrip;
window.updateTripName = updateTripName;
window.updateTripComment = updateTripComment;
window.toggleHeader = toggleHeader;
window.toggleLedger = toggleLedger;
window.toggleActivityCard = toggleActivityCard;
window.togglePerDay = togglePerDay;
window.updateTripDays = updateTripDays;
window.handleCategoryChange = handleCategoryChange;
window.updatePayerColor = updatePayerColor;
window.toggleAllCheckboxes = toggleAllCheckboxes;
window.checkMasterCheckboxState = checkMasterCheckboxState;
window.updateSplitTypeUI = updateSplitTypeUI;
window.calculateRemainingPercentage = calculateRemainingPercentage;
window.updateFormCurrencyUI = updateFormCurrencyUI;
window.refreshFormRate = refreshFormRate;
window.handleFormTagInput = handleFormTagInput;
window.selectTagForForm = selectTagForForm;
window.handleSearchInput = handleSearchInput;
window.selectTagForSearch = selectTagForSearch;
window.toggleCategoryFilter = toggleCategoryFilter;
window.filterByInsight = filterByInsight;
window.handleSortChange = handleSortChange;
window.handleSearchChange = handleSearchChange;
window.clearSearch = clearSearch;
window.saveExpense = saveExpense;
window.editExpense = editExpense;
window.duplicateExpense = duplicateExpense;
window.deleteExpense = deleteExpense;
window.toggleIgnore = toggleIgnore;
window.toggleAllExpenses = toggleAllExpenses;
window.cancelEdit = cancelEdit;
window.updateUI = updateUI;
window.handleParticipantKeyPress = handleParticipantKeyPress;
window.syncStateToDOM = syncStateToDOM;

export function toggleHelpModal() {
    const help = document.getElementById('help-overlay');
    if (help) {
        help.classList.toggle('active');
    }
}

export function closeHelpModalOnOverlay(e) {
    if (e.target.id === 'help-overlay') {
        toggleHelpModal();
    }
}

window.toggleHelpModal = toggleHelpModal;
window.closeHelpModalOnOverlay = closeHelpModalOnOverlay;
window.addDefaultTag = addDefaultTag;
window.handleDefaultTagKeyPress = handleDefaultTagKeyPress;
window.renameDefaultTag = renameDefaultTag;
window.deleteDefaultTag = deleteDefaultTag;

export function openMultipleEditTags() {
    try {
        const groupsMap = {};
        state.participants.forEach(p => {
            const gName = state.participantGroups[p] || p;
            if (!groupsMap[gName]) groupsMap[gName] = [];
            groupsMap[gName].push(p);
        });
        
        const filteredActivities = state.expenses.filter(e => !e.ignored && doesExpenseMatchFilters(e, groupsMap));
        
        if (filteredActivities.length === 0) {
            alert("No active activities match the current filters.");
            return;
        }
        
        state.bulkEditActivities = filteredActivities;
        state.bulkRemovedTags = new Set();
        state.bulkAddedTags = [];
        
        const descEl = document.getElementById('bulk-edit-description');
        if (descEl) {
            descEl.innerText = `Modifying tags for ${filteredActivities.length} active, filtered activities.`;
        }
        
        let commonTags = [];
        if (filteredActivities[0] && filteredActivities[0].tags) {
            commonTags = [...filteredActivities[0].tags];
        }
        filteredActivities.forEach(e => {
            const eTags = e.tags || [];
            commonTags = commonTags.filter(t => eTags.includes(t));
        });
        state.bulkCommonTags = commonTags;
        
        const input = document.getElementById('bulk-new-tag');
        if (input) input.value = '';
        const suggestions = document.getElementById('bulk-tag-suggestions');
        if (suggestions) suggestions.style.display = 'none';
        
        renderBulkEditTagsList();
        
        const overlay = document.getElementById('multiple-edit-overlay');
        if (overlay) {
            overlay.classList.add('active');
        } else {
            console.error("multiple-edit-overlay not found in DOM! Please force reload (Ctrl+F5) to clear PWA cache.");
            alert("Bulk editor overlay element not found. Please force reload (Ctrl+F5) to refresh cache.");
        }
    } catch (err) {
        console.error("Error opening multiple edit modal:", err);
        alert("Error opening bulk editor: " + err.message);
    }
}

export function renderBulkEditTagsList() {
    const commonContainer = document.getElementById('bulk-common-tags');
    if (commonContainer) {
        const visibleCommon = state.bulkCommonTags.filter(t => !state.bulkRemovedTags.has(t));
        commonContainer.innerHTML = visibleCommon.length ? visibleCommon.map(t => {
            return `
            <div class="tag" style="${getTagStyle(t)}" title="${t}">
                <span class="tag-name">#${t}</span>
                <span class="tag-del" onclick="removeCommonTagFromBulk('${t}')">&times;</span>
            </div>`;
        }).join('') : '<span style="font-size:0.8rem; color:var(--secondary); font-style:italic;">No common tags found.</span>';
    }
    
    const addedContainer = document.getElementById('bulk-added-tags');
    if (addedContainer) {
        addedContainer.innerHTML = state.bulkAddedTags.map(t => {
            return `
            <div class="tag" style="${getTagStyle(t)}" title="${t}">
                <span class="tag-name">#${t}</span>
                <span class="tag-del" onclick="removeAddedTagFromBulk('${t}')">&times;</span>
            </div>`;
        }).join('');
    }
}

export function removeCommonTagFromBulk(tag) {
    state.bulkRemovedTags.add(tag);
    renderBulkEditTagsList();
}

export function addTagToBulkList() {
    const input = document.getElementById('bulk-new-tag');
    if (!input) return;
    let val = input.value.trim().toLowerCase();
    if (val.startsWith('#')) val = val.substring(1).trim();
    val = val.replace(/[^a-z0-9]/g, '');
    if (!val) return;
    
    if (state.bulkRemovedTags.has(val)) {
        state.bulkRemovedTags.delete(val);
    } else if (!state.bulkCommonTags.includes(val) && !state.bulkAddedTags.includes(val)) {
        state.bulkAddedTags.push(val);
    }
    
    input.value = '';
    const suggestions = document.getElementById('bulk-tag-suggestions');
    if (suggestions) suggestions.style.display = 'none';
    
    renderBulkEditTagsList();
}

export function removeAddedTagFromBulk(tag) {
    state.bulkAddedTags = state.bulkAddedTags.filter(t => t !== tag);
    renderBulkEditTagsList();
}

export function closeBulkEditTagsModal() {
    document.getElementById('multiple-edit-overlay').classList.remove('active');
}

export function applyBulkEditTags() {
    if (!state.bulkEditActivities || state.bulkEditActivities.length === 0) return;
    
    state.bulkEditActivities.forEach(e => {
        let currentTags = [...e.tags];
        currentTags = currentTags.filter(t => !state.bulkRemovedTags.has(t));
        state.bulkAddedTags.forEach(t => {
            if (!currentTags.includes(t)) {
                currentTags.push(t);
            }
        });
        currentTags.sort((a, b) => a.localeCompare(b));
        e.tags = currentTags;
    });
    
    saveState();
    updateUI();
    showToast(`Tags updated for ${state.bulkEditActivities.length} activities!`, 'edit');
    closeBulkEditTagsModal();
}

export function handleBulkTagAutocomplete(e) {
    const input = e.target;
    const value = input.value;
    const popup = document.getElementById('bulk-tag-suggestions');
    const allTags = getAllUniqueTags();
    if (!popup) return;
    
    let query = value.trim().toLowerCase();
    if (query.startsWith('#')) query = query.substring(1);
    
    if (!query) {
        popup.style.display = 'none';
        return;
    }
    
    const matches = allTags.filter(t => {
        const lower = t.toLowerCase();
        if (state.bulkAddedTags.includes(lower)) return false;
        if (state.bulkCommonTags.includes(lower) && !state.bulkRemovedTags.has(lower)) return false;
        return lower.includes(query);
    });
    
    if (matches.length > 0) {
        popup.innerHTML = matches.map(t => `<div class="suggestion-item" onclick="selectTagForBulk('${t}')"><span class="tag-pill" style="${getTagStyle(t)}">#${t}</span></div>`).join('');
        popup.style.display = 'block';
        popup.style.top = (input.offsetTop + input.offsetHeight) + 'px';
    } else {
        popup.style.display = 'none';
    }
}

export function selectTagForBulk(tag) {
    const input = document.getElementById('bulk-new-tag');
    if (input) {
        input.value = tag;
    }
    const popup = document.getElementById('bulk-tag-suggestions');
    if (popup) popup.style.display = 'none';
    input.focus();
}

export function handleBulkNewTagKeyPress(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        addTagToBulkList();
    }
}

window.openMultipleEditTags = openMultipleEditTags;
window.removeCommonTagFromBulk = removeCommonTagFromBulk;
window.addTagToBulkList = addTagToBulkList;
window.removeAddedTagFromBulk = removeAddedTagFromBulk;
window.closeBulkEditTagsModal = closeBulkEditTagsModal;
window.applyBulkEditTags = applyBulkEditTags;
window.handleBulkTagAutocomplete = handleBulkTagAutocomplete;
window.selectTagForBulk = selectTagForBulk;
window.handleBulkNewTagKeyPress = handleBulkNewTagKeyPress;
window.clearCalendarFilter = clearCalendarFilter;
window.clearInsightFilter = clearInsightFilter;


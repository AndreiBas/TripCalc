import { state, saveState, repairLegacyData } from './state.js';
import { CATEGORIES } from './config.js';
import { updateCurrencySelectors } from './currency.js';

// Get clean dependencies from UI dynamically to avoid circular import issues
let uiModule = null;
async function getUI() {
    if (!uiModule) {
        uiModule = await import('./ui.js');
    }
    return uiModule;
}

state.triggerCloudSync = (skipAutoSync = false) => {
    if (skipAutoSync || state.isOfflineMode) return;
    if (state.supabaseClient) {
        const el = document.getElementById('cloud-status');
        if (el) el.innerText = "⏳ Syncing...";
        clearTimeout(state.cloudSyncTimeout);
        state.cloudSyncTimeout = setTimeout(silentCloudSave, 1500);
    }
};

// --- CRYPTO UTILS ---
const enc = new TextEncoder();
const dec = new TextDecoder();

function bufferToBase64(buffer) {
    let binary = ''; 
    let bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) { 
        binary += String.fromCharCode(bytes[i]); 
    }
    return window.btoa(binary);
}

function base64ToBuffer(base64) {
    let binary_string = window.atob(base64); 
    let len = binary_string.length; 
    let bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) { 
        bytes[i] = binary_string.charCodeAt(i); 
    }
    return bytes.buffer;
}

async function getKeyMaterial(password) {
    return window.crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits", "deriveKey"]);
}

async function getKey(keyMaterial, salt) {
    return window.crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
        keyMaterial, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
    );
}

export async function encryptData(password, plainText) {
    const keyMaterial = await getKeyMaterial(password);
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const key = await getKey(keyMaterial, salt);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encryptedContent = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, enc.encode(plainText));
    return { salt: bufferToBase64(salt), iv: bufferToBase64(iv), ciphertext: bufferToBase64(encryptedContent) };
}

export async function decryptData(password, encryptedObj) {
    try {
        const keyMaterial = await getKeyMaterial(password);
        const salt = new Uint8Array(base64ToBuffer(encryptedObj.salt));
        const iv = new Uint8Array(base64ToBuffer(encryptedObj.iv));
        const ciphertext = new Uint8Array(base64ToBuffer(encryptedObj.ciphertext));
        const key = await getKey(keyMaterial, salt);
        const decryptedContent = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, ciphertext);
        return dec.decode(decryptedContent);
    } catch (e) {
        console.error("Decryption error", e); 
        return null;
    }
}

export async function generateAccessHash(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- SECURE SUPABASE SYNC ---
export function getSupabaseClient() {
    if (state.supabaseClient) return state.supabaseClient;
    const access = localStorage.getItem('tripSplitter_cloudAccess');
    if (!access) return null;
    try {
        const decodedConfig = window.atob(access);
        const [url, key] = decodedConfig.split('|');
        state.supabaseClient = supabase.createClient(url, key);
        return state.supabaseClient;
    } catch(e) { 
        return null; 
    }
}

export function updateSyncBtnState() {
    const btn = document.getElementById('master-sync-btn');
    if (!btn) return;
    const hasAccess = localStorage.getItem('tripSplitter_cloudAccess');
    const hasPin = localStorage.getItem('tripSplitter_hasPin') === 'true';
    
    if (!hasAccess) {
        btn.innerHTML = "☁️ Connect Cloud"; 
        btn.style.borderColor = "var(--border)"; 
        btn.style.color = "var(--text)";
    } else if (hasPin && !state.sessionPin) {
        btn.innerHTML = "🔒 Unlock Cloud"; 
        btn.style.borderColor = "var(--danger)"; 
        btn.style.color = "var(--danger)";
    } else {
        btn.innerHTML = "✅ Secured"; 
        btn.style.borderColor = "var(--green)"; 
        btn.style.color = "var(--green)";
    }

    updateOfflineUI();
}

export function updateOfflineUI() {
    const offlineBtn = document.getElementById('offline-mode-btn');
    const modalToggle = document.getElementById('modal-offline-toggle');
    const statusEl = document.getElementById('cloud-status');

    if (modalToggle) {
        modalToggle.checked = !!state.isOfflineMode;
    }

    if (offlineBtn) {
        if (state.isOfflineMode) {
            offlineBtn.innerHTML = '✈️ Offline';
            offlineBtn.title = 'Offline Mode Active: Click to switch Online and sync changes to cloud';
            offlineBtn.classList.add('btn-offline-active');
        } else {
            offlineBtn.innerHTML = '📶 Online';
            offlineBtn.title = 'Online Mode: Click to force Offline Mode (save locally only)';
            offlineBtn.classList.remove('btn-offline-active');
        }
    }

    if (state.isOfflineMode && statusEl) {
        if (state.hasPendingCloudSync) {
            statusEl.innerHTML = `<span style="color: #d97706; font-weight: 700;">📴 Offline (Pending sync)</span>`;
        } else {
            statusEl.innerHTML = `<span style="color: var(--secondary); font-weight: 600;">📴 Offline (Local)</span>`;
        }
    }
}

export async function toggleOfflineMode(forceVal = null) {
    const newMode = (forceVal !== null) ? !!forceVal : !state.isOfflineMode;
    state.isOfflineMode = newMode;
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem('tripSplitter_isOfflineMode', newMode ? 'true' : 'false');
    }

    updateOfflineUI();
    const UI = await getUI();

    if (state.isOfflineMode) {
        clearTimeout(state.cloudSyncTimeout);
        if (UI && typeof UI.showToast === 'function') {
            UI.showToast('✈️ Offline Mode enabled. All changes saved locally.', 'save');
        }
    } else {
        // Switched to Online!
        if (state.hasPendingCloudSync) {
            if (UI && typeof UI.showToast === 'function') {
                UI.showToast('📶 Reconnected! Syncing offline changes to cloud...', 'save');
            }
            await syncPendingOfflineChanges();
        } else {
            if (UI && typeof UI.showToast === 'function') {
                UI.showToast('📶 Online mode active. Real-time auto-sync resumed.', 'save');
            }
            fetchCloudTripNames();
        }
    }
}

export async function syncPendingOfflineChanges() {
    if (state.isOfflineMode) return;
    const key = await getValidCloudKey(true);
    if (!key) {
        const statusEl = document.getElementById('cloud-status');
        if (statusEl) statusEl.innerHTML = `<span style="color: var(--danger); font-weight: 700;">🔒 Unlock cloud to sync offline changes</span>`;
        return;
    }
    const client = getSupabaseClient();
    if (!client) return;

    const statusEl = document.getElementById('cloud-status');
    if (statusEl) statusEl.innerText = "⏳ Syncing offline changes...";

    const payloadStr = JSON.stringify({ 
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
        recentCurrencies: state.recentCurrencies,
        defaultTags: state.defaultTags,
        historyEnabled: state.historyEnabled,
        lastModified: state.localLastModified 
    });

    try {
        const encryptedData = await encryptData(key, payloadStr);
        const accessHash = await generateAccessHash(key);
        
        const { error } = await client.rpc('save_secure_trip', {
            p_id: 'auto_trip',
            p_hash: accessHash,
            p_data: encryptedData
        });

        if (error) {
            if (statusEl) statusEl.innerText = "❌ Auto-Sync Failed (Will retry)";
        } else {
            state.hasPendingCloudSync = false;
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('tripSplitter_hasPendingCloudSync', 'false');
            }
            if (statusEl) {
                const now = new Date();
                statusEl.innerHTML = `✅ Secured <span class="tabular-nums">${now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>`;
                statusEl.style.color = "var(--green)";
                setTimeout(() => { statusEl.style.color = "var(--secondary)"; }, 5000);
            }
            const UI = await getUI();
            if (UI && typeof UI.showToast === 'function') {
                UI.showToast('✅ All offline changes synced to Auto-Sync cloud slot!', 'save');
            }
            fetchCloudTripNames();
            saveHistoryToCloud('auto_trip');
        }
    } catch (err) {
        console.error("Sync pending offline changes failed:", err);
    }
}

export function openCloudSettingsModal() {
    document.getElementById('cloud-settings-overlay').classList.add('active');
}

export function disconnectLocalSync() {
    resetSupabaseConfig(false);
    document.getElementById('cloud-settings-overlay').classList.remove('active');
}

export function openChangePinModal() {
    if (!state.supabaseClient || (localStorage.getItem('tripSplitter_hasPin') === 'true' && !state.sessionPin)) {
        alert("Please unlock the cloud first before changing the PIN.");
        return;
    }
    document.getElementById('cloud-settings-overlay').classList.remove('active');
    document.getElementById('change-pin-overlay').classList.add('active');
    document.getElementById('current-session-pin').value = '';
    document.getElementById('new-session-pin').value = '';
}

export async function submitChangePin() {
    const currentPinInput = document.getElementById('current-session-pin').value.trim();
    const newPin = document.getElementById('new-session-pin').value.trim();
    
    if ((state.sessionPin || "") !== currentPinInput) {
        alert("❌ Incorrect current PIN.");
        return;
    }

    const devKey = localStorage.getItem('tripSplitter_deviceKey');
    const newFullKey = devKey + newPin;
    const client = getSupabaseClient();

    const btn = document.getElementById('submit-change-pin-btn');
    btn.innerText = "⏳ Re-encrypting...";
    btn.disabled = true;

    try {
        const { data } = await client.from('trip_sync').select('id, trip_data').in('id', [
            'manual_trip', 'manual_trip_2', 'manual_trip_3', 'auto_trip',
            'manual_trip_history', 'manual_trip_2_history', 'manual_trip_3_history', 'auto_trip_history'
        ]);

        if (data && data.length > 0) {
            for (const row of data) {
                let parsed = typeof row.trip_data === 'string' ? JSON.parse(row.trip_data) : row.trip_data;
                if (parsed && parsed.ciphertext) {
                   const oldFullKey = devKey + (state.sessionPin || "");
                   const decrypted = await decryptData(oldFullKey, parsed);
                   if (decrypted) {
                       const reEncrypted = await encryptData(newFullKey, decrypted);
                       await client.from('trip_sync').update({ trip_data: reEncrypted }).eq('id', row.id);
                   }
                }
            }
        }

        state.sessionPin = newPin;
        localStorage.setItem('tripSplitter_hasPin', newPin ? 'true' : 'false');
        alert("✅ PIN changed and all cloud data successfully re-encrypted.");
        document.getElementById('change-pin-overlay').classList.remove('active');
        updateSyncBtnState();

    } catch (e) {
        console.error("Change PIN error", e);
        alert("❌ Error changing PIN.");
    }
    btn.innerText = "Save New PIN";
    btn.disabled = false;
}

export function openNuclearResetModal() {
    if (!getSupabaseClient()) {
        alert("You are not connected to any cloud database.");
        return;
    }
    document.getElementById('cloud-settings-overlay').classList.remove('active');
    document.getElementById('nuclear-reset-overlay').classList.add('active');
    document.getElementById('nuclear-reset-confirm').value = '';
}

export async function submitNuclearReset() {
    const enteredCode = document.getElementById('nuclear-reset-confirm').value.trim();
    const savedAccessCode = localStorage.getItem('tripSplitter_cloudAccess');

    if (!savedAccessCode) {
        alert("No active cloud connection found to reset.");
        document.getElementById('nuclear-reset-overlay').classList.remove('active');
        return;
    }

    if (enteredCode !== savedAccessCode) {
        alert("❌ Incorrect Access Code.\n\nThe code you entered does not match the active connection. Reset aborted.");
        return;
    }

    const btn = document.getElementById('submit-nuclear-btn');
    btn.innerText = "⏳ Purging...";
    btn.disabled = true;

    const client = getSupabaseClient();
    if (client) {
        const { error } = await client.from('trip_sync').delete().in('id', [
            'manual_trip', 'manual_trip_2', 'manual_trip_3', 'auto_trip',
            'manual_trip_history', 'manual_trip_2_history', 'manual_trip_3_history', 'auto_trip_history'
        ]);
        if (error) {
            console.error("Delete error", error);
            alert("Error deleting remote data. Check your connection/access code.");
        }
    }

    resetSupabaseConfig(true);

    alert("☢️ Database fully wiped and cloud disconnected.");
    document.getElementById('nuclear-reset-overlay').classList.remove('active');
    btn.innerText = "Delete Everything";
    btn.disabled = false;
}

export function openCloudSetupModal() {
    document.getElementById('cloud-setup-overlay').classList.add('active');
    document.getElementById('setup-access-code').value = '';
    document.getElementById('setup-device-key').value = '';
    document.getElementById('setup-session-pin').value = '';
    return new Promise(resolve => { state.cloudAuthPromiseResolve = resolve; });
}

export function openPinModal() {
    document.getElementById('cloud-pin-overlay').classList.add('active');
    document.getElementById('unlock-session-pin').value = '';
    setTimeout(() => document.getElementById('unlock-session-pin').focus(), 100);
    return new Promise(resolve => { state.cloudAuthPromiseResolve = resolve; });
}

export function cancelCloudAuth() {
    document.getElementById('cloud-setup-overlay').classList.remove('active');
    document.getElementById('cloud-pin-overlay').classList.remove('active');
    if (state.cloudAuthPromiseResolve) state.cloudAuthPromiseResolve(false);
    state.cloudAuthPromiseResolve = null;
}

export async function submitCloudSetup() {
    const access = document.getElementById('setup-access-code').value.trim();
    const devKey = document.getElementById('setup-device-key').value.trim();
    const pin = document.getElementById('setup-session-pin').value.trim();
    
    if (!access || !devKey) { 
        alert("Please fill out the Access Code and Device Key."); 
        return; 
    }
    
    let tempClient;
    try {
        const decoded = window.atob(access);
        const parts = decoded.split('|');
        if (parts.length !== 2 || !parts[0].startsWith('http')) throw new Error();
        tempClient = supabase.createClient(parts[0], parts[1]);
    } catch(e) { 
        alert("Invalid Access Code format. Ensure it is Base64 encoded."); 
        return; 
    }

    const btn = document.querySelector('#cloud-setup-overlay button:last-child');
    const origText = btn.innerText; 
    btn.innerText = "Verifying..."; 
    btn.disabled = true;

    let isValid = true;
    try {
        const { data } = await tempClient.from('trip_sync').select('trip_data').in('id', ['manual_trip', 'manual_trip_2', 'manual_trip_3', 'auto_trip']);
        if (data && data.length > 0) {
            let hasEncryptedData = false;
            let decryptionSucceeded = false;
            
            for (const row of data) {
                let parsed = typeof row.trip_data === 'string' ? JSON.parse(row.trip_data) : row.trip_data;
                if (parsed && parsed.ciphertext) {
                    hasEncryptedData = true;
                    const decrypted = await decryptData(devKey + pin, parsed);
                    if (decrypted) decryptionSucceeded = true; 
                }
            }
            
            if (hasEncryptedData && !decryptionSucceeded) {
                isValid = false;
            }
        }
    } catch (e) { 
        console.error("Verification check failed.", e); 
    }

    btn.innerText = origText; 
    btn.disabled = false;

    if (!isValid) { 
        alert("❌ Incorrect Device Key or Session PIN for this database.\n\nDecryption failed. If you are trying to attach to an existing database, ensure your passwords are correct."); 
        return; 
    }

    localStorage.setItem('tripSplitter_cloudAccess', access);
    localStorage.setItem('tripSplitter_deviceKey', devKey);
    localStorage.setItem('tripSplitter_hasPin', pin ? 'true' : 'false');
    state.sessionPin = pin; 
    state.supabaseClient = tempClient;
    
    document.getElementById('cloud-setup-overlay').classList.remove('active');
    updateSyncBtnState(); 
    fetchCloudTripNames();
    
    if (state.cloudAuthPromiseResolve) state.cloudAuthPromiseResolve(true);
    state.cloudAuthPromiseResolve = null;
}

export async function submitPinUnlock() {
    const pin = document.getElementById('unlock-session-pin').value.trim();
    if (!pin) return; 

    const btn = document.querySelector('#cloud-pin-overlay button:last-child');
    const origText = btn.innerText; 
    btn.innerText = "Verifying..."; 
    btn.disabled = true;

    const client = getSupabaseClient();
    const devKey = localStorage.getItem('tripSplitter_deviceKey');
    let isValid = true;
    
    if (client && devKey) {
        try {
            const { data } = await client.from('trip_sync').select('trip_data').in('id', ['manual_trip', 'manual_trip_2', 'manual_trip_3', 'auto_trip']);
            if (data && data.length > 0) {
                let hasEncryptedData = false;
                let decryptionSucceeded = false;
                
                for (const row of data) {
                    let parsed = typeof row.trip_data === 'string' ? JSON.parse(row.trip_data) : row.trip_data;
                    if (parsed && parsed.ciphertext) {
                        hasEncryptedData = true;
                        const decrypted = await decryptData(devKey + pin, parsed);
                        if (decrypted) decryptionSucceeded = true; 
                    }
                }
                if (hasEncryptedData && !decryptionSucceeded) {
                    isValid = false;
                }
            }
        } catch (e) { 
            console.error("PIN check failed.", e); 
        }
    }

    btn.innerText = origText; 
    btn.disabled = false;

    if (!isValid) { 
        state.pinFailedAttempts++;
        if (state.pinFailedAttempts >= 5) {
            alert("❌ Incorrect Session PIN entered 5 times.\n\nFor your security, your Cloud Sync configuration has been completely reset.");
            state.pinFailedAttempts = 0;
            resetSupabaseConfig(true);
            document.getElementById('cloud-pin-overlay').classList.remove('active');
            if (state.cloudAuthPromiseResolve) state.cloudAuthPromiseResolve(false);
            state.cloudAuthPromiseResolve = null;
            return;
        } else {
            alert(`❌ Incorrect Session PIN.\n\nAttempt ${state.pinFailedAttempts} of 5. After 5 failed attempts, your sync config will be reset.`); 
            document.getElementById('unlock-session-pin').value = ''; 
            setTimeout(() => document.getElementById('unlock-session-pin').focus(), 100);
            return;
        }
    }

    state.pinFailedAttempts = 0;
    state.sessionPin = pin;
    document.getElementById('cloud-pin-overlay').classList.remove('active');
    updateSyncBtnState(); 
    fetchCloudTripNames();
    
    if (state.cloudAuthPromiseResolve) state.cloudAuthPromiseResolve(true);
    state.cloudAuthPromiseResolve = null;
}

export async function getValidCloudKey(isAutoSave = false) {
    const access = localStorage.getItem('tripSplitter_cloudAccess');
    const devKey = localStorage.getItem('tripSplitter_deviceKey');
    const hasPin = localStorage.getItem('tripSplitter_hasPin') === 'true';

    if (!access || !devKey) {
        if (isAutoSave) {
            const el = document.getElementById('cloud-status');
            if (el) el.innerHTML = '<span style="cursor:pointer;" onclick="manageCloudSync()">🔒 Setup Sync</span>';
            return null;
        }
        return await openCloudSetupModal() ? localStorage.getItem('tripSplitter_deviceKey') + (state.sessionPin || "") : null;
    }

    if (hasPin && !state.sessionPin) {
        if (isAutoSave) {
            const el = document.getElementById('cloud-status');
            if (el) el.innerHTML = '<span style="cursor:pointer; color: var(--danger); font-weight: 800;" onclick="manageCloudSync()">🔒 Sync Paused - Click to Unlock</span>';
            return null;
        }
        return await openPinModal() ? devKey + state.sessionPin : null;
    }
    return devKey + (state.sessionPin || "");
}

export async function manageCloudSync() {
    const access = localStorage.getItem('tripSplitter_cloudAccess');
    const hasPin = localStorage.getItem('tripSplitter_hasPin') === 'true';
    
    if (!access) await getValidCloudKey(); 
    else if (hasPin && !state.sessionPin) await getValidCloudKey(); 
    else openCloudSettingsModal();
}

export function resetSupabaseConfig(force = false) {
    if(force || confirm("Clear your Cloud Sync settings from this browser? This will remove your Access Code and Device Key.")) {
        localStorage.removeItem('tripSplitter_cloudAccess');
        localStorage.removeItem('tripSplitter_deviceKey');
        localStorage.removeItem('tripSplitter_hasPin');
        state.sessionPin = ""; 
        state.supabaseClient = null;
        updateSyncBtnState(); 
        fetchCloudTripNames(); 
        if (!force) alert("Cloud configuration cleared."); 
    }
}

export function compareVersions() {
    const checkSlot = (id, btnId, defaultText) => {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        if (state.cloudTripNames[id] === state.tripName && state.cloudTimestamps[id] > state.localLastModified) {
            btn.classList.add('btn-update-available');
            btn.innerHTML = defaultText === 'L' ? '⚠️ Load' : '⚠️ Update Found';
            btn.title = "A newer version of this trip exists in the cloud!";
        } else {
            btn.classList.remove('btn-update-available');
            btn.innerHTML = defaultText;
            btn.title = "";
        }
    };

    checkSlot('manual_trip', 'cloud-load-btn-1', 'L');
    checkSlot('manual_trip_2', 'cloud-load-btn-2', 'L');
    checkSlot('manual_trip_3', 'cloud-load-btn-3', 'L');
    checkSlot('auto_trip', 'cloud-load-auto-btn', 'Load Last');
}

export async function fetchCloudTripNames() {
    if (state.isOfflineMode) {
        updateOfflineUI();
        return;
    }
    if (state.hasPendingCloudSync) {
        syncPendingOfflineChanges();
    }
    const client = getSupabaseClient(); 
    if (!client) return; 
    
    const elements = {
        'manual_trip': document.getElementById('manual-cloud-name-1'),
        'manual_trip_2': document.getElementById('manual-cloud-name-2'),
        'manual_trip_3': document.getElementById('manual-cloud-name-3'),
        'auto_trip': document.getElementById('auto-cloud-name')
    };

    Object.values(elements).forEach(el => {
        if (el) el.innerText = "Checking...";
    });
    
    const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Cloud check timed out')), 5000)
    );

    const { data, error } = await Promise.race([
        client.from('trip_sync').select('id, trip_data').in('id', ['manual_trip', 'manual_trip_2', 'manual_trip_3', 'auto_trip']),
        timeoutPromise
    ]).catch(err => {
        Object.values(elements).forEach(el => {
            if (el) el.innerText = "Offline";
        });
        return { data: null, error: err };
    });
    
    if (error) {
        console.error("Fetch names error:", error);
        Object.values(elements).forEach(el => {
            if (el) el.innerText = "Sync Error";
        });
        return;
    }

    let names = { manual_trip: "Empty", manual_trip_2: "Empty", manual_trip_3: "Empty", auto_trip: "Empty" };
    
    if (data) {
        for (const row of data) {
            try {
                let parsed = typeof row.trip_data === 'string' ? JSON.parse(row.trip_data) : row.trip_data;
                if (parsed && parsed.ciphertext) {
                    const hasPin = localStorage.getItem('tripSplitter_hasPin') === 'true';
                    if (!hasPin || state.sessionPin) {
                        const fullKey = localStorage.getItem('tripSplitter_deviceKey') + (state.sessionPin || "");
                        const decrypted = await decryptData(fullKey, parsed);
                        if (decrypted) { 
                            parsed = JSON.parse(decrypted); 
                        } else { 
                            parsed = { tripName: "🔒 Locked (Wrong PIN?)" }; 
                        }
                    } else { 
                        parsed = { tripName: "🔒 Locked" }; 
                    }
                }
                if (parsed && parsed.tripName) {
                    state.cloudTripNames[row.id] = parsed.tripName; 
                    state.cloudTimestamps[row.id] = parsed.lastModified || 0;
                    names[row.id] = parsed.tripName;
                }
            } catch(e) { 
                console.error("Parse error", e); 
            }
        }
    }
    
    if (elements.manual_trip) elements.manual_trip.innerText = names.manual_trip;
    if (elements.manual_trip_2) elements.manual_trip_2.innerText = names.manual_trip_2;
    if (elements.manual_trip_3) elements.manual_trip_3.innerText = names.manual_trip_3;
    if (elements.auto_trip) elements.auto_trip.innerText = names.auto_trip;
    
    compareVersions();

    // Offline reconciliation: if local lastModified is newer than cloud auto_trip, trigger sync up to cloud
    if (state.cloudTripNames['auto_trip'] !== "🔒 Locked (Wrong PIN?)" && 
        state.cloudTripNames['auto_trip'] !== "🔒 Locked" &&
        state.cloudTripNames['auto_trip'] === state.tripName && 
        state.localLastModified > (state.cloudTimestamps['auto_trip'] || 0)) {
        console.log("Local offline changes detected. Syncing up to the cloud...");
        silentCloudSave();
    }
}

export async function saveToSupabase(targetId) {
    if (state.isOfflineMode) {
        if (confirm("Offline Mode is currently active. Switch to Online Mode to save to the cloud?")) {
            await toggleOfflineMode(false);
        } else {
            return;
        }
    }

    if (state.cloudTripNames[targetId] && !state.cloudTripNames[targetId].includes("Locked") && state.cloudTripNames[targetId] !== "Empty" && state.cloudTripNames[targetId] !== state.tripName) {
        if (!confirm(`⚠️ Warning: Cloud slot currently holds a different trip ("${state.cloudTripNames[targetId]}").\n\nAre you sure you want to overwrite it with "${state.tripName}"?`)) return;
    }

    const key = await getValidCloudKey(); 
    if (!key) return;
    const client = getSupabaseClient(); 
    if (!client) return;

    const payloadStr = JSON.stringify({ 
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
        recentCurrencies: state.recentCurrencies,
        defaultTags: state.defaultTags,
        historyEnabled: state.historyEnabled,
        lastModified: state.localLastModified 
    });
    
    const btnId = targetId === 'manual_trip' ? 'cloud-save-btn-1' : (targetId === 'manual_trip_2' ? 'cloud-save-btn-2' : 'cloud-save-btn-3');
    const btn = document.getElementById(btnId); 
    if (btn) btn.innerText = "⏳";
    
    try {
        const encryptedData = await encryptData(key, payloadStr);
        const accessHash = await generateAccessHash(key);
        
        const { error } = await client.rpc('save_secure_trip', {
            p_id: targetId,
            p_hash: accessHash,
            p_data: encryptedData
        });
        
        if (error) { 
            console.error(error); 
            alert("Error saving to cloud: " + error.message); 
        } else { 
            let slotName = targetId === 'manual_trip' ? 'Manual 1' : (targetId === 'manual_trip_2' ? 'Manual 2' : 'Manual 3');
            alert(`✅ Securely encrypted and saved to ${slotName}!`); 
            fetchCloudTripNames(); 
            saveHistoryToCloud(targetId);
        }
    } catch (err) { 
        alert("Encryption failed."); 
        console.error(err); 
    }
    if (btn) btn.innerText = "S";
}

export async function silentCloudSave() {
    if (state.isOfflineMode) return;
    const key = await getValidCloudKey(true); 
    if (!key) return;
    const client = getSupabaseClient(); 
    if (!client) return;
    
    const payloadStr = JSON.stringify({ 
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
        recentCurrencies: state.recentCurrencies,
        defaultTags: state.defaultTags,
        historyEnabled: state.historyEnabled,
        lastModified: state.localLastModified 
    });
    const statusEl = document.getElementById('cloud-status');
    
    try {
        const encryptedData = await encryptData(key, payloadStr);
        const accessHash = await generateAccessHash(key);
        
        const { error } = await client.rpc('save_secure_trip', {
            p_id: 'auto_trip',
            p_hash: accessHash,
            p_data: encryptedData
        });
        
        if (error) { 
            if(statusEl) statusEl.innerText = "❌ Auto-Sync Failed"; 
        } else { 
            if(statusEl) {
                const now = new Date();
                statusEl.innerHTML = `✅ Secured <span class="tabular-nums">${now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>`;
                statusEl.style.color = "var(--green)";
                setTimeout(() => { statusEl.style.color = "var(--secondary)"; }, 5000);
                fetchCloudTripNames(); 
            }
        }
    } catch (err) { 
        console.error("Silent save encryption failed.", err); 
    }
}

export async function loadFromSupabase(targetId) {
    if (state.isOfflineMode) {
        if (confirm("Offline Mode is currently active. Switch to Online Mode to load from the cloud?")) {
            await toggleOfflineMode(false);
        } else {
            return;
        }
    }

    const key = await getValidCloudKey(); 
    if (!key) return;
    const client = getSupabaseClient(); 
    if (!client) return;
    
    let btnId = 'cloud-load-auto-btn';
    if (targetId === 'manual_trip') btnId = 'cloud-load-btn-1';
    if (targetId === 'manual_trip_2') btnId = 'cloud-load-btn-2';
    if (targetId === 'manual_trip_3') btnId = 'cloud-load-btn-3';
    
    const btn = document.getElementById(btnId); 
    const originalText = btn ? btn.innerText : ''; 
    if (btn) btn.innerText = "⏳ Load...";
    
    const { data, error } = await client.from('trip_sync').select('trip_data').eq('id', targetId).maybeSingle();
    
    if (error) { 
        console.error(error); 
        alert("Error loading from cloud: " + error.message); 
    } else if (data && data.trip_data) {
        try {
            let parsedData = typeof data.trip_data === 'string' ? JSON.parse(data.trip_data) : data.trip_data;
            
            if (parsedData.ciphertext) {
                const decryptedStr = await decryptData(key, parsedData);
                if (!decryptedStr) {
                    alert("❌ Decryption failed! Incorrect Session PIN or corrupted data.");
                    state.sessionPin = ""; 
                    updateSyncBtnState(); 
                    fetchCloudTripNames(); 
                    if (btn) btn.innerText = originalText; 
                    return;
                }
                parsedData = JSON.parse(decryptedStr);
            }
            
            state.tripName = parsedData.tripName || "Imported Trip"; 
            state.tripComment = parsedData.tripComment || ""; 
            state.participants = parsedData.participants || []; 
            state.participantGroups = parsedData.participantGroups || {};
            state.expenses = parsedData.expenses || []; 
            state.secondaryCurrency = parsedData.secondaryCurrency || "";
            state.currentExchangeRate = parsedData.currentExchangeRate || 1; 
            state.currentSort = parsedData.currentSort || 'date-desc';
            state.tripDays = parsedData.tripDays || 1; 
            state.showPerDay = parsedData.showPerDay || false;
            state.tripNotes = parsedData.tripNotes || ""; 
            state.tripNotesDelta = parsedData.tripNotesDelta || null; 
            state.autoColorNotes = parsedData.autoColorNotes || false;
            state.isHeaderCollapsed = parsedData.isHeaderCollapsed || false;
            state.recentCurrencies = parsedData.recentCurrencies || [];
            state.defaultTags = parsedData.defaultTags || ['car', 'gas', 'flight', 'stay', 'grocery', 'restaurant'];
            state.historyEnabled = parsedData.historyEnabled || false;
            state.localLastModified = parsedData.lastModified || Date.now();
            state.insightFilter = null;
            state.searchText = '';

            repairLegacyData();
            
            const UI = await getUI();
            UI.applyHeaderState();
            state.activeCategoryFilters = new Set(Object.keys(CATEGORIES)); 
            
            // Sync database data back to UI elements
            UI.syncStateToDOM();
            
            saveState(true); 
            updateCurrencySelectors(); 
            UI.updateUI();  
            UI.cancelEdit();
            compareVersions();
            
            let slotName = "Autosave";
            if(targetId === 'manual_trip') slotName = "Manual 1";
            if(targetId === 'manual_trip_2') slotName = "Manual 2";
            if(targetId === 'manual_trip_3') slotName = "Manual 3";
            alert(`✅ Decrypted and loaded from the ${slotName} slot!`);
            
            import('./history.js').then(H => H.setCurrentHistorySlot(targetId));
            loadHistoryFromCloud(targetId);
        } catch(e) { 
            alert("Error parsing cloud data."); 
            console.error(e); 
        }
    } else { 
        alert("No trip data found in this slot."); 
    }
    if (btn) btn.innerText = originalText;
}

function historySlotId(id) {
    return id + '_history';
}

export async function saveHistoryToCloud(slotId = 'auto_trip') {
    if (!state.historyEnabled) return;
    const key = await getValidCloudKey(true); 
    if (!key) return;
    const client = getSupabaseClient();
    if (!client) return;

    const histData = JSON.stringify({
        tripName: state.tripName,
        historyStack: state.historyStack,
        lastModified: Date.now()
    });

    try {
        const encryptedData = await encryptData(key, histData);
        const accessHash = await generateAccessHash(key);
        await client.rpc('save_secure_trip', {
            p_id: historySlotId(slotId),
            p_hash: accessHash,
            p_data: encryptedData
        });
    } catch(err) {
        console.warn('History save failed', err);
    }
}

export async function loadHistoryFromCloud(slotId) {
    if (!state.historyEnabled) return;
    const key = await getValidCloudKey(true);
    if (!key) return;
    const client = getSupabaseClient();
    if (!client) return;

    const { data } = await client.from('trip_sync')
        .select('trip_data')
        .eq('id', historySlotId(slotId))
        .maybeSingle();

    if (!data || !data.trip_data) {
        import('./history.js').then(H => H.clearHistory());
        return;
    }

    try {
        const parsed = typeof data.trip_data === 'string'
            ? JSON.parse(data.trip_data) : data.trip_data;
        const decryptedStr = await decryptData(key, parsed);
        if (!decryptedStr) return;
        const histData = JSON.parse(decryptedStr);

        if (histData.tripName === state.tripName) {
            state.historyStack = histData.historyStack || [];
        } else {
            state.historyStack = [];
        }
        const UI = await getUI();
        if (UI.renderHistoryUI) UI.renderHistoryUI();
    } catch(e) {
        console.warn('History load failed', e);
    }
}

// --- LOCAL FILE SYNC (IMPORT / EXPORT) ---
export async function saveFileUniversal(content, fileName, mimeType, fileHandle = null) {
    const blob = new Blob([content], { type: mimeType });
    const file = new File([blob], fileName, { type: mimeType });

    if (fileHandle) {
        try {
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
            return;
        } catch(err) { console.warn('File handle write failed', err); }
    }

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({ files: [file], title: fileName });
            return; 
        } catch (err) { if (err.name === 'AbortError') return; }
    }

    if (window.showSaveFilePicker) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: fileName,
                types: [{ description: 'Trip File', accept: { [mimeType]: ['.json', '.tsplit'] } }]
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            return; 
        } catch (err) { if (err.name === 'AbortError') return; }
    }

    try {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 150);
    } catch (err) { alert("File save failed entirely."); }
}

export function exportTrip() {
    const payload = JSON.stringify({ 
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
        recentCurrencies: state.recentCurrencies,
        defaultTags: state.defaultTags,
        historyEnabled: state.historyEnabled,
        lastModified: state.localLastModified 
    });
    const fileName = state.tripName.replace(/\s+/g, '_') + ".json";
    saveFileUniversal(payload, fileName, 'application/json');
}

export async function exportSecureTrip() {
    const fileName = state.tripName.replace(/\s+/g, '_') + ".tsplit";
    let fileHandle = null;

    if (window.showSaveFilePicker) {
        try {
            fileHandle = await window.showSaveFilePicker({
                suggestedName: fileName,
                types: [{ description: 'Trip File', accept: { 'application/x-tsplit': ['.tsplit'] } }]
            });
        } catch (err) {
            if (err.name === 'AbortError') return;
        }
    }

    const password = prompt("⚠️ Secure Save ⚠️\nEnter a password to encrypt this trip file.\n\nWARNING: If you forget this password, your data cannot be recovered.");
    if (!password) return; 
    
    const payload = JSON.stringify({ 
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
        recentCurrencies: state.recentCurrencies,
        defaultTags: state.defaultTags,
        historyEnabled: state.historyEnabled,
        lastModified: state.localLastModified 
    });
    
    try {
        const encryptedData = await encryptData(password, payload);
        const securePayload = JSON.stringify(encryptedData);
        await saveFileUniversal(securePayload, fileName, 'text/plain', fileHandle);
    } catch (err) { 
        alert("Failed to encrypt data."); 
        console.error(err); 
    }
}

export async function importTrip(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
        let parsedData = null;
        try {
            const rawJson = JSON.parse(event.target.result);
            if (rawJson.ciphertext && rawJson.salt && rawJson.iv) {
                const password = prompt("🔐 This trip file is locked.\n\nEnter password to decrypt:");
                if (!password) { document.getElementById('file-import').value = ""; return; }
                const decryptedText = await decryptData(password, rawJson);
                if (!decryptedText) { alert("❌ Incorrect password or corrupted file."); document.getElementById('file-import').value = ""; return; }
                parsedData = JSON.parse(decryptedText);
            } else { parsedData = rawJson; }
        } catch (err) { alert("Invalid file format."); document.getElementById('file-import').value = ""; return; }

        if (parsedData) {
            state.tripName = parsedData.tripName || "Imported Trip"; 
            state.tripComment = parsedData.tripComment || ""; 
            state.participants = parsedData.participants || []; 
            state.participantGroups = parsedData.participantGroups || {};
            state.expenses = parsedData.expenses || []; 
            state.secondaryCurrency = parsedData.secondaryCurrency || "";
            state.currentExchangeRate = parsedData.currentExchangeRate || 1; 
            state.currentSort = parsedData.currentSort || 'date-desc';
            state.tripDays = parsedData.tripDays || 1; 
            state.showPerDay = parsedData.showPerDay || false;
            state.tripNotes = parsedData.tripNotes || ""; 
            state.tripNotesDelta = parsedData.tripNotesDelta || null; 
            state.autoColorNotes = parsedData.autoColorNotes || false;
            state.isHeaderCollapsed = parsedData.isHeaderCollapsed || false;
            state.recentCurrencies = parsedData.recentCurrencies || [];
            state.defaultTags = parsedData.defaultTags || ['car', 'gas', 'flight', 'stay', 'grocery', 'restaurant'];
            state.historyEnabled = parsedData.historyEnabled || false;
            state.insightFilter = null;
            state.searchText = '';
            state.localLastModified = parsedData.lastModified || Date.now();
            
            const UI = await getUI();
            UI.applyHeaderState();
            state.activeCategoryFilters = new Set(Object.keys(CATEGORIES)); 
            
            repairLegacyData();
            
            UI.syncStateToDOM();
            
            saveState(true); 
            updateCurrencySelectors(); 
            UI.updateUI(); 
            UI.cancelEdit();
            
            import('./history.js').then(H => H.clearHistory());
            if (UI.renderHistoryUI) UI.renderHistoryUI();
        }
        document.getElementById('file-import').value = "";
    };
    reader.readAsText(file);
}

// Bind to window for HTML event handlers compatibility
window.openCloudSettingsModal = openCloudSettingsModal;
window.manageCloudSync = manageCloudSync;
window.saveToSupabase = saveToSupabase;
window.loadFromSupabase = loadFromSupabase;
window.openNuclearResetModal = openNuclearResetModal;
window.submitNuclearReset = submitNuclearReset;
window.openChangePinModal = openChangePinModal;
window.submitChangePin = submitChangePin;
window.disconnectLocalSync = disconnectLocalSync;
window.cancelCloudAuth = cancelCloudAuth;
window.submitCloudSetup = submitCloudSetup;
window.submitPinUnlock = submitPinUnlock;
window.exportTrip = exportTrip;
window.exportSecureTrip = exportSecureTrip;
window.importTrip = importTrip;
window.toggleOfflineMode = toggleOfflineMode;
window.updateOfflineUI = updateOfflineUI;

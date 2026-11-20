import { state, saveState, repairLegacyData, buildTripPayload, setPendingCloudSync, computeTripContentHash, setUnsyncedLocalData, setLastSyncedHash, generateTripId } from './state.js';
import { CATEGORIES } from './config.js';
import { updateCurrencySelectors, warmCurrencyRatesCache } from './currency.js';

let isSyncingOffline = false;
let isSilentSaving = false;
let fetchCloudPromise = null;
let lastCloudFetchFinishedAt = 0;

function persistPinFailedAttempts(count) {
    state.pinFailedAttempts = count;
    if (typeof localStorage !== 'undefined') {
        if (count > 0) {
            localStorage.setItem('tripSplitter_pinFailedAttempts', String(count));
        } else {
            localStorage.removeItem('tripSplitter_pinFailedAttempts');
        }
    }
}

function resetCloudMetadata() {
    ['manual_trip', 'manual_trip_2', 'manual_trip_3', 'auto_trip'].forEach(slot => {
        state.cloudTripNames[slot] = "";
        if (state.cloudTripIds) state.cloudTripIds[slot] = "";
        state.cloudTimestamps[slot] = 0;
        if (state.cloudRevisions) state.cloudRevisions[slot] = 0;
        if (state.cloudHashes) state.cloudHashes[slot] = "";
    });
}

function isSameTrip(remoteTripId, remoteTripName) {
    if (state.tripId && remoteTripId) {
        return state.tripId === remoteTripId;
    }
    return Boolean(remoteTripName && remoteTripName === state.tripName);
}

export function compareVersionMeta(aTs, aRev, bTs, bRev) {
    const tsA = Number.isFinite(Number(aTs)) ? Number(aTs) : 0;
    const tsB = Number.isFinite(Number(bTs)) ? Number(bTs) : 0;
    if (tsA !== tsB) return tsA > tsB ? 1 : -1;
    const revA = Number.isFinite(Number(aRev)) ? Number(aRev) : 0;
    const revB = Number.isFinite(Number(bRev)) ? Number(bRev) : 0;
    if (revA !== revB) return revA > revB ? 1 : -1;
    return 0;
}

function isSlotUpdateAvailable(slotId, localHash) {
    const name = state.cloudTripNames[slotId];
    if (!name || name === 'Empty' || name.includes('Locked')) return false;
    if (!isSameTrip(state.cloudTripIds?.[slotId], name)) return false;
    const remoteHash = state.cloudHashes?.[slotId];
    if (remoteHash && remoteHash === localHash) return false;
    const remoteTs = state.cloudTimestamps?.[slotId] || 0;
    const remoteRev = state.cloudRevisions?.[slotId] || 0;
    return compareVersionMeta(remoteTs, remoteRev, state.localLastModified || 0, state.dataRevision || 0) > 0;
}

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
        state.cloudSyncTimeout = setTimeout(() => {
            state.cloudSyncTimeout = null;
            silentCloudSave();
        }, 1500);
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

export async function toggleOfflineMode(forceVal = null, options = {}) {
    const { skipPendingSync = false } = options;
    const newMode = (forceVal !== null) ? !!forceVal : !state.isOfflineMode;
    state.isOfflineMode = newMode;
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem('tripSplitter_isOfflineMode', newMode ? 'true' : 'false');
    }

    if (state.isOfflineMode && state.cloudSyncTimeout) {
        clearTimeout(state.cloudSyncTimeout);
        state.cloudSyncTimeout = null;
        setPendingCloudSync(true);
    }

    updateOfflineUI();
    const UI = await getUI();

    if (state.isOfflineMode) {
        clearTimeout(state.cloudSyncTimeout);
        state.cloudSyncTimeout = null;
        if (UI && typeof UI.showToast === 'function') {
            UI.showToast('✈️ Offline Mode enabled. All changes saved locally.', 'save');
        }
    } else {
        // Switched to Online!
        warmCurrencyRatesCache(true).catch(() => {});
        if (!skipPendingSync) {
            if (state.hasPendingCloudSync) {
                if (UI && typeof UI.showToast === 'function') {
                    UI.showToast('📶 Reconnected! Syncing offline changes to cloud...', 'save');
                }
                await syncPendingOfflineChanges();
                await fetchCloudTripNames({ skipPendingSyncCheck: true, force: true });
            } else {
                if (UI && typeof UI.showToast === 'function') {
                    UI.showToast('📶 Online mode active. Real-time auto-sync resumed.', 'save');
                }
                fetchCloudTripNames({ force: true });
            }
        }
    }
}

export async function syncPendingOfflineChanges() {
    if (state.isOfflineMode || !state.hasPendingCloudSync || isSyncingOffline) return false;
    const key = await getValidCloudKey(true);
    if (!key) {
        const statusEl = document.getElementById('cloud-status');
        if (statusEl) statusEl.innerHTML = `<span style="color: var(--danger); font-weight: 700;">🔒 Unlock cloud to sync offline changes</span>`;
        return false;
    }
    const client = getSupabaseClient();
    if (!client) return false;

    const statusEl = document.getElementById('cloud-status');
    if (statusEl) statusEl.innerText = "⏳ Syncing offline changes...";

    isSyncingOffline = true;
    try {
        // Pre-upload conflict check on auto_trip to prevent blind overwrites
        const checkTimeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Offline sync conflict check timed out')), 8000)
        );
        const { data: remoteRow, error: checkError } = await Promise.race([
            client.from('trip_sync').select('trip_data').eq('id', 'auto_trip').maybeSingle(),
            checkTimeoutPromise
        ]);
        if (checkError) throw checkError;

        if (remoteRow && remoteRow.trip_data) {
            let remoteParsed = typeof remoteRow.trip_data === 'string' ? JSON.parse(remoteRow.trip_data) : remoteRow.trip_data;
            if (remoteParsed && remoteParsed.ciphertext) {
                const decryptedRemote = await decryptData(key, remoteParsed);
                remoteParsed = decryptedRemote ? JSON.parse(decryptedRemote) : null;
            }
            if (remoteParsed && remoteParsed.tripName) {
                const remoteTs = remoteParsed.lastModified || 0;
                const remoteRev = Number(remoteParsed.dataRevision) || 0;
                const remoteHash = computeTripContentHash(remoteParsed);
                const localHash = computeTripContentHash(buildTripPayload(false));
                const same = isSameTrip(remoteParsed.tripId || "", remoteParsed.tripName);

                if (!same) {
                    const shouldOverwrite = confirm(`⚠️ Cloud Auto-Sync currently holds a different trip ("${remoteParsed.tripName}").\n\nOverwrite Cloud Auto-Sync with your offline changes for "${state.tripName}"?`);
                    if (!shouldOverwrite) {
                        if (statusEl) statusEl.innerHTML = `<span style="color: #d97706; font-weight: 700;">⚠️ Sync paused (Trip mismatch)</span>`;
                        return false;
                    }
                } else if (remoteHash !== localHash && (
                    (state.lastSyncedHash && remoteHash !== state.lastSyncedHash) ||
                    compareVersionMeta(remoteTs, remoteRev, state.localLastModified || 0, state.dataRevision || 0) > 0
                )) {
                    const shouldOverwrite = confirm(`⚠️ Cloud Auto-Sync has a newer version of "${remoteParsed.tripName}".\n\nClick OK to overwrite cloud with your local offline edits, or Cancel to keep the cloud version intact.`);
                    if (!shouldOverwrite) {
                        state.cloudTripNames['auto_trip'] = remoteParsed.tripName;
                        if (state.cloudTripIds) state.cloudTripIds['auto_trip'] = remoteParsed.tripId || "";
                        state.cloudTimestamps['auto_trip'] = remoteTs;
                        if (state.cloudRevisions) state.cloudRevisions['auto_trip'] = remoteRev;
                        if (state.cloudHashes) state.cloudHashes['auto_trip'] = remoteHash;
                        compareVersions();
                        if (statusEl) statusEl.innerHTML = `<span style="color: #d97706; font-weight: 700;">⚠️ Cloud has newer version</span>`;
                        return false;
                    }
                }
            }
        }

        if (!state.tripId) {
            state.tripId = generateTripId();
            saveState(true, true, true);
        }
        const localPayloadObj = buildTripPayload(true);
        const localHash = computeTripContentHash(localPayloadObj);
        const payloadStr = JSON.stringify(localPayloadObj);
        const encryptedData = await encryptData(key, payloadStr);
        const accessHash = await generateAccessHash(key);

        const saveTimeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Offline sync timed out')), 8000)
        );
        const { error } = await Promise.race([
            client.rpc('save_secure_trip', {
                p_id: 'auto_trip',
                p_hash: accessHash,
                p_data: encryptedData
            }),
            saveTimeoutPromise
        ]);

        if (error) throw error;

        setPendingCloudSync(false);
        setUnsyncedLocalData(false);
        setLastSyncedHash(localHash);
        state.cloudTripNames['auto_trip'] = state.tripName;
        if (state.cloudTripIds) state.cloudTripIds['auto_trip'] = state.tripId;
        state.cloudTimestamps['auto_trip'] = state.localLastModified;
        if (state.cloudRevisions) state.cloudRevisions['auto_trip'] = state.dataRevision || 0;
        state.cloudHashes['auto_trip'] = localHash;
        const autoEl = document.getElementById('auto-cloud-name');
        if (autoEl) autoEl.innerText = state.tripName;
        compareVersions();
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
        if (!state.cloudTripNames['manual_trip']) {
            fetchCloudTripNames({ skipPendingSyncCheck: true, force: true });
        }
        saveHistoryToCloud('auto_trip');
        return true;
    } catch (err) {
        console.error("Sync pending offline changes failed:", err);
        setPendingCloudSync(true);
        if (statusEl) {
            statusEl.innerText = "❌ Offline Sync Failed (Will retry)";
            statusEl.style.color = "var(--danger)";
        }
        const UI = await getUI();
        if (UI && typeof UI.showToast === 'function') {
            UI.showToast('❌ Offline sync failed. Changes remain saved locally.', 'delete');
        }
        return false;
    } finally {
        isSyncingOffline = false;
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
    if (state.isOfflineMode) {
        alert("Please switch to Online Mode before changing the Session PIN.");
        return;
    }
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
        const { data, error: fetchErr } = await client.from('trip_sync').select('id, trip_data').in('id', [
            'manual_trip', 'manual_trip_2', 'manual_trip_3', 'auto_trip',
            'manual_trip_history', 'manual_trip_2_history', 'manual_trip_3_history', 'auto_trip_history'
        ]);
        if (fetchErr) throw fetchErr;

        const newAccessHash = await generateAccessHash(newFullKey);
        const oldFullKey = devKey + (state.sessionPin || "");
        const preparedRows = [];

        if (data && data.length > 0) {
            for (const row of data) {
                let parsed = typeof row.trip_data === 'string' ? JSON.parse(row.trip_data) : row.trip_data;
                if (parsed && parsed.ciphertext) {
                    const decrypted = await decryptData(oldFullKey, parsed);
                    if (!decrypted) {
                        throw new Error(`Failed to decrypt cloud slot "${row.id}" with current PIN. Aborting without modifying cloud data.`);
                    }
                    const reEncrypted = await encryptData(newFullKey, decrypted);
                    preparedRows.push({ id: row.id, data: reEncrypted });
                }
            }
        }

        const failedIds = [];
        for (const item of preparedRows) {
            const { error: saveErr } = await client.rpc('save_secure_trip', {
                p_id: item.id,
                p_hash: newAccessHash,
                p_data: item.data
            });
            if (saveErr) {
                failedIds.push(item.id);
            }
        }

        if (failedIds.length > 0) {
            alert(`⚠️ Partial failure updating PIN on slots: ${failedIds.join(', ')}. Some slots may still use the previous PIN.`);
            btn.innerText = "Save New PIN";
            btn.disabled = false;
            return;
        }

        state.sessionPin = newPin;
        localStorage.setItem('tripSplitter_hasPin', newPin ? 'true' : 'false');
        alert("✅ PIN changed and all cloud data successfully re-encrypted.");
        document.getElementById('change-pin-overlay').classList.remove('active');
        updateSyncBtnState();

    } catch (e) {
        console.error("Change PIN error", e);
        alert("❌ Error changing PIN: " + (e.message || "Unknown error"));
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
    if (state.isOfflineMode) {
        alert("Please switch to Online Mode before wiping the cloud database.");
        return;
    }
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
            alert("❌ Failed to delete remote cloud data: " + error.message + "\n\nLocal sync settings were kept intact.");
            btn.innerText = "Delete Everything";
            btn.disabled = false;
            return;
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
        const attempts = (state.pinFailedAttempts || 0) + 1;
        persistPinFailedAttempts(attempts);
        if (attempts >= 5) {
            alert("❌ Incorrect Session PIN entered 5 times.\n\nFor your security, your Cloud Sync configuration has been completely reset.");
            persistPinFailedAttempts(0);
            resetSupabaseConfig(true);
            document.getElementById('cloud-pin-overlay').classList.remove('active');
            if (state.cloudAuthPromiseResolve) state.cloudAuthPromiseResolve(false);
            state.cloudAuthPromiseResolve = null;
            return;
        } else {
            alert(`❌ Incorrect Session PIN.\n\nAttempt ${attempts} of 5. After 5 failed attempts, your sync config will be reset.`); 
            document.getElementById('unlock-session-pin').value = ''; 
            setTimeout(() => document.getElementById('unlock-session-pin').focus(), 100);
            return;
        }
    }

    persistPinFailedAttempts(0);
    state.sessionPin = pin;
    document.getElementById('cloud-pin-overlay').classList.remove('active');
    updateSyncBtnState(); 
    fetchCloudTripNames({ force: true });
    
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
        persistPinFailedAttempts(0);
        setLastSyncedHash("");
        setUnsyncedLocalData(false);
        resetCloudMetadata();
        state.sessionPin = ""; 
        state.supabaseClient = null;
        compareVersions();
        updateSyncBtnState(); 
        fetchCloudTripNames({ force: true }); 
        if (!force) alert("Cloud configuration cleared."); 
    }
}

export function compareVersions() {
    const localHash = computeTripContentHash(buildTripPayload(false));
    const slotMeta = [
        { id: 'auto_trip', btnId: 'cloud-load-auto-btn', defaultText: 'Load Last', label: 'Auto-Sync' },
        { id: 'manual_trip', btnId: 'cloud-load-btn-1', defaultText: 'L', label: 'Manual 1' },
        { id: 'manual_trip_2', btnId: 'cloud-load-btn-2', defaultText: 'L', label: 'Manual 2' },
        { id: 'manual_trip_3', btnId: 'cloud-load-btn-3', defaultText: 'L', label: 'Manual 3' }
    ];

    let bestUpdate = null;

    slotMeta.forEach(({ id, btnId, defaultText, label }) => {
        const btn = typeof document !== 'undefined' ? document.getElementById(btnId) : null;
        const hasUpdate = isSlotUpdateAvailable(id, localHash);
        if (hasUpdate) {
            const ts = state.cloudTimestamps[id] || 0;
            const rev = state.cloudRevisions?.[id] || 0;
            if (!bestUpdate || compareVersionMeta(ts, rev, bestUpdate.ts, bestUpdate.rev) > 0) {
                bestUpdate = { id, label, ts, rev };
            }
        }
        if (!btn) return;
        if (hasUpdate) {
            btn.classList.add('btn-update-available');
            btn.innerHTML = defaultText === 'L' ? '⚠️ Load' : '⚠️ Update Found';
            btn.title = "A newer version of this trip exists in the cloud!";
        } else {
            btn.classList.remove('btn-update-available');
            btn.innerHTML = defaultText;
            btn.title = "";
        }
    });

    const banner = typeof document !== 'undefined' ? document.getElementById('cloud-update-banner') : null;
    if (banner) {
        if (bestUpdate) {
            banner.innerHTML = `<span>🔄 Newer version available in <strong>${bestUpdate.label}</strong></span><button class="small" onclick="loadFromSupabase('${bestUpdate.id}')">Load Update</button>`;
            banner.style.display = 'flex';
        } else {
            banner.innerHTML = '';
            banner.style.display = 'none';
        }
    }
}

export async function fetchCloudTripNames(options = {}) {
    const { skipPendingSyncCheck = false, force = false } = options;
    if (state.isOfflineMode) {
        updateOfflineUI();
        return;
    }
    if (fetchCloudPromise) {
        return fetchCloudPromise;
    }
    if (!force && (Date.now() - lastCloudFetchFinishedAt) < 3000) {
        return;
    }

    fetchCloudPromise = (async () => {
        try {
            if (!skipPendingSyncCheck && state.hasPendingCloudSync) {
                await syncPendingOfflineChanges();
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
                setTimeout(() => reject(new Error('Cloud check timed out')), 10000)
            );

            const { data, error } = await Promise.race([
                client.from('trip_sync').select('id, trip_data').in('id', ['manual_trip', 'manual_trip_2', 'manual_trip_3', 'auto_trip']),
                timeoutPromise
            ]).catch(err => {
                return { data: null, error: err, timedOut: true };
            });
            
            if (error) {
                console.error("Fetch names error:", error);
                const errLabel = error.message === 'Cloud check timed out' ? "Offline" : "Sync Error";
                Object.values(elements).forEach(el => {
                    if (el) el.innerText = errLabel;
                });
                return;
            }

            resetCloudMetadata();
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
                            if (state.cloudTripIds) state.cloudTripIds[row.id] = parsed.tripId || "";
                            state.cloudTimestamps[row.id] = Number(parsed.lastModified) || 0;
                            if (state.cloudRevisions) state.cloudRevisions[row.id] = Number(parsed.dataRevision) || 0;
                            if (state.cloudHashes) {
                                state.cloudHashes[row.id] = (!parsed.tripName.includes("Locked"))
                                    ? computeTripContentHash(parsed)
                                    : "";
                            }
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

            // Safe reconciliation: only auto-push if this device explicitly has unsynced local changes and cloud has not diverged
            const autoName = state.cloudTripNames['auto_trip'];
            const autoLocked = !autoName || autoName === "🔒 Locked (Wrong PIN?)" || autoName === "🔒 Locked";
            const localHash = computeTripContentHash(buildTripPayload(false));
            const cloudAutoHash = state.cloudHashes?.['auto_trip'] || "";
            const sameAutoTrip = isSameTrip(state.cloudTripIds?.['auto_trip'], autoName);
            const cloudUnchangedSinceSync = !state.lastSyncedHash || !cloudAutoHash || cloudAutoHash === state.lastSyncedHash;

            if (!state.isOfflineMode && !isSyncingOffline && !isSilentSaving &&
                (state.hasUnsyncedLocalData || state.hasPendingCloudSync) &&
                !autoLocked && sameAutoTrip && cloudAutoHash !== localHash &&
                cloudUnchangedSinceSync && !isSlotUpdateAvailable('auto_trip', localHash)) {
                console.log("Unsynced local edits detected. Syncing up to the cloud...");
                silentCloudSave();
            }
        } finally {
            lastCloudFetchFinishedAt = Date.now();
            fetchCloudPromise = null;
        }
    })();

    return fetchCloudPromise;
}

export async function saveToSupabase(targetId) {
    if (state.isOfflineMode) {
        if (confirm("Offline Mode is currently active. Switch to Online Mode to save to the cloud?")) {
            await toggleOfflineMode(false);
        } else {
            return;
        }
    }

    if (state.cloudTripNames[targetId] && !state.cloudTripNames[targetId].includes("Locked") && state.cloudTripNames[targetId] !== "Empty" && !isSameTrip(state.cloudTripIds?.[targetId], state.cloudTripNames[targetId])) {
        if (!confirm(`⚠️ Warning: Cloud slot currently holds a different trip ("${state.cloudTripNames[targetId]}").\n\nAre you sure you want to overwrite it with "${state.tripName}"?`)) return;
    }

    const key = await getValidCloudKey(); 
    if (!key) return;
    const client = getSupabaseClient(); 
    if (!client) return;

    if (!state.tripId) {
        state.tripId = generateTripId();
        saveState(true, true, true);
    }
    const payloadObj = buildTripPayload(true);
    const savedHash = computeTripContentHash(payloadObj);
    const payloadStr = JSON.stringify(payloadObj);
    
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
            state.cloudTripNames[targetId] = state.tripName;
            if (state.cloudTripIds) state.cloudTripIds[targetId] = state.tripId;
            state.cloudTimestamps[targetId] = state.localLastModified;
            if (state.cloudRevisions) state.cloudRevisions[targetId] = state.dataRevision || 0;
            if (state.cloudHashes) state.cloudHashes[targetId] = savedHash;
            compareVersions();
            let slotName = targetId === 'manual_trip' ? 'Manual 1' : (targetId === 'manual_trip_2' ? 'Manual 2' : 'Manual 3');
            alert(`✅ Securely encrypted and saved to ${slotName}!`); 
            fetchCloudTripNames({ force: true }); 
            saveHistoryToCloud(targetId);
        }
    } catch (err) { 
        alert("Encryption failed."); 
        console.error(err); 
    }
    if (btn) btn.innerText = "S";
}

export async function silentCloudSave() {
    state.cloudSyncTimeout = null;
    if (state.isOfflineMode || isSilentSaving) return;
    const key = await getValidCloudKey(true); 
    if (!key) return;
    const client = getSupabaseClient(); 
    if (!client) return;
    
    if (!state.tripId) {
        state.tripId = generateTripId();
        saveState(true, true, true);
    }
    const localPayloadObj = buildTripPayload(true);
    const localHash = computeTripContentHash(localPayloadObj);
    const payloadStr = JSON.stringify(localPayloadObj);
    const statusEl = document.getElementById('cloud-status');
    
    isSilentSaving = true;
    try {
        // Pre-upload conflict check on auto_trip to prevent overwriting another device's edits
        const checkTimeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Auto-sync check timed out')), 8000)
        );
        const { data: remoteRow, error: checkError } = await Promise.race([
            client.from('trip_sync').select('trip_data').eq('id', 'auto_trip').maybeSingle(),
            checkTimeoutPromise
        ]).catch(err => ({ data: null, error: err }));

        if (checkError) {
            setPendingCloudSync(true);
            if (statusEl) {
                statusEl.innerText = "⚠️ Offline (Saved Locally)";
                statusEl.style.color = "var(--warning)";
            }
            return;
        }

        if (remoteRow && remoteRow.trip_data) {
            let remoteParsed = typeof remoteRow.trip_data === 'string' ? JSON.parse(remoteRow.trip_data) : remoteRow.trip_data;
            if (remoteParsed && remoteParsed.ciphertext) {
                const decryptedRemote = await decryptData(key, remoteParsed);
                remoteParsed = decryptedRemote ? JSON.parse(decryptedRemote) : null;
            }
            if (remoteParsed && remoteParsed.tripName) {
                const remoteHash = computeTripContentHash(remoteParsed);
                const same = isSameTrip(remoteParsed.tripId || "", remoteParsed.tripName);
                if (!same) {
                    const shouldOverwrite = confirm(`⚠️ Cloud Auto-Sync currently holds a different trip ("${remoteParsed.tripName}").\n\nOverwrite Auto-Sync with "${state.tripName}"?`);
                    if (!shouldOverwrite) {
                        if (statusEl) statusEl.innerHTML = `<span style="color: #d97706; font-weight: 700;">⚠️ Sync paused (Trip mismatch)</span>`;
                        return;
                    }
                } else if (remoteHash !== localHash && state.lastSyncedHash && remoteHash !== state.lastSyncedHash) {
                    const shouldOverwrite = confirm(`⚠️ Another device updated "${remoteParsed.tripName}" in Cloud Auto-Sync since your last sync.\n\nClick OK to overwrite Cloud Auto-Sync with your edits here, or Cancel to keep the cloud version intact.`);
                    if (!shouldOverwrite) {
                        state.cloudTripNames['auto_trip'] = remoteParsed.tripName;
                        if (state.cloudTripIds) state.cloudTripIds['auto_trip'] = remoteParsed.tripId || "";
                        state.cloudTimestamps['auto_trip'] = Number(remoteParsed.lastModified) || 0;
                        if (state.cloudRevisions) state.cloudRevisions['auto_trip'] = Number(remoteParsed.dataRevision) || 0;
                        if (state.cloudHashes) state.cloudHashes['auto_trip'] = remoteHash;
                        compareVersions();
                        if (statusEl) statusEl.innerHTML = `<span style="color: #d97706; font-weight: 700;">⚠️ Newer version in cloud</span>`;
                        return;
                    }
                }
            }
        }

        const encryptedData = await encryptData(key, payloadStr);
        const accessHash = await generateAccessHash(key);
        
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Auto-sync timed out')), 8000)
        );
        const { error } = await Promise.race([
            client.rpc('save_secure_trip', {
                p_id: 'auto_trip',
                p_hash: accessHash,
                p_data: encryptedData
            }),
            timeoutPromise
        ]).catch(err => ({ error: err }));
        
        if (error) { 
            setPendingCloudSync(true);
            if(statusEl) {
                statusEl.innerText = "⚠️ Offline (Saved Locally)";
                statusEl.style.color = "var(--warning)";
            }
        } else { 
            setPendingCloudSync(false);
            setUnsyncedLocalData(false);
            setLastSyncedHash(localHash);
            state.cloudTripNames['auto_trip'] = state.tripName;
            if (state.cloudTripIds) state.cloudTripIds['auto_trip'] = state.tripId;
            state.cloudTimestamps['auto_trip'] = state.localLastModified;
            if (state.cloudRevisions) state.cloudRevisions['auto_trip'] = state.dataRevision || 0;
            state.cloudHashes['auto_trip'] = localHash;
            const autoEl = document.getElementById('auto-cloud-name');
            if (autoEl) autoEl.innerText = state.tripName;
            compareVersions();
            if(statusEl) {
                const now = new Date();
                statusEl.innerHTML = `✅ Secured <span class="tabular-nums">${now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>`;
                statusEl.style.color = "var(--green)";
                setTimeout(() => { statusEl.style.color = "var(--secondary)"; }, 5000);
            }
        }
    } catch (err) { 
        console.error("Silent save encryption failed.", err); 
    } finally {
        isSilentSaving = false;
    }
}

export async function loadFromSupabase(targetId) {
    if (state.isOfflineMode) {
        const msg = state.hasPendingCloudSync
            ? "Offline Mode is active with unsynced local changes. Switch Online and load from cloud? (Your local unsynced changes will be replaced and will NOT overwrite Auto-Sync.)"
            : "Offline Mode is currently active. Switch to Online Mode to load from the cloud?";
        if (confirm(msg)) {
            await toggleOfflineMode(false, { skipPendingSync: true });
        } else {
            return;
        }
    }

    const key = await getValidCloudKey(); 
    if (!key) return;
    const client = getSupabaseClient(); 
    if (!client) return;

    if (state.cloudSyncTimeout) {
        clearTimeout(state.cloudSyncTimeout);
        state.cloudSyncTimeout = null;
    }
    
    let btnId = 'cloud-load-auto-btn';
    if (targetId === 'manual_trip') btnId = 'cloud-load-btn-1';
    if (targetId === 'manual_trip_2') btnId = 'cloud-load-btn-2';
    if (targetId === 'manual_trip_3') btnId = 'cloud-load-btn-3';
    
    const btn = document.getElementById(btnId); 
    if (btn) {
        btn.disabled = true;
        btn.innerText = "⏳ Load...";
    }
    
    try {
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Cloud load timed out')), 8000)
        );
        const { data, error } = await Promise.race([
            client.from('trip_sync').select('trip_data').eq('id', targetId).maybeSingle(),
            timeoutPromise
        ]).catch(err => ({ data: null, error: err }));
        
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
                        fetchCloudTripNames({ force: true }); 
                        return;
                    }
                    parsedData = JSON.parse(decryptedStr);
                }
                
                state.tripId = parsedData.tripId || "";
                state.tripName = parsedData.tripName || "Imported Trip"; 
                state.tripComment = parsedData.tripComment || ""; 
                state.participants = parsedData.participants || []; 
                state.participantGroups = parsedData.participantGroups || {};
                state.expenses = parsedData.expenses || []; 
                state.secondaryCurrency = parsedData.secondaryCurrency || "";
                state.currentExchangeRate = (parsedData.currentExchangeRate !== undefined && parsedData.currentExchangeRate !== null && !isNaN(parsedData.currentExchangeRate))
                    ? Number(parsedData.currentExchangeRate)
                    : (state.secondaryCurrency ? 0 : 1);
                state.currencyRates = (parsedData.currencyRates && typeof parsedData.currencyRates === 'object' && !Array.isArray(parsedData.currencyRates))
                    ? parsedData.currencyRates
                    : {};
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
                state.localLastModified = Number.isFinite(Number(parsedData.lastModified)) ? Number(parsedData.lastModified) : 0;
                state.dataRevision = Number.isFinite(Number(parsedData.dataRevision)) ? Number(parsedData.dataRevision) : 0;
                state.insightFilter = null;
                state.searchText = '';
                state.selectedCalendarDates = new Set();

                repairLegacyData();
                
                const UI = await getUI();
                UI.applyHeaderState();
                state.activeCategoryFilters = new Set(Object.keys(CATEGORIES)); 
                
                // Sync database data back to UI elements
                UI.syncStateToDOM();

                try {
                    const { renderCalendar } = await import('./calendar.js');
                    renderCalendar();
                } catch(e) {}

                const loadedHash = computeTripContentHash(buildTripPayload(false));
                state.cloudTripNames[targetId] = state.tripName;
                if (state.cloudTripIds) state.cloudTripIds[targetId] = state.tripId;
                state.cloudTimestamps[targetId] = state.localLastModified;
                if (state.cloudRevisions) state.cloudRevisions[targetId] = state.dataRevision;
                if (state.cloudHashes) state.cloudHashes[targetId] = loadedHash;

                setPendingCloudSync(false);
                setUnsyncedLocalData(false);
                setLastSyncedHash(loadedHash);
                saveState(true, true, true); 
                updateCurrencySelectors({ selectSecondary: true }); 
                UI.updateUI();  
                UI.cancelEdit();
                compareVersions();
                
                let slotName = "Autosave";
                if(targetId === 'manual_trip') slotName = "Manual 1";
                if(targetId === 'manual_trip_2') slotName = "Manual 2";
                if(targetId === 'manual_trip_3') slotName = "Manual 3";
                alert(`✅ Decrypted and loaded from the ${slotName} slot!`);
                
                import('./history.js').then(H => {
                    H.setCurrentHistorySlot(targetId);
                    H.syncHistoryBaseline();
                });
                loadHistoryFromCloud(targetId);
            } catch(e) { 
                alert("Error parsing cloud data."); 
                console.error(e); 
            }
        } else { 
            alert("No trip data found in this slot."); 
        }
    } finally {
        if (btn) btn.disabled = false;
        compareVersions();
    }
}

function historySlotId(id) {
    return id + '_history';
}

export async function saveHistoryToCloud(slotId = 'auto_trip') {
    if (!state.historyEnabled || state.isOfflineMode) return;
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
    if (!state.historyEnabled || state.isOfflineMode) return;
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
            const baseMime = mimeType.split(';')[0].trim();
            const extMatch = fileName.match(/\.[a-z0-9]+$/i);
            const acceptExts = extMatch ? [extMatch[0].toLowerCase()] : ['.json', '.tsplit'];
            const handle = await window.showSaveFilePicker({
                suggestedName: fileName,
                types: [{ description: baseMime === 'text/html' ? 'HTML Report' : 'Trip File', accept: { [baseMime]: acceptExts } }]
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
    const payload = JSON.stringify(buildTripPayload(true));
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
    
    const payload = JSON.stringify(buildTripPayload(true));
    
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
            if (state.cloudSyncTimeout) {
                clearTimeout(state.cloudSyncTimeout);
                state.cloudSyncTimeout = null;
            }
            state.tripId = parsedData.tripId || "";
            state.tripName = parsedData.tripName || "Imported Trip"; 
            state.tripComment = parsedData.tripComment || ""; 
            state.participants = parsedData.participants || []; 
            state.participantGroups = parsedData.participantGroups || {};
            state.expenses = parsedData.expenses || []; 
            state.secondaryCurrency = parsedData.secondaryCurrency || "";
            state.currentExchangeRate = (parsedData.currentExchangeRate !== undefined && parsedData.currentExchangeRate !== null && !isNaN(parsedData.currentExchangeRate))
                ? Number(parsedData.currentExchangeRate)
                : (state.secondaryCurrency ? 0 : 1);
            state.currencyRates = (parsedData.currencyRates && typeof parsedData.currencyRates === 'object' && !Array.isArray(parsedData.currencyRates))
                ? parsedData.currencyRates
                : {};
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
            state.selectedCalendarDates = new Set();
            state.localLastModified = Number.isFinite(Number(parsedData.lastModified)) ? Number(parsedData.lastModified) : 0;
            state.dataRevision = Number.isFinite(Number(parsedData.dataRevision)) ? Number(parsedData.dataRevision) : 0;
            
            const UI = await getUI();
            UI.applyHeaderState();
            state.activeCategoryFilters = new Set(Object.keys(CATEGORIES)); 
            
            repairLegacyData();
            
            UI.syncStateToDOM();

            try {
                const { renderCalendar } = await import('./calendar.js');
                renderCalendar();
            } catch(e) {}
            
            setLastSyncedHash("");
            setUnsyncedLocalData(false);
            saveState(true, true, true); 
            updateCurrencySelectors({ selectSecondary: true }); 
            UI.updateUI(); 
            UI.cancelEdit();
            compareVersions();
            
            import('./history.js').then(H => {
                H.clearHistory();
                H.syncHistoryBaseline();
            });
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

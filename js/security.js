import { CATEGORIES } from './config.js';

export const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
export const ALLOWED_QUILL_FORMATS = ['header', 'bold', 'italic', 'underline', 'strike', 'color', 'background', 'list', 'link'];
export const MAX_NOTES_LENGTH = 50000;
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

const ALLOWED_SORTS = new Set(['date-desc', 'date-asc', 'amt-desc', 'amt-asc', 'payer-asc']);
const SAFE_COLOR_REGEX = /^(?:#[0-9a-fA-F]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(?:0|1|0?\.\d+)\s*\)|[a-zA-Z]{3,20})$/;

export function escapeHTML(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function isForbiddenKey(key) {
    return typeof key !== 'string' || FORBIDDEN_KEYS.has(key);
}

export function safeHasOwn(obj, key) {
    return Boolean(obj && typeof obj === 'object' && typeof key === 'string' && !FORBIDDEN_KEYS.has(key) && Object.prototype.hasOwnProperty.call(obj, key));
}

export function createNullMap() {
    return Object.create(null);
}

export function generateSecureId() {
    if (typeof crypto !== 'undefined') {
        if (typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
        if (typeof crypto.getRandomValues === 'function') {
            const bytes = new Uint8Array(16);
            crypto.getRandomValues(bytes);
            return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
        }
    }
    return 'id_' + Date.now().toString(36);
}

export function sanitizeFileName(name, fallback = 'Trip') {
    const cleaned = String(name ?? '')
        .replace(/[\x00-\x1f\x7f]/g, '')
        .replace(/[/\\?%*:|"<>]/g, '')
        .trim()
        .replace(/^\.+/, '')
        .replace(/\s+/g, '_')
        .slice(0, 80)
        .replace(/[._]+$/g, '');
    return cleaned || fallback;
}

export function validateHttpsUrl(rawUrl) {
    if (typeof rawUrl !== 'string') return null;
    const trimmed = rawUrl.trim();
    if (!trimmed) return null;
    try {
        const parsed = new URL(trimmed);
        const isLocalDev = parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
        if (parsed.protocol !== 'https:' && !isLocalDev) {
            return null;
        }
        if (!parsed.hostname) return null;
        return parsed.origin + parsed.pathname.replace(/\/$/, '');
    } catch (e) {
        return null;
    }
}

export function sanitizeSafeUrl(rawUrl) {
    if (typeof rawUrl !== 'string') return null;
    const trimmed = rawUrl.trim();
    if (!trimmed || /[\x00-\x1f\x7f]/.test(trimmed)) return null;
    try {
        const parsed = new URL(trimmed);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:') {
            return parsed.href;
        }
        return null;
    } catch (e) {
        return null;
    }
}

export function sanitizeExpenseId(rawId) {
    if (typeof rawId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(rawId) && !isForbiddenKey(rawId)) {
        return rawId;
    }
    return generateSecureId();
}

export function sanitizeDateString(rawDate, fallback = '') {
    if (typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
        return rawDate;
    }
    return fallback;
}

export function sanitizeCurrencyCode(rawCode, allowFX = false) {
    if (typeof rawCode !== 'string') return '';
    const code = rawCode.trim().toUpperCase();
    if (code === '') return '';
    if (code === 'USD') return 'USD';
    if (code === 'FX') return allowFX ? 'FX' : '';
    if (/^[A-Z0-9]{3}$/.test(code) && !isForbiddenKey(code)) return code;
    return '';
}

export function sanitizeTag(rawTag) {
    if (typeof rawTag !== 'string') return '';
    let val = rawTag.trim().toLowerCase();
    if (val.startsWith('#') || val.startsWith('＃')) {
        val = val.substring(1).trim();
    }
    val = val.replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, 40);
    return (!val || isForbiddenKey(val)) ? '' : val;
}

function sanitizeInlineColorStyle(styleStr) {
    if (typeof styleStr !== 'string') return '';
    const safeDecls = [];
    styleStr.split(';').forEach(decl => {
        const idx = decl.indexOf(':');
        if (idx === -1) return;
        const prop = decl.slice(0, idx).trim().toLowerCase();
        const val = decl.slice(idx + 1).trim();
        if ((prop === 'color' || prop === 'background-color') && SAFE_COLOR_REGEX.test(val)) {
            safeDecls.push(`${prop}: ${val}`);
        }
    });
    return safeDecls.join('; ');
}

export function sanitizeQuillHTML(html) {
    if (typeof html !== 'string' || !html) return '';
    let clean = html.replace(/\r?\n|\r/g, '').replace(/>\s+</g, '><');
    while (clean !== '<p><br></p>' && clean.endsWith('<p><br></p>')) {
        clean = clean.slice(0, -11);
    }
    if (clean === '<p><br></p>' || clean === '') return '';

    const purifier = (typeof window !== 'undefined' && window.DOMPurify)
        ? window.DOMPurify
        : (typeof globalThis !== 'undefined' ? globalThis.DOMPurify : null);

    if (purifier && typeof purifier.sanitize === 'function') {
        clean = purifier.sanitize(clean, {
            ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h1', 'h2', 'h3', 'ol', 'ul', 'li', 'a', 'span'],
            ALLOWED_ATTR: ['href', 'style', 'target', 'rel', 'data-list'],
            ALLOW_DATA_ATTR: false,
            ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i
        });
        // Restrict style attributes strictly to safe color / background-color values
        if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
            const tpl = document.createElement('template');
            tpl.innerHTML = clean;
            tpl.content.querySelectorAll('[style]').forEach(el => {
                const safeStyle = sanitizeInlineColorStyle(el.getAttribute('style') || '');
                if (safeStyle) el.setAttribute('style', safeStyle);
                else el.removeAttribute('style');
            });
            tpl.content.querySelectorAll('a[href]').forEach(a => {
                const safeHref = sanitizeSafeUrl(a.getAttribute('href') || '');
                if (safeHref) {
                    a.setAttribute('href', safeHref);
                    a.setAttribute('rel', 'noopener noreferrer');
                } else {
                    a.removeAttribute('href');
                }
            });
            clean = tpl.innerHTML;
        }
        while (clean !== '<p><br></p>' && clean.endsWith('<p><br></p>')) {
            clean = clean.slice(0, -11);
        }
        return clean === '<p><br></p>' ? '' : clean;
    }

    // Fail-safe fallback when DOMPurify is unavailable (e.g. non-DOM tests)
    return escapeHTML(clean.replace(/<[^>]*>/g, ''));
}

export function sanitizeQuillDelta(delta, maxLength = MAX_NOTES_LENGTH) {
    if (!delta || typeof delta !== 'object' || Array.isArray(delta) || !Array.isArray(delta.ops)) {
        return null;
    }
    const cleanOps = [];
    let totalLen = 0;

    for (const op of delta.ops) {
        if (!op || typeof op !== 'object' || typeof op.insert !== 'string') {
            continue;
        }
        if (totalLen >= maxLength) break;

        let text = op.insert;
        if (totalLen + text.length > maxLength) {
            text = text.slice(0, maxLength - totalLen);
        }
        totalLen += text.length;

        const cleanOp = { insert: text };
        if (op.attributes && typeof op.attributes === 'object' && !Array.isArray(op.attributes)) {
            const cleanAttrs = {};
            for (const key of ALLOWED_QUILL_FORMATS) {
                if (!safeHasOwn(op.attributes, key)) continue;
                const val = op.attributes[key];
                if (key === 'bold' || key === 'italic' || key === 'underline' || key === 'strike') {
                    if (val === true) cleanAttrs[key] = true;
                } else if (key === 'header') {
                    if (val === 1 || val === 2 || val === 3) cleanAttrs.header = val;
                } else if (key === 'list') {
                    if (val === 'ordered' || val === 'bullet') cleanAttrs.list = val;
                } else if (key === 'color' || key === 'background') {
                    if (typeof val === 'string' && SAFE_COLOR_REGEX.test(val.trim())) {
                        cleanAttrs[key] = val.trim();
                    }
                } else if (key === 'link') {
                    const safeHref = sanitizeSafeUrl(val);
                    if (safeHref) cleanAttrs.link = safeHref;
                }
            }
            if (Object.keys(cleanAttrs).length > 0) {
                cleanOp.attributes = cleanAttrs;
            }
        }
        cleanOps.push(cleanOp);
    }

    return cleanOps.length > 0 ? { ops: cleanOps } : null;
}

export function validateRatesObject(rawRates, currencyKeysOnly = false) {
    const clean = {};
    if (!rawRates || typeof rawRates !== 'object' || Array.isArray(rawRates)) {
        return clean;
    }
    const keyRegex = currencyKeysOnly ? /^[A-Z0-9]{3}$/ : /^[a-z0-9_-]{2,12}$/i;
    for (const key of Object.keys(rawRates)) {
        if (isForbiddenKey(key) || !keyRegex.test(key)) continue;
        if (currencyKeysOnly && (key === 'USD' || key === 'FX')) continue;
        const val = Number(rawRates[key]);
        if (Number.isFinite(val) && val > 0 && val < 1e12) {
            clean[key] = val;
        }
    }
    return clean;
}

function sanitizeNumericShareMap(rawMap, maxLen = 200) {
    const clean = {};
    if (!rawMap || typeof rawMap !== 'object' || Array.isArray(rawMap)) return clean;
    let count = 0;
    for (const key of Object.keys(rawMap)) {
        if (count >= maxLen) break;
        if (isForbiddenKey(key)) continue;
        const trimmedKey = key.trim().slice(0, 40);
        if (!trimmedKey || isForbiddenKey(trimmedKey)) continue;
        const num = Number(rawMap[key]);
        if (Number.isFinite(num) && num >= 0 && num <= 1e12) {
            clean[trimmedKey] = num;
            count++;
        }
    }
    return clean;
}

export function validateAndSanitizeTripPayload(raw, options = {}) {
    const { defaultTripName = 'My Trip' } = options;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return null;
    }

    const tripId = typeof raw.tripId === 'string'
        ? raw.tripId.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 100)
        : '';

    const rawTripName = typeof raw.tripName === 'string' ? raw.tripName.trim().slice(0, 120) : '';
    const tripName = rawTripName || defaultTripName;
    const tripComment = typeof raw.tripComment === 'string' ? raw.tripComment.slice(0, 500) : '';

    const participants = [];
    const seenParticipants = new Set();
    if (Array.isArray(raw.participants)) {
        for (const p of raw.participants) {
            if (participants.length >= 200) break;
            if (typeof p !== 'string') continue;
            const trimmed = p.trim().slice(0, 40);
            if (!trimmed || isForbiddenKey(trimmed) || seenParticipants.has(trimmed)) continue;
            seenParticipants.add(trimmed);
            participants.push(trimmed);
        }
    }

    const participantGroups = {};
    if (raw.participantGroups && typeof raw.participantGroups === 'object' && !Array.isArray(raw.participantGroups)) {
        let count = 0;
        for (const key of Object.keys(raw.participantGroups)) {
            if (count >= 200) break;
            if (isForbiddenKey(key)) continue;
            const trimmedKey = key.trim().slice(0, 40);
            const rawVal = raw.participantGroups[key];
            if (!trimmedKey || isForbiddenKey(trimmedKey) || typeof rawVal !== 'string') continue;
            const trimmedVal = rawVal.trim().slice(0, 60);
            if (!trimmedVal || isForbiddenKey(trimmedVal)) continue;
            participantGroups[trimmedKey] = trimmedVal;
            count++;
        }
    }

    const expenses = [];
    if (Array.isArray(raw.expenses)) {
        for (const item of raw.expenses) {
            if (expenses.length >= 10000) break;
            if (!item || typeof item !== 'object' || Array.isArray(item)) continue;

            const amtNum = Number(item.amount);
            const amount = (Number.isFinite(amtNum) && amtNum >= 0 && amtNum <= 1e12) ? amtNum : 0;

            let localAmount;
            if (item.localAmount !== undefined && item.localAmount !== null) {
                const lNum = Number(item.localAmount);
                localAmount = (Number.isFinite(lNum) && lNum >= 0 && lNum <= 1e12) ? lNum : amount;
            }

            let exchangeRate;
            if (item.exchangeRate !== undefined && item.exchangeRate !== null) {
                const rNum = Number(item.exchangeRate);
                exchangeRate = (Number.isFinite(rNum) && rNum > 0 && rNum < 1e12) ? rNum : undefined;
            }

            const localCurrency = (typeof item.localCurrency === 'string' && item.localCurrency.trim() !== '')
                ? (sanitizeCurrencyCode(item.localCurrency, true) || 'USD')
                : '';

            const payer = (typeof item.payer === 'string' && !isForbiddenKey(item.payer.trim()))
                ? item.payer.trim().slice(0, 40)
                : '';

            let involved;
            if (Array.isArray(item.involved)) {
                involved = [];
                const seenInv = new Set();
                for (const inv of item.involved) {
                    if (involved.length >= 200) break;
                    if (typeof inv !== 'string') continue;
                    const tInv = inv.trim().slice(0, 40);
                    if (!tInv || isForbiddenKey(tInv) || seenInv.has(tInv)) continue;
                    seenInv.add(tInv);
                    involved.push(tInv);
                }
            }

            const tags = [];
            const seenTags = new Set();
            if (Array.isArray(item.tags)) {
                for (const rawT of item.tags) {
                    if (tags.length >= 50) break;
                    const t = sanitizeTag(rawT);
                    if (t && !seenTags.has(t)) {
                        seenTags.add(t);
                        tags.push(t);
                    }
                }
            }

            const tsNum = Number(item.timestamp);
            const exp = {
                id: sanitizeExpenseId(item.id),
                category: (typeof item.category === 'string' && safeHasOwn(CATEGORIES, item.category)) ? item.category : 'Other',
                desc: typeof item.desc === 'string' ? item.desc.slice(0, 200) : '',
                notes: typeof item.notes === 'string' ? item.notes.slice(0, 1000) : '',
                date: sanitizeDateString(item.date, ''),
                amount,
                localCurrency,
                payer,
                splitType: item.splitType === 'percentage' ? 'percentage' : 'equal',
                personalExpenses: sanitizeNumericShareMap(item.personalExpenses),
                fixedShares: sanitizeNumericShareMap(item.fixedShares),
                percentageShares: sanitizeNumericShareMap(item.percentageShares),
                tags,
                ignored: Boolean(item.ignored)
            };
            if (localAmount !== undefined) exp.localAmount = localAmount;
            if (exchangeRate !== undefined) exp.exchangeRate = exchangeRate;
            if (involved !== undefined) exp.involved = involved;
            if (Number.isFinite(tsNum) && tsNum > 0) exp.timestamp = tsNum;

            expenses.push(exp);
        }
    }

    const secondaryCurrency = sanitizeCurrencyCode(raw.secondaryCurrency, false);
    const rateNum = Number(raw.currentExchangeRate);
    const currentExchangeRate = (Number.isFinite(rateNum) && rateNum >= 0 && rateNum < 1e12)
        ? rateNum
        : (secondaryCurrency ? 0 : 1);

    const currencyRates = validateRatesObject(raw.currencyRates, true);

    const recentCurrencies = [];
    const seenRec = new Set();
    if (Array.isArray(raw.recentCurrencies)) {
        for (const c of raw.recentCurrencies) {
            if (recentCurrencies.length >= 10) break;
            const code = sanitizeCurrencyCode(c, false);
            if (code && code !== 'USD' && !seenRec.has(code)) {
                seenRec.add(code);
                recentCurrencies.push(code);
            }
        }
    }

    const currentSort = (typeof raw.currentSort === 'string' && ALLOWED_SORTS.has(raw.currentSort))
        ? raw.currentSort
        : 'date-desc';

    const parsedDays = parseInt(raw.tripDays, 10);
    const tripDays = (Number.isFinite(parsedDays) && parsedDays >= 1 && parsedDays <= 3650) ? parsedDays : 1;

    const tripNotes = typeof raw.tripNotes === 'string'
        ? sanitizeQuillHTML(raw.tripNotes.slice(0, MAX_NOTES_LENGTH * 4))
        : '';
    const tripNotesDelta = sanitizeQuillDelta(raw.tripNotesDelta, MAX_NOTES_LENGTH);

    let defaultTags = ['car', 'gas', 'flight', 'stay', 'grocery', 'restaurant'];
    if (Array.isArray(raw.defaultTags)) {
        const cleanedTags = [];
        const seenDefault = new Set();
        for (const rawT of raw.defaultTags) {
            if (cleanedTags.length >= 100) break;
            const t = sanitizeTag(rawT);
            if (t && !seenDefault.has(t)) {
                seenDefault.add(t);
                cleanedTags.push(t);
            }
        }
        defaultTags = cleanedTags;
    }

    const lastModified = (Number.isFinite(Number(raw.lastModified)) && Number(raw.lastModified) >= 0)
        ? Number(raw.lastModified)
        : 0;
    const dataRevision = (Number.isFinite(Number(raw.dataRevision)) && Number(raw.dataRevision) >= 0)
        ? Number(raw.dataRevision)
        : 0;

    return {
        tripId,
        tripName,
        tripComment,
        participants,
        participantGroups,
        expenses,
        secondaryCurrency,
        currentExchangeRate,
        currencyRates,
        recentCurrencies,
        currentSort,
        tripDays,
        showPerDay: Boolean(raw.showPerDay),
        tripNotes,
        tripNotesDelta,
        autoColorNotes: Boolean(raw.autoColorNotes),
        isHeaderCollapsed: Boolean(raw.isHeaderCollapsed),
        defaultTags,
        historyEnabled: Boolean(raw.historyEnabled),
        lastModified,
        dataRevision
    };
}

export function validateHistoryStack(rawStack) {
    if (!Array.isArray(rawStack)) return [];
    const clean = [];
    for (const entry of rawStack) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
        const savedAt = Number(entry.savedAt);
        const label = typeof entry.label === 'string' ? entry.label.trim().slice(0, 60) : '';
        const payload = validateAndSanitizeTripPayload(entry.payload);
        if (!Number.isFinite(savedAt) || savedAt <= 0 || !label || !payload) continue;
        clean.push({ savedAt, label, payload });
    }
    return clean.slice(-3);
}

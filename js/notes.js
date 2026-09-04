import { state, saveState } from './state.js';
import { AUTO_COLORS, AUTO_COLOR_VALUES } from './config.js';

export function sanitizeHTML(html) {
    if (!html) return "";
    let clean = html.replace(/\r?\n|\r/g, '').replace(/>\s+</g, '><');
    while (clean !== '<p><br></p>' && clean.endsWith('<p><br></p>')) { 
        clean = clean.slice(0, -11); 
    }
    if (clean === '<p><br></p>') return "";
    return clean;
}

export function copyTripNotes() {
    if (!state.quill) return;
    const text = state.quill.getText();
    navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('copy-notes-btn');
        if (btn) {
            const originalText = btn.innerHTML;
            btn.innerHTML = "✅ Copied!";
            setTimeout(() => { btn.innerHTML = originalText; }, 2000);
        }
    }).catch(err => {
        alert("Failed to copy notes to clipboard.");
        console.error(err);
    });
}

export function openNotesModal() {
    const overlay = document.getElementById('notes-overlay');
    if (overlay) overlay.classList.add('active');
    
    const autoToggle = document.getElementById('auto-color-toggle');
    if (autoToggle) autoToggle.checked = state.autoColorNotes;
    
    if (state.quill) {
        if (state.tripNotesDelta && Object.keys(state.tripNotesDelta).length > 0) {
            state.quill.setContents(state.tripNotesDelta);
        } else {
            const targetHTML = sanitizeHTML(state.tripNotes || "");
            state.quill.setText('');
            if (targetHTML) {
                state.quill.clipboard.dangerouslyPasteHTML(targetHTML);
            }
        }
        state.isNotesDirty = false;
    }
}

export function closeNotesModal() {
    const overlay = document.getElementById('notes-overlay');
    if (overlay) overlay.classList.remove('active');
    
    if (state.quill) {
        clearNotesSearchField(); 
        if (state.isNotesDirty) {
            clearTimeout(state.notesDebounceTimer);
            applyAutoColor();
            state.tripNotes = sanitizeHTML(state.quill.root.innerHTML);
            state.tripNotesDelta = state.quill.getContents();
            saveState();
        }
        state.isNotesDirty = false;
    }
}

export function toggleAutoColor() {
    const autoToggle = document.getElementById('auto-color-toggle');
    state.autoColorNotes = autoToggle ? autoToggle.checked : false;
    saveState(); 
    applyAutoColor();
}

export function clearAutoColors() {
    if (!state.quill) return;
    const contents = state.quill.getContents();
    let currIndex = 0;
    contents.ops.forEach(op => {
        if (typeof op.insert === 'string') {
            if (op.attributes && op.attributes.color && AUTO_COLOR_VALUES.includes(op.attributes.color.toLowerCase())) {
                state.quill.formatText(currIndex, op.insert.length, { color: false, bold: false }, 'silent');
            }
            currIndex += op.insert.length;
        }
    });
}

export function applyAutoColor() {
    if (!state.quill) return;
    const currentSelection = state.quill.getSelection();
    clearAutoColors();
    if (!state.autoColorNotes) {
        if (currentSelection) state.quill.setSelection(currentSelection.index, currentSelection.length, 'silent');
        return; 
    }
    const text = state.quill.getText();
    const formattedIndices = new Set(); 
    const rules = [
        // Currency / Price Range (e.g. $200, $200-300, 200-300$, USD 200)
        { 
            regex: /(?:[$€£]|USD|EUR)[ \t]*\d+(?:,\d{3})*(?:\.\d{2})?(?:\s*[\-\–\—]\s*\d+(?:,\d{3})*(?:\.\d{2})?)?\b|\b\d+(?:,\d{3})*(?:\.\d{2})?\s*[\-\–\—]\s*\d+(?:,\d{3})*(?:\.\d{2})?\s*(?:[$€£]|USD|EUR)\b/gi, 
            color: AUTO_COLORS.currency 
        }, 
        // Date / Date Range (e.g. June 25, Nov 11, Nov 3-11, Tue, Sunday)
        { 
            regex: /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2}\s*[\-\–\—]\s*\d{1,2}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{2,4}(?!\s*:))?\b|\b\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\s*[\-\–\—]\s*\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\b|\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b|\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/gi, 
            color: AUTO_COLORS.date 
        },
        // Time / Time Range (e.g. 10:55 AM) & Durations (e.g. 2:25 h, 1h 30m)
        {
            regex: /\b\d{1,2}:\d{2}\s*h(?:our)?s?(?![a-zA-Z\u00C0-\u017F0-9])|\b\d+(?:\.\d+)?\s*h(?:our)?s?[ \t\u202f\u00a0]*\d+(?:\.\d+)?\s*m(?:in(?:ute)?s?)?(?![a-zA-Z\u00C0-\u017F0-9])|\b\d{1,2}:\d{2}(?:[\s\u202f\u00a0]*[AP]M)?(?:\s*[\-\–\—]\s*\d{1,2}:\d{2}(?:[\s\u202f\u00a0]*[AP]M)?)?\b|\b\d+(?:\.\d+)?\s*h(?:our)?s?(?![a-zA-Z\u00C0-\u017F0-9])|\b\d+(?:\.\d+)?\s*m(?:in(?:ute)?s?)?(?![a-zA-Z\u00C0-\u017F0-9])/gi,
            color: AUTO_COLORS.time
        },
        // Standard Numbers
        { 
            regex: /\b\d+(?:,\d{3})*(?:\.\d+)?\b/g, 
            color: AUTO_COLORS.number 
        } 
    ];
    rules.forEach(rule => {
        let match;
        rule.regex.lastIndex = 0;
        while ((match = rule.regex.exec(text)) !== null) {
            let overlap = false;
            for (let i = match.index; i < match.index + match[0].length; i++) {
                if (formattedIndices.has(i)) { overlap = true; break; }
            }
            if (!overlap) {
                const format = state.quill.getFormat(match.index, match[0].length);
                if (!format.link && (!format.color || AUTO_COLOR_VALUES.includes(format.color.toLowerCase()))) {
                    state.quill.formatText(match.index, match[0].length, { 'color': rule.color, 'bold': true }, 'silent');
                }
                for (let i = match.index; i < match.index + match[0].length; i++) formattedIndices.add(i);
            }
        }
    });
    if (currentSelection) {
        state.quill.setSelection(currentSelection.index, currentSelection.length, 'silent');
        const cursorFormat = state.quill.getFormat(currentSelection.index, 0);
        if (cursorFormat.color && AUTO_COLOR_VALUES.includes(cursorFormat.color.toLowerCase())) {
             state.quill.format('color', false, 'silent'); 
             state.quill.format('bold', false, 'silent');
        }
    }
}

export function searchNotes() {
    const popup = document.getElementById('notes-toc-popup');
    if (popup) popup.style.display = 'none';

    clearSearchHighlights();
    const term = document.getElementById('notes-search').value.trim().toLowerCase();
    const countEl = document.getElementById('notes-search-count');
    const clearBtn = document.getElementById('clear-notes-search-btn');
    
    if (!term) { 
        if (countEl) countEl.innerText = ""; 
        if (clearBtn) clearBtn.style.display = "none"; 
        return; 
    }
    
    if (clearBtn) clearBtn.style.display = "block"; 
    state.activeSearchTerm = term;
    const text = state.quill.getText().toLowerCase();
    let count = 0; 
    let index = text.indexOf(term);
    while (index !== -1) {
        state.quill.formatText(index, term.length, { 'background': '#fef08a' }, 'silent');
        count++; 
        index = text.indexOf(term, index + term.length);
    }
    if (countEl) countEl.innerText = count > 0 ? `${count}` : "0";
}

export function showNotesToC() {
    const popup = document.getElementById('notes-toc-popup');
    const searchInput = document.getElementById('notes-search');
    if (!popup || !searchInput) return;
    
    if (searchInput.value.trim().length > 0) {
        popup.style.display = 'none';
        return;
    }

    const headers = document.querySelectorAll('#quill-editor .ql-editor h2');
    
    if (headers.length === 0) {
        popup.innerHTML = '<div style="padding: 12px; font-size: 0.8rem; color: var(--secondary); text-align: center; font-style: italic;">No H2 headers found.</div>';
    } else {
        let html = '';
        headers.forEach((h2, index) => {
            if (!h2.id) h2.id = 'note-header-' + index;
            const text = h2.innerText || 'Header';
            html += `<div class="toc-item" onclick="jumpToNoteHeader('${h2.id}')" title="${text}">${text}</div>`;
        });
        popup.innerHTML = html;
    }
    popup.style.display = 'block';
}

export function jumpToNoteHeader(id) {
    const targetHeader = document.getElementById(id);
    if (targetHeader) {
        const editorBody = document.querySelector('#quill-editor .ql-editor');
        if (editorBody) {
            editorBody.scrollTo({ top: targetHeader.offsetTop - 10, behavior: 'smooth' });
        }
    }
    
    const popup = document.getElementById('notes-toc-popup');
    if (popup) popup.style.display = 'none';
    
    const searchInput = document.getElementById('notes-search');
    if (searchInput) searchInput.blur();
}

export function clearSearchHighlights() {
    if (!state.activeSearchTerm || !state.quill) return;
    const text = state.quill.getText().toLowerCase();
    let index = text.indexOf(state.activeSearchTerm);
    while (index !== -1) {
        const currentFormat = state.quill.getFormat(index, state.activeSearchTerm.length);
        if (currentFormat.background === '#fef08a') {
            state.quill.formatText(index, state.activeSearchTerm.length, 'background', false, 'silent');
        }
        index = text.indexOf(state.activeSearchTerm, index + state.activeSearchTerm.length);
    }
    state.activeSearchTerm = "";
}

export function clearNotesSearchField() {
    const searchInput = document.getElementById('notes-search'); 
    if (searchInput) searchInput.value = '';
    clearSearchHighlights();
    const clearBtn = document.getElementById('clear-notes-search-btn');
    if (clearBtn) clearBtn.style.display = 'none';
    const countEl = document.getElementById('notes-search-count');
    if (countEl) countEl.innerText = "";
}

export function initNotesEditor() {
    state.quill = new Quill('#quill-editor', {
        theme: 'snow',
        bounds: '.notes-body',
        placeholder: 'Jot down trip ideas, itineraries, packing lists, or links here...',
        modules: {
            history: { delay: 500, maxStack: 100, userOnly: true },
            toolbar: [
                [{ 'header': [1, 2, 3, false] }],
                ['bold', 'italic', 'underline', 'strike'],
                [{ 'color': [] }, { 'background': [] }],
                [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                ['link', 'clean']
            ]
        }
    });

    const Delta = Quill.import('delta');
    state.quill.clipboard.addMatcher('IMG', function(node, delta) { 
        return new Delta(); 
    });
    
    const editor = document.getElementById('quill-editor');
    if (editor) {
        editor.addEventListener('drop', function(e) {
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                e.preventDefault();
                alert("⚠️ Image attachments are disabled to prevent overloading the app's offline storage. Please use text or links only.");
            }
        });
    }

    const MAX_NOTES_LENGTH = 50000;
    state.quill.on('selection-change', function(range, oldRange, source) {
        if (range) state.lastQuillRange = range;
        if (range && source === 'user') {
            const searchInput = document.getElementById('notes-search');
            if (searchInput && searchInput.value) clearNotesSearchField();
        }
    });

    state.quill.on('text-change', function(delta, oldDelta, source) {
        if (state.quill.getLength() > MAX_NOTES_LENGTH) {
            state.quill.deleteText(MAX_NOTES_LENGTH, state.quill.getLength() - MAX_NOTES_LENGTH);
            alert(`⚠️ Character limit reached! To keep the app fast and offline-ready, notes are limited to ${MAX_NOTES_LENGTH} characters.`);
        }
        if (source === 'user') {
            state.isNotesDirty = true;
            clearTimeout(state.notesDebounceTimer);
            state.notesDebounceTimer = setTimeout(() => {
                const currentClean = sanitizeHTML(state.quill.root.innerHTML);
                const savedClean = sanitizeHTML(state.tripNotes);
                if (currentClean !== savedClean || !state.tripNotesDelta) {
                    applyAutoColor(); 
                    state.tripNotes = sanitizeHTML(state.quill.root.innerHTML); 
                    state.tripNotesDelta = state.quill.getContents(); 
                    saveState(); 
                }
            }, 2000);
        }
    });
    
    // Force-save notes if they are dirty when the tab/app goes into background (screen off / lock)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && state.isNotesDirty && state.quill) {
            clearTimeout(state.notesDebounceTimer);
            clearSearchHighlights();
            applyAutoColor();
            state.tripNotes = sanitizeHTML(state.quill.root.innerHTML);
            state.tripNotesDelta = state.quill.getContents();
            saveState();
            state.isNotesDirty = false;
        }
    });

    // Bind document level click listeners for suggestions popups clear
    document.addEventListener('click', function(e) {
        const popup = document.getElementById('notes-toc-popup');
        const searchInput = document.getElementById('notes-search');
        
        if (popup && popup.style.display === 'block') {
            if (searchInput && !searchInput.contains(e.target) && !popup.contains(e.target)) {
                popup.style.display = 'none';
            }
        }
    });
}

// Bind to window for HTML event handlers compatibility
window.openNotesModal = openNotesModal;
window.closeNotesModal = closeNotesModal;
window.copyTripNotes = copyTripNotes;
window.toggleAutoColor = toggleAutoColor;
window.searchNotes = searchNotes;
window.showNotesToC = showNotesToC;
window.jumpToNoteHeader = jumpToNoteHeader;
window.clearNotesSearchField = clearNotesSearchField;

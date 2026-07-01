import { state } from './state.js';

let calcExpr = ""; 
let lastActiveInput = null;

export function initCalculatorFocusTracker() {
    document.addEventListener('focusin', (e) => {
        if ((e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.classList.contains('ql-editor'))) {
            if (!e.target.closest('#mini-calculator') && !e.target.id.startsWith('qc-')) {
                lastActiveInput = e.target;
            }
        }
    });
}

export function toggleCalculator() {
    const calc = document.getElementById('mini-calculator');
    if (calc) {
        calc.style.display = calc.style.display === 'block' ? 'none' : 'block';
    }
}

export function calcInput(val) {
    if (calcExpr === "0" && val !== ".") calcExpr = "";
    if (calcExpr === "Error") calcExpr = "";
    calcExpr += val; 
    const display = document.getElementById('calc-display');
    if (display) display.innerText = calcExpr;
}

export function calcDelete() {
    if (calcExpr === "Error" || calcExpr === "0") { 
        calcClear(); 
        return; 
    }
    calcExpr = calcExpr.toString().slice(0, -1);
    if (calcExpr === "") calcExpr = "0";
    const display = document.getElementById('calc-display');
    if (display) display.innerText = calcExpr;
}

export function calcClear() { 
    calcExpr = ""; 
    const display = document.getElementById('calc-display');
    if (display) display.innerText = "0"; 
}

export function calcSolve() {
    try {
        let safeExpr = calcExpr.replace(/[^-()\d/*+.%]/g, '');
        if(safeExpr === "") return;
        safeExpr = safeExpr.replace(/(\d+(?:\.\d+)?)[\s]*([+-])[\s]*(\d+(?:\.\d+)?)%/g, '$1$2($1*$3/100)');
        safeExpr = safeExpr.replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');
        let result = Function('"use strict";return (' + safeExpr + ')')();
        result = Math.round(result * 100) / 100;
        calcExpr = result.toString();
        const display = document.getElementById('calc-display');
        if (display) display.innerText = calcExpr;
    } catch(e) { 
        const display = document.getElementById('calc-display');
        if (display) display.innerText = "Error"; 
        calcExpr = ""; 
    }
}

export function calcCopy() {
    if (calcExpr && calcExpr !== "Error") {
        navigator.clipboard.writeText(calcExpr).then(async () => {
            const btn = document.getElementById('calc-copy-btn'); 
            if (btn) btn.innerText = "✅ Pasted!";
            
            if (lastActiveInput && !document.body.contains(lastActiveInput)) {
                lastActiveInput = null;
            }
            
            if (lastActiveInput) {
                try {
                    if (lastActiveInput.classList.contains('ql-editor')) {
                        if (state.quill) {
                            const insertIndex = state.lastQuillRange ? state.lastQuillRange.index : state.quill.getLength() - 1;
                            state.quill.insertText(insertIndex, calcExpr, 'user'); 
                            state.quill.setSelection(insertIndex + calcExpr.length);
                        }
                    } else if (lastActiveInput.type === 'number') {
                        lastActiveInput.value = calcExpr;
                    } else {
                        const start = lastActiveInput.selectionStart; 
                        const end = lastActiveInput.selectionEnd;
                        const text = lastActiveInput.value;
                        if (start !== null && end !== null) {
                            lastActiveInput.value = text.slice(0, start) + calcExpr + text.slice(end);
                        } else {
                            lastActiveInput.value += calcExpr;
                        }
                    }
                    lastActiveInput.dispatchEvent(new Event('input', { bubbles: true })); 
                    lastActiveInput.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    if (lastActiveInput.classList.contains('part-personal') || lastActiveInput.classList.contains('part-fixed')) {
                        const UI = await import('./ui.js');
                        UI.calculateRemainingPercentage();
                    }
                } catch(e) { 
                    console.error("Could not paste into input", e); 
                }
            }
            if (btn) {
                setTimeout(() => btn.innerText = "📋 Copy & Paste Result", 1500);
            }
        });
    }
}

export function initCalculatorDraggable() {
    const calc = document.getElementById('mini-calculator');
    const header = document.getElementById('mini-calc-header');
    if (!calc || !header) return;

    let posX = 0, posY = 0, mouseX = 0, mouseY = 0;

    header.addEventListener('mousedown', dragMouseDown);
    header.addEventListener('touchstart', dragTouchStart, { passive: false });

    function dragMouseDown(e) {
        e.preventDefault();
        mouseX = e.clientX;
        mouseY = e.clientY;
        document.addEventListener('mouseup', closeDragElement);
        document.addEventListener('mousemove', elementDrag);
    }

    function dragTouchStart(e) {
        if (e.touches.length !== 1) return;
        mouseX = e.touches[0].clientX;
        mouseY = e.touches[0].clientY;
        document.addEventListener('touchend', closeDragElement);
        document.addEventListener('touchmove', elementTouchDrag, { passive: false });
    }

    function elementDrag(e) {
        e.preventDefault();
        posX = mouseX - e.clientX;
        posY = mouseY - e.clientY;
        mouseX = e.clientX;
        mouseY = e.clientY;

        updatePosition();
    }

    function elementTouchDrag(e) {
        if (e.touches.length !== 1) return;
        e.preventDefault();
        posX = mouseX - e.touches[0].clientX;
        posY = mouseY - e.touches[0].clientY;
        mouseX = e.touches[0].clientX;
        mouseY = e.touches[0].clientY;

        updatePosition();
    }

    function updatePosition() {
        let topVal = calc.offsetTop - posY;
        let leftVal = calc.offsetLeft - posX;

        const calcWidth = calc.offsetWidth;
        const calcHeight = calc.offsetHeight;

        // Constraint boundaries
        topVal = Math.max(0, Math.min(window.innerHeight - calcHeight, topVal));
        leftVal = Math.max(0, Math.min(window.innerWidth - calcWidth, leftVal));

        const isMobile = window.innerWidth < 1024;
        calc.style.top = `${topVal}px`;
        calc.style.bottom = 'auto';

        if (!isMobile) {
            calc.style.left = `${leftVal}px`;
            calc.style.right = 'auto';
            calc.style.transform = 'none';
        } else {
            calc.style.left = '50%';
            calc.style.transform = 'translateX(-50%)';
        }
    }

    function closeDragElement() {
        document.removeEventListener('mouseup', closeDragElement);
        document.removeEventListener('mousemove', elementDrag);
        document.removeEventListener('touchend', closeDragElement);
        document.removeEventListener('touchmove', elementTouchDrag);
    }
}

// Register keyboard event listener for PC mode
document.addEventListener('keydown', (e) => {
    // 1. Check if calculator is visible
    const calc = document.getElementById('mini-calculator');
    if (!calc || calc.style.display !== 'block') return;

    // 2. Check if we are in PC mode (screen width >= 1024)
    if (window.innerWidth < 1024) return;

    // 3. Ignore if user is currently typing in an input field, textarea, or Quill editor
    const activeEl = document.activeElement;
    if (activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        activeEl.isContentEditable || 
        activeEl.closest('.ql-editor') ||
        activeEl.closest('.ql-container')
    )) {
        return;
    }

    // 4. Handle key mappings
    const key = e.key;
    if (/[0-9+\-*/.()%]/.test(key)) {
        e.preventDefault();
        calcInput(key);
    } else if (key === 'Backspace') {
        e.preventDefault();
        calcDelete();
    } else if (key === 'Escape' || key === 'Delete') {
        e.preventDefault();
        calcClear();
    } else if (key === 'Enter' || key === '=') {
        e.preventDefault();
        calcSolve();
    }
});

// Bind to window for HTML event handlers compatibility
window.toggleCalculator = toggleCalculator;
window.calcInput = calcInput;
window.calcDelete = calcDelete;
window.calcClear = calcClear;
window.calcSolve = calcSolve;
window.calcCopy = calcCopy;

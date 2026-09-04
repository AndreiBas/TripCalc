import { state } from './state.js';

let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth(); // 0-11
let lastActiveInput = null;

export function initCalendarFocusTracker() {
    document.addEventListener('focusin', (e) => {
        if ((e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.classList.contains('ql-editor'))) {
            if (!e.target.closest('#mini-calculator') && !e.target.closest('#mini-calendar') && !e.target.id.startsWith('qc-')) {
                lastActiveInput = e.target;
            }
        }
    });
}

export function toggleCalendar() {
    const calc = document.getElementById('mini-calendar');
    if (calc) {
        const isShowing = calc.style.display === 'block';
        calc.style.display = isShowing ? 'none' : 'block';
        if (!isShowing) {
            renderCalendar();
        }
    }
}

export function renderCalendar() {
    const daysGrid = document.getElementById('calendar-days-grid');
    const monthYearLabel = document.getElementById('calendar-month-year');
    if (!daysGrid || !monthYearLabel) return;

    daysGrid.innerHTML = "";

    const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    monthYearLabel.innerText = `${monthNames[currentMonth]} ${currentYear}`;

    // Get first day of the month and total number of days
    let firstDayIndex = new Date(currentYear, currentMonth, 1).getDay(); // 0 = Sunday, 1 = Monday
    // Shift Sunday (0) to index 6, Monday (1) to index 0, etc., to start week on Monday
    firstDayIndex = firstDayIndex === 0 ? 6 : firstDayIndex - 1;

    // Shift Monday-start months to second row to optimize grid distribution
    if (firstDayIndex === 0) {
        firstDayIndex = 7;
    }

    const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();
    const totalDaysOfPrevMonth = new Date(currentYear, currentMonth, 0).getDate();
    const today = new Date();

    // Map active activity dates for rendering dots
    const activityDates = new Set(
        (state.expenses || [])
            .filter(e => !e.ignored && e.date)
            .map(e => e.date)
    );

    // Fixed 6-week layout (42 cells total) to prevent height jumps
    for (let i = 0; i < 42; i++) {
        if (i < firstDayIndex) {
            // Day from previous month
            const prevDay = totalDaysOfPrevMonth - firstDayIndex + i + 1;
            const prevBtn = document.createElement('div');
            prevBtn.style.padding = "2px 0";
            prevBtn.style.fontSize = "0.75rem";
            prevBtn.style.height = "32px";
            prevBtn.style.width = "100%";
            prevBtn.style.display = "flex";
            prevBtn.style.flexDirection = "column";
            prevBtn.style.alignItems = "center";
            prevBtn.style.justifyContent = "center";
            
            const textSpan = document.createElement('span');
            textSpan.innerText = prevDay;
            textSpan.style.lineHeight = "1.1";
            prevBtn.appendChild(textSpan);
            
            // Check if this date is selected
            let prevYear = currentYear;
            let prevMonthIndex = currentMonth - 1;
            if (prevMonthIndex < 0) {
                prevMonthIndex = 11;
                prevYear--;
            }
            const pad = (n) => n.toString().padStart(2, '0');
            const prevDateStr = `${prevYear}-${pad(prevMonthIndex + 1)}-${pad(prevDay)}`;
            const isSelected = state.selectedCalendarDates && state.selectedCalendarDates.has(prevDateStr);

            if (isSelected) {
                prevBtn.style.background = "var(--primary)";
                prevBtn.style.color = "#ffffff";
                prevBtn.style.borderRadius = "4px";
                prevBtn.style.opacity = "0.4";
            } else {
                prevBtn.style.opacity = "0.35";
                prevBtn.style.color = "var(--secondary)";
            }

            // Draw Activity Dot Indicator for previous month day
            if (activityDates.has(prevDateStr)) {
                const dot = document.createElement('span');
                dot.style.width = "4px";
                dot.style.height = "4px";
                dot.style.borderRadius = "50%";
                dot.style.background = isSelected ? "#ffffff" : "var(--primary)";
                dot.style.marginTop = "2px";
                prevBtn.appendChild(dot);
            }

            daysGrid.appendChild(prevBtn);
        } else if (i >= firstDayIndex && i < firstDayIndex + totalDays) {
            // Current month day
            const day = i - firstDayIndex + 1;
            const pad = (n) => n.toString().padStart(2, '0');
            const dateStr = `${currentYear}-${pad(currentMonth + 1)}-${pad(day)}`;

            const dayBtn = document.createElement('button');
            dayBtn.className = "outline small";
            dayBtn.style.padding = "2px 0";
            dayBtn.style.fontSize = "0.75rem";
            dayBtn.style.height = "32px";
            dayBtn.style.width = "100%";
            dayBtn.style.minWidth = "0";
            dayBtn.style.borderRadius = "4px";
            dayBtn.style.border = "1px solid var(--border)";
            dayBtn.style.cursor = "pointer";
            dayBtn.style.display = "flex";
            dayBtn.style.flexDirection = "column";
            dayBtn.style.alignItems = "center";
            dayBtn.style.justifyContent = "center";
            dayBtn.style.position = "relative";

            const textSpan = document.createElement('span');
            textSpan.innerText = day;
            textSpan.style.lineHeight = "1.1";
            dayBtn.appendChild(textSpan);

            // Determine column index to check if it's weekend (Sa/Su are indices 5 & 6)
            const colIndex = i % 7;
            const isWeekend = colIndex === 5 || colIndex === 6;

            // Apply weekend styling
            if (isWeekend) {
                dayBtn.style.color = "#ef4444";
                dayBtn.style.background = "rgba(239, 68, 68, 0.04)";
            } else {
                dayBtn.style.color = "#000000";
                dayBtn.style.background = "rgba(255, 255, 255, 0.6)";
            }

            // Highlight selected state
            const isSelected = state.selectedCalendarDates && state.selectedCalendarDates.has(dateStr);
            if (isSelected) {
                dayBtn.style.background = "var(--primary)";
                dayBtn.style.color = "#ffffff";
                dayBtn.style.borderColor = "var(--primary)";
                dayBtn.style.fontWeight = "700";
            }

            // Highlight today with a distinctive border
            const isToday = today.getDate() === day && today.getMonth() === currentMonth && today.getFullYear() === currentYear;
            if (isToday) {
                dayBtn.style.border = "1.5px solid var(--primary)";
                if (!isSelected) {
                    dayBtn.style.background = "var(--primary-glow)";
                    dayBtn.style.color = "#000000";
                    dayBtn.style.fontWeight = "800";
                }
            }

            // Draw Activity Dot Indicator
            if (activityDates.has(dateStr)) {
                const dot = document.createElement('span');
                dot.style.width = "4px";
                dot.style.height = "4px";
                dot.style.borderRadius = "50%";
                dot.style.background = isSelected ? "#ffffff" : "var(--primary)";
                dot.style.marginTop = "2px";
                dayBtn.appendChild(dot);
            }

            dayBtn.onclick = () => selectCalendarDate(currentYear, currentMonth, day);
            daysGrid.appendChild(dayBtn);
        } else {
            // Day from next month
            const nextDay = i - (firstDayIndex + totalDays) + 1;
            const nextBtn = document.createElement('div');
            nextBtn.style.padding = "2px 0";
            nextBtn.style.fontSize = "0.75rem";
            nextBtn.style.height = "32px";
            nextBtn.style.width = "100%";
            nextBtn.style.display = "flex";
            nextBtn.style.flexDirection = "column";
            nextBtn.style.alignItems = "center";
            nextBtn.style.justifyContent = "center";
            
            const textSpan = document.createElement('span');
            textSpan.innerText = nextDay;
            textSpan.style.lineHeight = "1.1";
            nextBtn.appendChild(textSpan);
            
            // Check if this date is selected
            let nextYear = currentYear;
            let nextMonthIndex = currentMonth + 1;
            if (nextMonthIndex > 11) {
                nextMonthIndex = 0;
                nextYear++;
            }
            const pad = (n) => n.toString().padStart(2, '0');
            const nextDateStr = `${nextYear}-${pad(nextMonthIndex + 1)}-${pad(nextDay)}`;
            const isSelected = state.selectedCalendarDates && state.selectedCalendarDates.has(nextDateStr);

            if (isSelected) {
                nextBtn.style.background = "var(--primary)";
                nextBtn.style.color = "#ffffff";
                nextBtn.style.borderRadius = "4px";
                nextBtn.style.opacity = "0.4";
            } else {
                nextBtn.style.opacity = "0.35";
                nextBtn.style.color = "var(--secondary)";
            }

            // Draw Activity Dot Indicator for next month day
            if (activityDates.has(nextDateStr)) {
                const dot = document.createElement('span');
                dot.style.width = "4px";
                dot.style.height = "4px";
                dot.style.borderRadius = "50%";
                dot.style.background = isSelected ? "#ffffff" : "var(--primary)";
                dot.style.marginTop = "2px";
                nextBtn.appendChild(dot);
            }

            daysGrid.appendChild(nextBtn);
        }
    }
}

export function prevMonth() {
    currentMonth--;
    if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
    }
    renderCalendar();
}

export function nextMonth() {
    currentMonth++;
    if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
    }
    renderCalendar();
}

export function selectCalendarDate(year, month, day) {
    const pad = (n) => n.toString().padStart(2, '0');
    const formattedISO = `${year}-${pad(month + 1)}-${pad(day)}`;
    
    const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    const formattedHuman = `${monthNames[month]} ${day}, ${year}`;

    // Toggle selected state in the Set
    if (!state.selectedCalendarDates) {
        state.selectedCalendarDates = new Set();
    }
    if (state.selectedCalendarDates.has(formattedISO)) {
        state.selectedCalendarDates.delete(formattedISO);
    } else {
        state.selectedCalendarDates.add(formattedISO);
    }
    renderCalendar();

    // Instantly filter the ledger when date selection changes
    import('./ui.js').then(({ updateUI }) => updateUI()).catch(e => console.error(e));
}

export function calendarGoToToday() {
    const today = new Date();
    currentYear = today.getFullYear();
    currentMonth = today.getMonth();
    renderCalendar();
}

export async function calendarFilterLedger() {
    const UI = await import('./ui.js');
    UI.updateUI();
}

export async function calendarClearFilter() {
    if (state.selectedCalendarDates) {
        state.selectedCalendarDates.clear();
    }
    renderCalendar();
    const UI = await import('./ui.js');
    UI.updateUI();
}

export function initCalendarDraggable() {
    const calc = document.getElementById('mini-calendar');
    const header = document.getElementById('mini-calendar-header');
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

// Bind to window for HTML event handlers compatibility
window.toggleCalendar = toggleCalendar;
window.prevMonth = prevMonth;
window.nextMonth = nextMonth;
window.calendarGoToToday = calendarGoToToday;
window.calendarFilterLedger = calendarFilterLedger;
window.calendarClearFilter = calendarClearFilter;

# Implementation Plan — Bug Fixes & Improvements

This plan outlines the changes needed to address the selected bugs and improvements identified in the App Review, incorporating the specific user feedback.

## User Review Required

> [!IMPORTANT]
> - **Removing Date Auto-Paste (B8)**: We will completely remove the date auto-paste feature from the floating calendar. Day clicks will solely control date selection/filtering.
> - **Reducing Notes Auto-Save Debounce (B5)**: We recommend shortening the auto-save debounce timer from 15 seconds (with reset-on-keystroke) to a simple 2-second debounce after typing stops. This ensures notes are saved promptly and minimizes any potential data loss window.

## Proposed Changes

---

### Component: Core Configuration & State

#### [MODIFY] [config.js](file:///z:/Backup/Projects/TripCalc-main/js/config.js)
- **Currency Symbols Expansion (I10)**: Expand the `CURRENCY_SYMBOLS` map to support common travel currencies such as Morocco (`MAD: 'DH'`), Thailand (`THB: '฿'`), Switzerland (`CHF: 'Fr'`), India (`INR: '₹'`), etc.

#### [MODIFY] [state.js](file:///z:/Backup/Projects/TripCalc-main/js/state.js)
- **Zero-Division Safeguard (B2)**: Update `repairLegacyData()` to safely calculate `e.exchangeRate` using a conditional check for `e.amount` to prevent `Infinity` rates.

---

### Component: Currency Logic & Caching

#### [MODIFY] [currency.js](file:///z:/Backup/Projects/TripCalc-main/js/currency.js)
- **Rates Cache (I3)**: Implement an in-memory rates cache (`usdRatesCache`) with a 5-minute Time-To-Live (TTL) that caches the fetched JSON dictionary.
- **Form Fetch Isolation (B3)**: Introduce `fetchRateOnly(targetCurrency, isSilent)` which returns the rate from cache or fetches it online without updating the global `state.currentExchangeRate`.
- **Global Rate Setter**: Refactor `fetchExchangeRate` to wrap `fetchRateOnly` and set `state.currentExchangeRate`.
- **Breakdown Formatting (B4)**: Update `formatMoney(amountInUsd, rateOverride, displayCur)` to support optional rate overrides and display currencies to avoid DOM lookups and handle custom transaction-level exchange rates.

---

### Component: UI Calculations & Escaping

#### [MODIFY] [ui.js](file:///z:/Backup/Projects/TripCalc-main/js/ui.js)
- **Escape HTML Helper (B13/B14/I2)**: Add an `escapeHTML(str)` utility to prevent XSS attacks and format participant names, descriptions, and notes safely before inserting them into `innerHTML`.
- **Stale Date Clearing (B1)**: Clear the value of `exp-date` inside `cancelEdit()`.
- **Form Rate Refresh (B3)**: Refactor `refreshFormRate()` to use `fetchRateOnly()` so that fetching rates for specific expenses does not overwrite the global header currency rate.
- **Breakdown Rate Pinning & Performance (B4)**: 
  - Query `#view-currency` once at the start of `updateUI()` and pass it through to all `formatMoney` calls.
  - Inside the ledger loop, format breakdowns using the expense's own `exchangeRate` if the expense currency matches the active display currency.
- **Complete Reset (I5)**: Update `resetTrip()` to clear both `state.selectedCalendarDates` and `state.insightFilter`.
- **Burn Rate Accuracy (Burn Rate)**: Calculate `burnRate` based only on the count of active participants (involved in at least one non-ignored activity) rather than the entire head count.

---

### Component: Floating Calendar

#### [MODIFY] [calendar.js](file:///z:/Backup/Projects/TripCalc-main/js/calendar.js)
- **Remove Auto-Paste (B8)**: Completely delete focus tracking, `lastActiveInput` references, and the paste logic in `selectCalendarDate()`.
- **Remove Dead Code (I9)**: Delete the unused `calendarCopyToday` function and its window binding.

#### [MODIFY] [app.js](file:///z:/Backup/Projects/TripCalc-main/js/app.js)
- **Remove Focus Tracker call (B8)**: Remove the import and invocation of `initCalendarFocusTracker()`.

---

### Component: Database & Cloud Sync

#### [MODIFY] [db.js](file:///z:/Backup/Projects/TripCalc-main/js/db.js)
- **Preserve Filters on Load (I8)**: Do not overwrite or reset `state.activeCategoryFilters` to default settings inside `loadFromSupabase()` and `importTrip()`.

---

### Component: Notes Modal

#### [MODIFY] [notes.js](file:///z:/Backup/Projects/TripCalc-main/js/notes.js)
- **Reduce Debounce Delay (B5)**: Shorten the editor change debounce delay from 15,000ms to 2,000ms.

---

## Verification Plan

### Automated Verification
- Verify code syntax using `node --check` on all modified JS files.

### Manual Verification
1. **Edit Date Reset**: Edit an expense, click Cancel, verify that the Date input field is reset to blank.
2. **Form Rate Isolation**: Change active header currency to USD. Open Add Activity form, select EUR, click "Fetch Latest". Verify that the global header currency remains USD and does not get updated to EUR.
3. **Calendar Auto-Paste**: Open the calendar, click a date, verify that it does *not* paste anything into the last focused form inputs.
4. **XSS Protection**: Create a participant named `<b>TEST</b>` and an activity with notes `<script>alert(1)</script>`. Verify that they are rendered as safe text literals instead of HTML elements.
5. **Burn Rate**: Verify that the daily burn rate reflects only active participants.
6. **Reset Trip**: Perform a trip reset, verify that active calendar and insight filters are cleared.

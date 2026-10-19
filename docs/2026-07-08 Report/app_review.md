# TripCalc — Comprehensive App Review (v5.6)
_Read-only analysis. No implementation. July 8, 2026._

---

## 1. Architecture Overview

The app is a **single-page PWA** built with vanilla HTML/CSS/ES6 modules. The module graph is:

```
index.html
  └── app.js (boot)
       ├── state.js      (global mutable state + localStorage)
       ├── config.js     (categories, colors, currency symbols)
       ├── currency.js   (FX fetch, formatMoney, quick converters)
       ├── ui.js         (all rendering, form handling, all calculation)
       ├── db.js         (Supabase cloud sync, AES-GCM encryption)
       ├── notes.js      (Quill rich-text editor)
       ├── calendar.js   (floating calendar overlay)
       ├── calculator.js (floating RPN-style calculator)
       └── export.js     (HTML report generation)
```

**Circular dependency pattern**: `db.js` and `export.js` both lazy-import `ui.js` at runtime using `await import('./ui.js')` to avoid circular module loading. This works, but it means those calls are async and could fail silently if the module graph changes.

---

## 2. Bugs Found

### 🔴 Critical Bugs

#### B1 — `exp-date` input field value not reset after `cancelEdit()`
**File**: [ui.js](file:///z:/Backup/Projects/TripCalc-main/js/ui.js) ~L1038  
**Problem**: The `cancelEdit()` function clears most form fields but never resets `document.getElementById('exp-date').value`. After cancelling an edit of an old activity, the date input retains the old activity's date. A new activity saved next will inherit this stale date if the user doesn't notice.

---

#### B2 — `repairLegacyData()` zero-division risk
**File**: [state.js](file:///z:/Backup/Projects/TripCalc-main/js/state.js) L80-82  
```js
if (!e.exchangeRate && e.localCurrency !== 'USD') {
    e.exchangeRate = e.localAmount / e.amount;  // ← RISK: e.amount could be 0
}
```
**Problem**: If an expense was somehow saved with `amount: 0` and a non-USD currency, this produces `Infinity`. All subsequent math on that expense would silently corrupt the totals and balance display.

---

#### B3 — `refreshFormRate()` side-effect overwrites the global exchange rate
**File**: [ui.js](file:///z:/Backup/Projects/TripCalc-main/js/ui.js) ~L541 via [currency.js](file:///z:/Backup/Projects/TripCalc-main/js/currency.js) L11  
**Problem**: `fetchExchangeRate()` always writes its result to `state.currentExchangeRate`. When the user selects a different currency for a specific expense (e.g., `MAD` while the header still shows `EUR`), clicking "🔄 Fetch Latest" in the form silently changes the global `state.currentExchangeRate` from the header's EUR rate to MAD — affecting the Quick Converter display and any subsequent expense that relies on the stored rate, until the user re-fetches in the header.

---

#### B4 — `formatMoney()` reads from the DOM on every call (performance + stale value risk)
**File**: [currency.js](file:///z:/Backup/Projects/TripCalc-main/js/currency.js) L108-117  
```js
export function formatMoney(amountInUsd) {
    const displayCurEl = document.getElementById('view-currency'); // DOM query every call
    ...
    const converted = amountInUsd * state.currentExchangeRate; // ← uses live rate
}
```
**Problem 1 (correctness)**: The settled expense rows in the ledger display their breakdowns in the *current live* exchange rate, not the rate at which the expense was saved. If the EUR rate changes from 1.08 to 1.12 between sessions, all breakdown share amounts displayed for EUR expenses will be recalculated at the new rate. They look correct in USD column (which shows the frozen `e.amount`), but the per-person share lines (computed from USD `finalShare`) convert back using the live rate — an inconsistency.  
**Problem 2 (performance)**: `formatMoney` is called hundreds of times per `updateUI()` cycle (once per expense row, per participant share). A repeated `getElementById` per call is inefficient.

---

#### B5 — `notes.js` auto-save debounce set to 15 seconds
**File**: [notes.js](file:///z:/Backup/Projects/TripCalc-main/js/notes.js) L299  
```js
state.notesDebounceTimer = setTimeout(() => { ... saveState(); }, 15000);
```
**Problem**: The auto-save debounce is 15 seconds. If the user closes the browser or the tab crashes within that window, all typed notes are lost. The `visibilitychange` event fires a forced save — but on mobile, the browser may be killed before this fires.

---

### 🟡 Medium Bugs

#### B6 — `deleteParticipant()` does not clean up `participantGroups`
**File**: [ui.js](file:///z:/Backup/Projects/TripCalc-main/js/ui.js) L228-239  
**Problem**: The function deletes `state.participantGroups[name]` of the participant. However, if other participants share the same group name as their deleted group leader, their `participantGroups[p]` references remain valid strings — but the group balance logic rebuilds the `groupsMap` correctly. **The real issue** is the group template feature: `saveGroupTemplate()` saves both `participants` and `participantGroups`. After a participant is deleted, if the user saves and later `loadGroupTemplate()`, there is no orphan cleanup.

---

#### B7 — `renameParticipant()` misses renaming in `tags` references within notes
**File**: [ui.js](file:///z:/Backup/Projects/TripCalc-main/js/ui.js) L179-216  
**Problem**: `renameParticipant()` correctly updates `e.payer`, `e.involved[]`, `e.personalExpenses`, `e.fixedShares`, and `e.percentageShares`. But if any expense note contains the participant's name as plain text (e.g. `"Alice owes Bob $50"`), or if a tag is named after a participant (e.g. `#alice`), these are never updated. Minor data inconsistency, not a crash.

---

#### B8 — Calendar date paste fires on every click, even when the calendar is being used as a filter
**File**: [calendar.js](file:///z:/Backup/Projects/TripCalc-main/js/calendar.js) L210-241  
**Problem**: `selectCalendarDate()` does two things: (1) toggles the date in the `selectedCalendarDates` Set, and (2) pastes the date into `lastActiveInput`. These responsibilities are mixed. When the user is using the calendar to build a date filter for the ledger, every date click also pastes into whatever form field was last active (e.g. the expense amount field, the search box, a notes field). This is unintended and could corrupt input values.

---

#### B9 — `updateTripDays()` does not validate against 0 or negative typed values
**File**: [ui.js](file:///z:/Backup/Projects/TripCalc-main/js/ui.js) L379-386  
```js
let val = parseInt(document.getElementById('trip-days-input').value);
if (!isNaN(val) && val > 0) { state.tripDays = val; ... }
```
**Problem**: Correctly validates `val > 0`. However, `parseInt` of `"-3"` yields `-3`, which is caught. But `parseInt` of `"1abc"` yields `1`, which passes silently. An empty string or `"0"` is correctly rejected. Minor edge case.

---

#### B10 — `saveState()` does not persist `activeCategoryFilters` or `selectedCalendarDates`
**File**: [state.js](file:///z:/Backup/Projects/TripCalc-main/js/state.js) L89-104  
**Problem**: The serialized payload never includes `activeCategoryFilters`. On every page reload, all categories are reset to "all active." This is arguably correct UX behavior (don't persist filters across sessions), but the same is true for `selectedCalendarDates` — neither is persisted. This is consistent and intentional, but the potential confusion is that insights filters reset on reload but search text does not (because `searchText` is not persisted either, both are in-memory only).

---

#### B11 — Percentage split: `totalEnteredPerc > 100.01` threshold is arbitrary
**File**: [ui.js](file:///z:/Backup/Projects/TripCalc-main/js/ui.js) L816  
```js
if (splitType === 'percentage' && totalPercentageEntered > 100.01) {
```
**Problem**: Uses `100.01` as a floating-point tolerance. If a user enters e.g. `33.34 + 33.33 + 33.33 = 100.00` it works. But if a user enters `100.005` for a single person, it passes the guard and the calculation distributes -0.005% to others (defaultPerc goes negative). The calculation uses `Math.max(0, 100 - totalEnteredPerc)` to prevent negative defaults, so it doesn't crash, but the percentages won't sum to 100% visually.

---

### 🟢 Low-Severity Issues

#### B12 — `Math.random().toString(36).substr(2, 9)` for IDs is not cryptographically unique
**File**: [ui.js](file:///z:/Backup/Projects/TripCalc-main/js/ui.js) L858, L974  
**Problem**: Used for expense `id` generation. With 9 base-36 characters the collision probability is 1 in ~101 billion per generation, which is negligible for personal use, but in theory two rapidly duplicated expenses in the same millisecond could collide (especially since `Math.random` is not seeded uniquely). Could be replaced with `crypto.randomUUID()` for zero collision risk.

---

#### B13 — XSS injection via `e.notes` in ledger HTML string
**File**: [ui.js](file:///z:/Backup/Projects/TripCalc-main/js/ui.js) L1454-1456  
```js
const noteContent = isUrl ? `<a href="${e.notes}" ...>${e.notes}</a>` : `<span ...>${e.notes}</span>`;
```
**Problem**: `e.notes` is inserted into innerHTML without sanitization. If a user types `<img src=x onerror="alert(1)">` in the expense notes field, it will execute as HTML. In a purely local single-user app this is low risk, but after cloud sync, one user could embed a payload visible to another user's session.

---

#### B14 — Similar XSS vector in `e.desc` and participant names in ledger HTML
**File**: [ui.js](file:///z:/Backup/Projects/TripCalc-main/js/ui.js) L1468  
```js
<strong ...>${e.desc}</strong>
```
**Problem**: Same as B13 — `e.desc` is unsanitized HTML. An activity description like `<script>` would be rendered. Modern browsers block inline `<script>` in innerHTML, but event handler attributes (e.g. `<b onclick="...">`) are still executed.

---

## 3. Logic Weaknesses

### L1 — Transfer Category Logic is Fragile
**File**: [ui.js](file:///z:/Backup/Projects/TripCalc-main/js/ui.js) L1270-1315  
The `Transfer` category is handled by *negating the `paid` balance* of involved parties rather than using a first-class credit/debit model. This creates unintuitive behavior when a Transfer is ignored (toggle-ignored still counts toward `totalSpent` check at L1236 — actually that's correct because it's filtered by `e.ignored`). However, **partial Transfers with fixedShares do not correctly cancel out** if only one side of the debt is listed in `involved[]`.

---

### L2 — `formatMoney()` Display Currency Confusion in PDF Export
**File**: [export.js](file:///z:/Backup/Projects/TripCalc-main/js/export.js) L3, 36  
The exported HTML report uses `formatMoney()` which reads the **currently selected view-currency** in the DOM (`view-currency` selector). The report will show values in whatever the user happened to have selected when they hit "Export" — not necessarily USD. This means the report currency is not self-documented. If the user exports while viewing EUR, the report shows EUR, but no label says "all values in EUR."

---

### L3 — Group Balances Panel shows stale data when filters are active
**File**: [ui.js](file:///z:/Backup/Projects/TripCalc-main/js/ui.js) L1759  
**Problem**: The section label reads "Overall Standing (Filtered)" correctly, but `state.currentSettlements` (stored for export) is computed from filtered data. If the user exports the report after having a category filter active (e.g., only "Food"), the settlement instructions in the report will only reflect food expenses — potentially misleading as a final trip settlement.

---

### L4 — `shortName()` truncates to 4 characters causing collisions
**File**: [ui.js](file:///z:/Backup/Projects/TripCalc-main/js/ui.js) L31-34  
```js
return name.length > 4 ? name.substring(0, 4) : name;
```
**Problem**: `ALEXANDER` and `ALICE` both become `ALEX` and `ALIC` — fine. But `MICHAEL` and `MICHA` both become `MICH`. The settlement panel text would read "MICH pays MICH" with no visual distinction. The participant color differentiates them in the standings, but the settlement text "MICH pays MICH $22" is confusing.

---

### L5 — `doesExpenseMatchFilters()` ignores `e.tags` in text search
**File**: [ui.js](file:///z:/Backup/Projects/TripCalc-main/js/ui.js) L148  
```js
const searchableText = `${e.desc} ${e.payer} ${involvedNames} ${e.notes || ''}`.toLowerCase();
```
**Problem**: Tags are searchable via `#hashtag` syntax (separate path through `requiredTags`). But a plain-text search for "museum" will not match an expense tagged `#museum` unless the word also appears in desc, payer, or notes. If a user relies on searching by category keywords that happen to only be tags, results will miss matches.

---

### L6 — `calendarFilterLedger()` is essentially a no-op
**File**: [calendar.js](file:///z:/Backup/Projects/TripCalc-main/js/calendar.js) L256-259  
```js
export async function calendarFilterLedger() {
    const UI = await import('./ui.js');
    UI.updateUI();
}
```
**Problem**: The filter already applies reactively as soon as dates are selected (since `doesExpenseMatchFilters` checks `state.selectedCalendarDates` on every `updateUI()`). The "Filter Ledger" button therefore does nothing useful that isn't already happening — it just triggers a manual UI refresh. The button could be removed or turned into a "Copy Filter to Search" feature.

---

### L7 — Notes auto-save debounce resets on every keystroke
**File**: [notes.js](file:///z:/Backup/Projects/TripCalc-main/js/notes.js) L290  
```js
state.notesDebounceTimer = setTimeout(() => { ... saveState(); }, 15000);
```
**Problem**: The timer is cleared and restarted on each `text-change` event. If the user types continuously for 16 seconds, the auto-save fires. But if the user types a burst for 30 seconds and then stops, the save fires 15 seconds after the last keystroke — a total of 45 seconds since they started typing. Combined with the crash risk noted in B5, this is a real data-loss window.

---

## 4. Improvement Opportunities

### I1 — `updateUI()` is a monolithic 700-line function
**File**: [ui.js](file:///z:/Backup/Projects/TripCalc-main/js/ui.js) L1137-1810  
`updateUI()` handles participant list rendering, expense ledger rendering, category stats calculation, settlement algorithm, insights panels, search state display, and balance rendering — all in one synchronous pass. This works but creates:
- **Performance**: Every search keystroke, every toggle, re-runs all calculations and re-renders all HTML.
- **Maintainability**: Adding a new feature (like the calendar) requires understanding 700 lines of tightly coupled logic.
- **Suggestion**: Split into `calculateTripStats()` (pure computation, returns data object) and `renderUI(stats)` (DOM updates only). Cache `stats` when no data changes.

---

### I2 — No input validation on participant name for special HTML characters
**File**: [ui.js](file:///z:/Backup/Projects/TripCalc-main/js/ui.js) L164-176  
A participant named `<b>ALICE</b>` would be stored and rendered as bold text inside `innerHTML`. Coupled with B14, participant names need `textContent` assignment or an escape helper.

---

### I3 — `fetchExchangeRate()` has no caching / rate limiting
**File**: [currency.js](file:///z:/Backup/Projects/TripCalc-main/js/currency.js) L4-21  
Every call to `fetchExchangeRate()` makes a live network request to `cdn.jsdelivr.net`. The same currency could be fetched multiple times in a session. Adding a simple in-memory cache with a 5-minute TTL would reduce network requests and improve offline resilience.

---

### I4 — Cloud sync: only 4 hardcoded trip slots
**File**: [db.js](file:///z:/Backup/Projects/TripCalc-main/js/db.js) L164, L290  
The cloud stores trip data in exactly four fixed row IDs: `manual_trip`, `manual_trip_2`, `manual_trip_3`, `auto_trip`. This hard limit means the user cannot archive old trips to the cloud without overwriting a slot. A dynamic row naming scheme (UUID or date-based) would allow unlimited trip history.

---

### I5 — `resetTrip()` leaves `selectedCalendarDates` and `insightFilter` populated
**File**: [ui.js](file:///z:/Backup/Projects/TripCalc-main/js/ui.js) L277-323  
`resetTrip()` does not clear `state.selectedCalendarDates` or `state.insightFilter`. After a reset, if the user had calendar dates selected, the new trip's empty ledger would immediately show "No activities match the current filters" with a confusing "Date Filter Active (N days)" label in the search box.

---

### I6 — `exp-notes` field in the Add Activity form is a plain `<textarea>`
**File**: [index.html](file:///z:/Backup/Projects/TripCalc-main/index.html)  
The expense-level notes are a plain `<textarea>`, while the main Trip Notes uses a full Quill editor. This is a conscious design choice (lightweight), but it means users cannot format links or apply any markup in per-expense notes. URLs are detected and rendered as links in the ledger display (L1454), which is a nice touch.

---

### I7 — No undo/redo for expense deletion
Deleting an expense uses `confirm()` and then permanently removes the entry. There is no undo. Given that the cloud sync has a 1.5-second debounce before saving, a user who accidentally deletes an expense and immediately wishes to undo must rely on the browser refresh (which loads the last localStorage snapshot — also deleted since `saveState()` is called synchronously on delete). A short "Undo" toast with a 5-second window would significantly improve resilience.

---

### I8 — Category filter state is lost on cloud pull
**File**: [db.js](file:///z:/Backup/Projects/TripCalc-main/js/db.js)  
When cloud data is pulled and applied to state, `repairLegacyData()` is called, but `state.activeCategoryFilters` is never reset to "all active." If the user has some categories filtered out and then pulls new cloud data, they may see confusing filtered results without knowing filters are active.

---

### I9 — `calendarCopyToday()` is bound to `window` but never called from the UI
**File**: [calendar.js](file:///z:/Backup/Projects/TripCalc-main/js/calendar.js) L244-247, L354  
`calendarCopyToday` is exported and bound to `window`, but no button in `index.html` calls it. It appears to be a dead function (leftover from an earlier Today button design that was replaced by `calendarGoToToday`).

---

### I10 — The `CURRENCY_SYMBOLS` map is very limited
**File**: [config.js](file:///z:/Backup/Projects/TripCalc-main/js/config.js) L35  
```js
export const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', GBP: '£', CAD: 'C$', AUD: 'A$', JPY: '¥', MXN: 'M$' };
```
Only 7 currencies have symbols. MAD, THB, SGD, CHF, INR, etc., all fall back to the currency code prefix (e.g., `MAD 150.00`). This is handled gracefully in the code via the fallback, but adding more common travel currencies would improve legibility.

---

## 5. Calculation Logic Verification

### ✅ Equal Split (basic)
**Logic**: `sharedAmount = amount - fixedShares_total - personalExtras_total`, divided equally among `unfixedCount` participants. Each unfixed participant gets `baseShare + personal_extra`.  
**Assessment**: Correct. Edge case: if all participants have fixed shares, `unfixedCount = 0` and `baseShare = 0`. Remaining unallocated amount (if total fixedShares < total amount) is silently absorbed. This is technically a loss of precision but validated by the `totalFixed + totalPersonal <= localAmount` guard at L812.

### ✅ Percentage Split
**Logic**: Any participant without an explicit percentage gets `defaultPerc = (100 - sumExplicit) / unenteredCount`.  
**Assessment**: Correct. The `Math.max(0, ...)` guard prevents negative defaults. However, see B11 — the threshold `100.01` should be `100 + epsilon` computed from the number of participants to be truly floating-point safe.

### ✅ Settlement Algorithm (Greedy Creditor-Debtor)
**Logic**: Standard greedy matching — sort debtors and creditors descending, pair them off.  
**Assessment**: Correct and optimal (minimizes number of transactions). No bugs found.

### ✅ Transfer Category Handling
**Logic**: Transfers subtract from the payer's `owed` total (via negative share assignment to involved).  
**Assessment**: The logic is mathematically correct for a 2-person transfer. For multi-person transfers (e.g. one person repaying 3 others proportionally), the percentage split type should be used — and the UI correctly allows it. This is fine but not obviously documented.

### ⚠️ Burn Rate Calculation
**File**: [ui.js](file:///z:/Backup/Projects/TripCalc-main/js/ui.js) L1519  
```js
const burnRate = totalSpent / state.tripDays / state.participants.length;
```
**Issue**: `burnRate` uses the count of all registered participants — including those who are involved in no activities (e.g., a participant added but then all their expenses deleted). A more accurate burn rate would use `Object.keys(groupStats).length` (active payers) or participants involved in at least one expense. Using total headcount inflates the denominator and understates the per-person daily spend.

---

## 6. Summary Table

| # | Severity | Category | Description |
|---|----------|----------|-------------|
| B1 | 🔴 High | Bug | Date field not cleared on `cancelEdit()` |
| B2 | 🔴 High | Bug | Zero-division in `repairLegacyData()` |
| B3 | 🔴 High | Bug | `refreshFormRate()` corrupts global exchange rate |
| B4 | 🟡 Med | Bug | `formatMoney()` uses live rate for frozen expense breakdowns |
| B5 | 🟡 Med | Bug | 15-second notes debounce creates data loss window |
| B6 | 🟡 Med | Bug | `deleteParticipant()` doesn't clean up group templates |
| B7 | 🟢 Low | Bug | Participant rename misses notes/tags content |
| B8 | 🟡 Med | Bug | Calendar click always pastes date into last input |
| B9 | 🟢 Low | Bug | `parseInt("1abc")` bypasses validation |
| B10 | 🟢 Low | Note | Category filters/calendar dates not persisted (by design) |
| B11 | 🟢 Low | Bug | Percentage threshold `100.01` not float-safe |
| B12 | 🟢 Low | Quality | `Math.random()` IDs not cryptographically unique |
| B13 | 🟡 Med | Security | XSS via unsanitized `e.notes` in innerHTML |
| B14 | 🟡 Med | Security | XSS via unsanitized `e.desc` and participant names in innerHTML |
| L1 | 🟡 Med | Logic | Transfer category handling is fragile for partial debts |
| L2 | 🟡 Med | Logic | Export report currency is not labeled |
| L3 | 🟡 Med | Logic | `currentSettlements` reflects filtered data in export |
| L4 | 🟢 Low | Logic | 4-char name truncation can cause visual collisions |
| L5 | 🟢 Low | Logic | Plain-text search doesn't scan tag strings |
| L6 | 🟢 Low | Logic | "Filter Ledger" button is a no-op |
| L7 | 🟡 Med | Logic | Notes debounce resets on every keystroke |
| I1 | — | Improvement | `updateUI()` is monolithic (700 lines) |
| I2 | — | Improvement | No HTML escaping on participant names |
| I3 | — | Improvement | No FX rate caching between calls |
| I4 | — | Improvement | Only 4 hardcoded cloud trip slots |
| I5 | — | Improvement | `resetTrip()` leaves calendar/insight filters active |
| I6 | — | Improvement | Per-expense notes are plain text only |
| I7 | — | Improvement | No undo for expense deletion |
| I8 | — | Improvement | Category filters not reset on cloud pull |
| I9 | — | Improvement | `calendarCopyToday()` is dead code |
| I10 | — | Improvement | Currency symbols table only covers 7 currencies |
| Calc | ⚠️ | Calculation | Burn rate uses total participant count, not active count |

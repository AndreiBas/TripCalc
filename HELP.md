# 🧮 TripCalc Complete Help Guide & Documentation

Welcome to **TripCalc**, a modern, offline-first, client-side encrypted travel expense splitter and calculator. Below is a comprehensive guide covering every feature, setting, and mathematical formula used in the application.

---

## 🚀 60-Second Quick Start Guide
Follow these five steps to start tracking a new trip:
1. **Name Your Trip:** Click the default title `"My Trip"` in the header and type your custom trip name.
2. **Add Participants:** Expand **Participants and settings**, type a name, and click **Add Person**.
3. **Form Groups:** Click the `👥` icon on participant badges to group them (e.g. `Smith Family`). Their individual balances will combine.
4. **Log Expenses:** In the **➕ Add Activity** card, select a date, choose a category, enter the check description, amount, who paid, and select who was involved. Click **Save Activity**.
5. **Settle Up:** Look at the **Final Settlement** section at the bottom. It shows the optimized transfers needed to clear all debts. Click **📄 Export HTML** to save a beautiful, print-ready summary report.

---

## ➕ Adding and Splitting Expenses
TripCalc supports advanced calculations to fit any real-world splitting scenario:

### 1. Equal Split
Splits the total bill evenly among all checked participants.
* **Extras (+ Extra $):** If you went to a restaurant and someone ordered an expensive dish just for themselves, you can enter that amount in their **+ Extra $** field. 
  * *Formula:* The extra amount is subtracted from the total, the remaining balance is split equally among everyone, and the extra is added back to that specific person's share.
  * *Example:* A bill is $100 for Alice, Bob, and Charlie. Charlie has a $10 extra. 
    * Remaining to split equally: $90 ($30 each).
    * Alice owes: $30.
    * Bob owes: $30.
    * Charlie owes: $30 + $10 = $40.

* **Exact Share ($):** If a participant has a pre-determined fixed share, enter it in their **Exact Share $** field.
  * *Formula:* The exact share is subtracted from the total, and the remaining amount is split equally among the *other* checked participants.
  * *Example:* A bill is $100 for Alice, Bob, and Charlie. Bob consumed exactly $20 worth.
    * Remaining to split equally between Alice and Charlie: $80 ($40 each).
    * Alice owes: $40.
    * Bob owes: $20.
    * Charlie owes: $40.

### 2. Percentage Split
Splits the total bill based on specific percentage weights.
* Use this for shared rooms, unequal car rentals, or family size weightings.
* Enter a percentage for each checked participant. The system requires the total sum of percentages to equal exactly **100%** before saving.

### 3. Search Tags
* Add hashtags (e.g. `#dinner #taxi`) inside the tag field when logging an activity. You can filter the ledger list by searching these tags.

---

## 👥 Participants, Groups, and Memory

### 1. Grouping and Families
If you are traveling with couples or families and want to see their shared standings:
* Click the `👥` icon on a participant's badge.
* Enter a group name (e.g. `Smith Family` or `Room A`).
* **Symmetry:** All members of the same group/family will be color-coded with the same group color in settings, standings, and analytics borders.

### 2. Setup Memory (Save / Load Setup)
If you frequently travel with the same group of friends or family members:
* Expand the **Participants and settings** dropdown.
* Click **Save Setup Memory** to save the active list of participants and their group allocations in your browser's persistent storage.
* On your next trip, simply click **Load Setup Memory** to instantly load everyone back into the app!

---

## 📜 Activity Ledger & Smart Filters
Navigate, sorting, and isolating your transactions:
* **Collapsible Ledger**: Click the arrow triangle `▼` to collapse/expand the ledger list.
* **Sorting**: Sort activities by Date, Amount, Description, or Category in ascending or descending order.
* **Ignore / Include All**: Tap the dynamic **🚫 All** or **✅ All** button next to the ledger header to toggle all expenses on/off instantly from calculations.
* **Click-to-Filter Insights**:
  * Click on a **Category Icon** (e.g. 🍔 Food) in the Category Breakdown table to instantly filter the ledger to show only food items.
  - Click on a **Name** in the Standings table to show only activities paid by or involving that person.
  - Click the **"All"** category filter item or refresh the page to clear filters.

---

## 📝 Smart Trip Notes
Jot down travel details, checklists, and itineraries inside the Notes overlay editor:
* **🔍 Live Search**: Search text inside notes with instant highlighting of matching terms.
* **📖 Table of Contents**: Format sections using **Heading 2 (H2)**. A Table of Contents dynamically displays in the search bar to jump to sections instantly.
* **🎨 Auto-Color Highlight**: If enabled, the editor auto-colors date strings, currency symbols, and numbers in the editor for quick scanning.
* **Reliable Auto-Save & Sync**: Edits auto-save to browser storage every 15 seconds during typing, and trigger **instant local save and cloud sync** when closing the modal, locking your phone, or turning off the screen.

---

## 💱 Multi-Currency & Quick Converter
If you travel internationally, you can track expenses in local currencies:
1. **Set Local Currency:** In the header toolbar, enter a 3-letter currency code (e.g. `EUR`, `JPY`, `CAD`) in the **Cur:** field.
2. **Fetch Exchange Rate:** The app will fetch the latest live conversion rate against USD. You can manually adjust the rate or refresh it with **Fetch Latest Rate**.
3. **Log in FX:** In the Activity card, change the currency dropdown from `USD` to your local currency. You can type the amount in local currency; the app automatically calculates and displays the converted USD equivalent in all ledgers and standings.
4. **Quick Converter:** Use the `USD ⇌ FX` input fields inside the header toolbar to perform instant calculations without changing your form data.

---

## ☁️ Supabase Cloud Sync & Security
TripCalc features high-level **client-side encryption** (AES-256) to synchronize your data securely to the cloud:
1. Click **Sync** in the header.
2. Enter your Supabase URL, Anon Key, and a custom **Session PIN/Password**.
3. **Security Model:** Your trip data is encrypted *locally inside your browser* using your PIN before upload. The Supabase database stores only ciphertext. No one (not even the database administrators) can read your data without your PIN.
4. **Auto-Sync:** Toggle this option ON to automatically push local updates to the cloud slots in real-time.
5. **Slots:** Use **S** (Save) and **L** (Load) on Slots 1, 2, or 3 to manage different trips or manual states.
6. **Offline Reconciliation**: If you edit offline, changes save locally. When your connection returns (e.g. WiFi turns on or you regain cell reception), the app detects the local edits and pushes them to the cloud automatically.

---

## 📂 File Export & Import (Offline Backups)
To save copies of your trips directly to your device:
* **Save:** Exports a standard `.json` file containing the readable database of your trip.
* **🔐 Secure Save:** Exports an encrypted `.json` file. You will be prompted to enter a password PIN. The exported file cannot be imported or read without typing that correct password.
* **Load:** Select any standard or secure JSON file to restore the entire trip state.
* **📄 Export HTML**: Downloads a print-ready standalone HTML report containing standings, category distributions, settlements, and nested group details.

---

## 💸 Final Settlement Optimization
The settlement list uses an optimization algorithm to simplify payments:
* It calculates the net balance (Paid minus Owed) for each participant or group.
* It matches the largest debtors (who owe money) with the largest creditors (who are owed money).
* By routing transactions directly, it settles all debts with the **minimum number of total transactions**, eliminating unnecessary intermediary transfers.

---

## 📊 Trip Analytics
* **Overview stats:** Total spent, average per activity, splurge of the trip, and trip banker.
* **Individual/Group Cards:** Displays the total paid, owed, and net balance for each member.
* **Per Day Calculation:** Toggle **Per Day** and enter the number of days of your trip to see your daily averages!

## 📅 Floating Calendar
Open the draggable calendar overlay by clicking the 📅 button next to the Activity Ledger header or within the Trip Notes modal:
* **Month Navigation**: Use the ◀ and ▶ buttons to navigate months.
* **Click-to-Paste**: Click any day to insert that date (formatted as `YYYY-MM-DD` for form fields, or `Month Day, Year` for notes) into your active cursor/input location.
* **Paste Today**: Click the bottom button to quickly copy/paste today's date.

---

## ⌨️ PC Calculator Shortcuts
When the calculator overlay is active on desktop screens, you can use your keyboard directly:
* `0`-`9`, `+`, `-`, `*`, `/`, `.`, `%`, `(`, `)` to enter expressions.
* `Backspace` to delete a digit.
* `Escape` or `Delete` to clear.
* `Enter` or `=` to calculate the result.
* *(Keyboard captures are ignored when typing inside text boxes or the notes editor).*

# 🧮 TripCalc Complete Help Guide & Documentation

Welcome to **TripCalc**, a modern, offline-first, client-side encrypted travel expense splitter and calculator. Below is a comprehensive guide covering every feature, setting, and mathematical formula used in the application.

---

## 🚀 Quick Start Guide
Follow these four steps to start tracking a new trip:
1. **Name Your Trip:** Click the default title `"My Trip"` in the header and type your custom trip name.
2. **Add Participants:** Expand **Participants and settings**, type a name, and click **Add Person**.
3. **Log Expenses:** In the **➕ Add Activity** card, select a date, choose a category, enter the check description, amount, who paid, and select who was involved. Click **Save Activity**.
4. **Settle Up:** Look at the **Final Settlement** section at the bottom. It shows the optimized transfers needed to clear all debts.

---

## ➕ Adding and Splitting Expenses
TripCalc supports advanced calculations to fit any real-world splitting scenario:

### 1. Equal Split
Splits the total bill evenly among all checked participants.
* **Extras (+ Extra $):** If you went to a restaurant and someone ordered a expensive dish just for themselves, you can enter that amount in their **+ Extra $** field. 
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

---

## 👥 Participants, Groups, and Memory

### 1. Grouping and Families
If you are traveling with couples or families and want to see their shared standings:
* Click the `👤 Edit Group` button on a participant's badge.
* Enter a group name (e.g. `Green Family` or `Group A`).
* **Symmetry:** All members of the same group/family will be color-coded with the same group color in the Participant settings, standings, and analytics card borders.

### 2. Setup Memory (Save / Load Setup)
If you frequently travel with the same group of friends or family members:
* Expand the **Participants and settings** dropdown.
* Click **Save Setup Memory** to save the active list of participants and their group allocations in your browser's persistent storage.
* On your next trip, simply click **Load Setup Memory** to instantly load everyone back into the app!

---

## 💱 Multi-Currency & Quick Converter
If you travel internationally, you can track expenses in local currencies:
1. **Set Local Currency:** In the header toolbar, enter a 3-letter currency code (e.g. `EUR`, `CZK`, `CAD`) in the **Cur:** field.
2. **Fetch Exchange Rate:** The app will fetch the latest live conversion rate against USD. You can manually adjust the rate or refresh it with **Fetch Latest Rate**.
3. **Log in FX:** In the Activity card, change the currency dropdown from `USD` to your local currency. You can type the amount in local currency; the app automatically calculates and displays the converted USD equivalent in all ledgers and standings.
4. **Quick Converter:** Use the `USD ⇌ FX` input fields inside the header toolbar to perform instant calculations without changing your form data.

---

## ☁️ Supabase Cloud Sync & Security
TripCalc features high-level **client-side encryption** (AES-256) to synchronize your data securely to the cloud:

1. Click **Sync** in the header.
2. Enter your Supabase URL, Anon Key, and a custom **Security PIN/Password**.
3. **Security Model:** Your trip data is encrypted *locally inside your browser* using your PIN before upload. The Supabase database stores only ciphertext. No one (not even the database administrators) can read your data without your PIN.
4. **Auto-Sync:** Toggle this option ON to automatically push local updates to the cloud slots in real-time.
5. **Slots:** Use **S** (Save) and **L** (Load) on Slots 1, 2, or 3 to manage different trips or manual states.

---

## 📂 File Export & Import (Offline Backups)
To save copies of your trips directly to your hard drive:
* **Save:** Exports a standard `.json` file containing the readable database of your trip.
* **🔐 Secure Save:** Exports an encrypted `.json` file. You will be prompted to enter a password PIN. The exported file cannot be imported or read without typing that correct password.
* **Load:** Select any standard or secure JSON file to restore the entire trip state.

---

## 💸 Final Settlement Optimization
The settlement list uses an optimization algorithm to simplify payments:
* It calculates the net balance (Paid minus Owed) for each participant or group.
* It matches the largest debtors (who owe money) with the largest creditors (who are owed money).
* By routing transactions directly, it settles all debts with the **minimum number of total transactions**, eliminating unnecessary intermediary transfers.

---

## 📊 Trip Analytics
* **Overview stats:** Total spent, average per activity, and top spending category.
* **Individual/Group Cards:** Displays the total paid and owed for each member. Hover or tap the initials list to see exactly who is included.
* **Per Day Calculation:** Toggle **Per Day** and enter the number of days of your trip to see your daily averages!

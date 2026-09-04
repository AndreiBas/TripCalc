import { state } from './state.js';
import { CATEGORIES } from './config.js';
import { formatMoney } from './currency.js';

// Import UI utilities dynamically to avoid load-time circular dependencies
let uiModule = null;
async function getUI() {
    if (!uiModule) {
        uiModule = await import('./ui.js');
    }
    return uiModule;
}

export async function exportHTMLReport() {
    const UI = await getUI();
    const btn = document.getElementById('export-html-btn');
    if (!btn) return;
    
    const originalText = btn.innerHTML; 
    btn.innerHTML = "⏳ Generating..."; 
    btn.disabled = true;

    try {
        let categoryBreakdownRows = '';
        if (state.currentStats && state.currentStats.validActiveCount > 0) {
            Object.keys(state.currentStats.categoryTotals).forEach(cat => {
                if (cat !== 'Transfer' && state.currentStats.categoryTotals[cat] > 0) {
                    const total = state.currentStats.categoryTotals[cat]; 
                    const acts = state.currentStats.categoryActivityCounts[cat]; 
                    const avgPerPerson = total / state.currentStats.categoryParticipations[cat];
                    categoryBreakdownRows += `
                    <tr>
                        <td><span class="cat-icon">${CATEGORIES[cat]?.icon || '📝'}</span> ${UI.escapeHTML(cat)}</td>
                        <td style="text-align: center;">${acts}</td>
                        <td style="text-align: right; font-weight: 700;">${formatMoney(total)}</td>
                        <td style="text-align: right;">${formatMoney(avgPerPerson)}</td>
                    </tr>`;
                }
            });
        }

        let groupStandingRows = '';
        if (state.currentStats && state.currentStats.validActiveCount > 0) {
            Object.keys(state.currentStats.groupStats).forEach(gName => {
                const stats = state.currentStats.groupStats[gName];
                if (stats.owed === 0 && stats.paid === 0) return;
                const diff = stats.paid - stats.owed;
                const diffClass = diff > 0.01 ? 'owed' : (diff < -0.01 ? 'owes' : 'settled');
                const diffText = diff > 0.01 ? `+${formatMoney(diff)}` : (diff < -0.01 ? `-${formatMoney(Math.abs(diff))}` : '$0.00');
                
                const isGroup = stats.members.length > 1 || stats.members[0] !== gName;
                const gColor = isGroup ? UI.getGroupColor(gName) : UI.getColor(stats.members[0]);
                const badgeHtml = isGroup ? `<span class="badge" style="background: ${gColor}15; color: ${gColor}; border: 1px solid ${gColor}30;">Group</span>` : '';

                // Group/Person Row
                groupStandingRows += `
                <tr class="group-row">
                    <td>
                        <strong style="color: ${gColor};">${UI.escapeHTML(UI.shortName(gName))}</strong>
                        ${badgeHtml}
                    </td>
                    <td style="text-align: right; font-weight: bold;">${formatMoney(stats.paid)}</td>
                    <td style="text-align: right; font-weight: bold;">${formatMoney(stats.owed)}</td>
                    <td style="text-align: right; font-weight: bold;" class="${diffClass}">${diffText}</td>
                </tr>`;

                // Individual Breakdown for groups
                if (stats.members.length > 1) {
                    stats.members.forEach(m => {
                        const mStats = stats.memberStats[m];
                        const mDiff = mStats.paid - mStats.owed;
                        const mDiffClass = mDiff > 0.01 ? 'owed' : (mDiff < -0.01 ? 'owes' : 'settled');
                        const mDiffText = mDiff > 0.01 ? `+${formatMoney(mDiff)}` : (mDiff < -0.01 ? `-${formatMoney(Math.abs(mDiff))}` : '$0.00');
                        const mColor = UI.getColor(m);
                        
                        groupStandingRows += `
                        <tr class="member-sub-row">
                            <td style="padding-left: 24px; color: #64748b;">
                                <span style="color: #cbd5e1; margin-right: 4px;">└─</span> <strong style="color: ${mColor}; font-weight: 600;">${UI.escapeHTML(UI.shortName(m))}</strong>
                            </td>
                            <td style="text-align: right; color: #64748b;">${formatMoney(mStats.paid)}</td>
                            <td style="text-align: right; color: #64748b;">${formatMoney(mStats.owed)}</td>
                            <td style="text-align: right;" class="${mDiffClass}">${mDiffText}</td>
                        </tr>`;
                    });
                }
            });
        }

        let settlementItems = '';
        if (state.currentGroupBalances && state.currentGroupBalances.length > 0) {
            if (!state.currentSettlements || state.currentSettlements.length === 0) { 
                settlementItems = `<div class="settled-alert">🎉 Everyone is fully settled!</div>`;
            } else {
                state.currentSettlements.forEach(s => { 
                    settlementItems += `
                    <div class="settlement-item">
                        <span class="payer" style="color: ${s.from.color};">${UI.escapeHTML(s.from.name)}</span> 
                        <span class="arrow">➔</span> 
                        <span class="payee" style="color: ${s.to.color};">${UI.escapeHTML(s.to.name)}</span>: 
                        <strong class="amount">${formatMoney(s.amount)}</strong>
                    </div>`; 
                });
            }
        }

        let reportHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${state.tripName} - Trip Report</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        body {
            font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
            background-color: #f8fafc;
            color: #0f172a;
            margin: 0;
            padding: 40px 20px;
            line-height: 1.5;
        }
        h1, h2, h3, .stat-value, th {
            font-family: 'Outfit', sans-serif;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
            background: #ffffff;
            border: 1px solid rgba(226, 232, 240, 0.8);
            border-radius: 16px;
            padding: 36px;
            box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.04);
        }
        header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #f1f5f9;
            padding-bottom: 24px;
        }
        header h1 {
            margin: 0 0 8px 0;
            font-size: 2.2rem;
            color: #4f46e5;
            font-weight: 900;
            letter-spacing: -0.02em;
        }
        header p {
            margin: 0;
            color: #64748b;
            font-size: 1.1rem;
            font-weight: 500;
        }
        .meta-info {
            font-size: 0.85rem;
            color: #94a3b8;
            margin-top: 12px;
            font-weight: 600;
        }
        section {
            margin-bottom: 30px;
        }
        section h2 {
            font-size: 1.35rem;
            font-weight: 800;
            color: #0f172a;
            border-bottom: 1px solid #cbd5e1;
            padding-bottom: 8px;
            margin-bottom: 16px;
            margin-top: 24px;
        }
        /* Grid Stats */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 12px;
            margin-bottom: 20px;
        }
        .stat-card {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 14px 16px;
            display: flex;
            flex-direction: column;
        }
        .stat-label {
            font-size: 0.72rem;
            color: #64748b;
            text-transform: uppercase;
            font-weight: 800;
            letter-spacing: 0.05em;
            margin-bottom: 4px;
        }
        .stat-value {
            font-size: 1.35rem;
            font-weight: 900;
            color: #0f172a;
        }
        .stat-sub {
            font-size: 0.75rem;
            color: #64748b;
            margin-top: auto;
            padding-top: 4px;
        }
        /* Tables */
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
            font-size: 0.9rem;
        }
        th, td {
            padding: 10px 12px;
            text-align: left;
            border-bottom: 1px solid #cbd5e1;
        }
        th {
            background-color: #f8fafc;
            color: #475569;
            font-weight: 700;
            text-transform: uppercase;
            font-size: 0.75rem;
            letter-spacing: 0.05em;
        }
        .group-row td {
            background-color: #f8fafc;
        }
        .member-sub-row td {
            background-color: #ffffff;
            font-size: 0.85rem;
            border-bottom: 1px dashed #e2e8f0;
        }
        .badge {
            display: inline-block;
            font-size: 0.62rem;
            font-weight: 800;
            padding: 1px 5px;
            border-radius: 4px;
            margin-left: 6px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        .cat-icon {
            display: inline-block;
            margin-right: 6px;
        }
        /* Balance classes */
        .owed { color: #10b981; }
        .owes { color: #f43f5e; }
        .settled { color: #64748b; }
        
        /* Settlements */
        .settlement-container {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 16px;
        }
        .settled-alert {
            color: #10b981;
            font-weight: 700;
            background: #f0fdf4;
            border: 1px solid #bbf7d0;
            padding: 12px;
            border-radius: 8px;
            text-align: center;
        }
        .settlement-item {
            display: flex;
            align-items: center;
            padding: 8px 0;
            border-bottom: 1px dashed #e2e8f0;
            font-size: 0.95rem;
        }
        .settlement-item:last-child {
            border-bottom: none;
        }
        .settlement-item .payer, .settlement-item .payee {
            font-weight: 700;
        }
        .settlement-item .arrow {
            margin: 0 8px;
            color: #94a3b8;
        }
        .settlement-item .amount {
            color: #0f172a;
            margin-left: 4px;
        }
        /* Print Styles */
        @media print {
            body {
                background-color: #ffffff;
                padding: 0;
            }
            .container {
                border: none;
                box-shadow: none;
                padding: 0;
            }
            header {
                border-bottom: 2px solid #000000;
            }
            th {
                background-color: #f1f5f9 !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            .stat-card {
                background: #f8fafc !important;
            border: 1px solid #cbd5e1 !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            .group-row td {
                background-color: #f8fafc !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            .settlement-container {
                background: #f8fafc !important;
                border: 1px solid #cbd5e1 !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>${UI.escapeHTML(state.tripName || 'Trip Report')}</h1>
            ${state.tripComment ? `<p>${UI.escapeHTML(state.tripComment)}</p>` : ''}
            <div class="meta-info">Generated on: ${new Date().toLocaleDateString()} • All amounts in ${UI.escapeHTML(document.getElementById('view-currency')?.value || 'USD')}</div>
        </header>

        ${state.currentStats && state.currentStats.validActiveCount > 0 ? `
        <section>
            <h2>📊 Trip Analytics</h2>
            <div class="stats-grid">
                <div class="stat-card">
                    <span class="stat-label">Filtered Trip Cost</span>
                    <span class="stat-value">${formatMoney(state.currentStats.totalSpent)}</span>
                    ${state.showPerDay && state.tripDays > 0 ? `<span class="stat-sub">(${formatMoney(state.currentStats.totalSpent / state.tripDays)}/day)</span>` : ''}
                </div>
                <div class="stat-card" style="background: #fff1f2; border-color: #fecdd3;">
                    <span class="stat-label" style="color: #be123c;">Biggest Splurge</span>
                    <span class="stat-value" style="color: #be123c; font-size: 1.15rem; word-break: break-word;">${UI.escapeHTML(state.currentStats.biggestSplurge.desc)}</span>
                    <span class="stat-sub" style="color: #be123c; font-size: 0.95rem; font-weight: 700;">${formatMoney(state.currentStats.biggestSplurge.amount)}</span>
                </div>
                <div class="stat-card">
                    <span class="stat-label">Most Exp. Day</span>
                    <span class="stat-value" style="font-size: 1.1rem;">${state.currentStats.mostExpensiveDay.date ? UI.formatDateDisplay(state.currentStats.mostExpensiveDay.date) : 'N/A'}</span>
                    <span class="stat-sub" style="font-weight: 700;">${formatMoney(state.currentStats.mostExpensiveDay.amount)}</span>
                </div>
                <div class="stat-card">
                    <span class="stat-label">Trip Banker</span>
                    <span class="stat-value">${UI.escapeHTML(UI.shortName(state.currentStats.tripBanker.name))}</span>
                    <span class="stat-sub">Fronted ${formatMoney(state.currentStats.tripBanker.paid)}</span>
                </div>
            </div>

            <h3 style="margin-top: 24px; font-size: 1.1rem; color: #475569;">Group & Individual Standings</h3>
            <table>
                <thead>
                    <tr>
                        <th style="width: 40%;">Group / Person</th>
                        <th style="width: 20%; text-align: right;">Net Paid</th>
                        <th style="width: 20%; text-align: right;">Total Share</th>
                        <th style="width: 20%; text-align: right;">Balance</th>
                    </tr>
                </thead>
                <tbody>
                    ${groupStandingRows}
                </tbody>
            </table>
        </section>
        ` : ''}

        ${state.currentGroupBalances && state.currentGroupBalances.length > 0 ? `
        <section>
            <h2>💸 Final Settlement</h2>
            <div class="settlement-container">
                ${settlementItems}
            </div>
        </section>
        ` : ''}

        <section>
            <h2>📝 Activity Summary</h2>
            <div class="stats-grid">
                <div class="stat-card">
                    <span class="stat-label">Total Activities</span>
                    <span class="stat-value">${state.currentFilteredExpenses.length}</span>
                </div>
                <div class="stat-card">
                    <span class="stat-label">Average per Activity</span>
                    <span class="stat-value">${state.currentFilteredExpenses.length > 0 ? formatMoney(state.currentStats.totalSpent / state.currentFilteredExpenses.length) : '$0.00'}</span>
                </div>
            </div>
            
            <h3 style="margin-top: 20px; font-size: 1.1rem; color: #475569;">Category Breakdown</h3>
            <table>
                <thead>
                    <tr>
                        <th style="width: 40%;">Category</th>
                        <th style="width: 20%; text-align: center;">Activities</th>
                        <th style="width: 20%; text-align: right;">Total Spent</th>
                        <th style="width: 20%; text-align: right;">Avg / Person</th>
                    </tr>
                </thead>
                <tbody>
                    ${categoryBreakdownRows}
                </tbody>
            </table>
        </section>
    </div>
</body>
</html>`;

        // Create Blob and trigger native browser file download
        const blob = new Blob([reportHtml], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const safeTripName = (state.tripName || 'Trip').replace(/[/\\?%*:|"<>]/g, '').trim().replace(/\s+/g, '_') || 'Trip';
        a.download = `${safeTripName}_Report.html`;
        document.body.appendChild(a);
        a.click();
        
        // Cleanup
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

    } catch (err) {
        console.error(err);
        alert("Failed to export HTML Report.");
    } finally {
        btn.innerHTML = originalText; 
        btn.disabled = false;
    }
}

// Bind to window for HTML inline event handlers compatibility
window.exportHTMLReport = exportHTMLReport;

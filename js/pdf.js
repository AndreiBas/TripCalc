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

export async function generatePDF() {
    const UI = await getUI();
    const btn = document.getElementById('export-pdf-btn');
    if (!btn) return;
    
    const originalText = btn.innerHTML; 
    btn.innerHTML = "⏳ Generating..."; 
    btn.disabled = true;

    let html = `
    <div style="width: 680px; padding: 20px; font-family: Helvetica, Arial, sans-serif; color: #0f172a; background-color: #ffffff; box-sizing: border-box;">
        <style>
            * { box-sizing: border-box !important; }
            table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 12px; margin-bottom: 20px; }
            th, td { padding: 8px; border: 1px solid #cbd5e1; word-wrap: break-word; overflow-wrap: break-word; }
            .pdf-header { font-size: 18px; border-bottom: 2px solid #f1f5f9; padding-bottom: 4px; margin-top: 20px; margin-bottom: 10px; color: #0f172a; page-break-after: avoid; }
            .pdf-subheader { font-size: 14px; margin-bottom: 8px; color: #475569; page-break-after: avoid; }
        </style>
        
        <h1 style="text-align:center; color: #4f46e5; margin-bottom: 5px; font-size: 26px;">${state.tripName}</h1>
        ${state.tripComment ? `<p style="text-align:center; color: #64748b; margin-top: 0; font-size: 14px;">${state.tripComment}</p>` : ''}
        <p style="text-align:center; color: #94a3b8; font-size: 12px; margin-bottom: 20px;">Generated on: ${new Date().toLocaleDateString()}</p>
        <hr style="border: 0; border-bottom: 1px solid #cbd5e1; margin-bottom: 20px;">
    `;

    if (state.currentStats && state.currentStats.validActiveCount > 0) {
        html += `<h2 class="pdf-header">📊 Trip Analytics</h2>
        <table><tr>
                <td style="background: #f8fafc; width: 25%;"><strong style="color: #64748b; text-transform: uppercase; font-size: 10px;">Filtered Trip Cost</strong><br><span style="font-size: 16px; color: #4f46e5; font-weight: bold;">${formatMoney(state.currentStats.totalSpent)}</span>${state.showPerDay && state.tripDays > 0 ? `<br><span style="color: #4f46e5; font-size: 10px;">(${formatMoney(state.currentStats.totalSpent / state.tripDays)}/d)</span>` : ''}</td>
                <td style="background: #fff1f2; border-color: #fecdd3; width: 25%;"><strong style="color: #be123c; text-transform: uppercase; font-size: 10px;">Biggest Splurge</strong><br><span style="font-size: 12px; color: #be123c;">${state.currentStats.biggestSplurge.desc}</span><br><strong style="font-size: 14px; color: #be123c;">${formatMoney(state.currentStats.biggestSplurge.amount)}</strong></td>
                <td style="background: #f8fafc; width: 25%;"><strong style="color: #64748b; text-transform: uppercase; font-size: 10px;">Most Exp. Day</strong><br><span style="font-size: 12px;">${state.currentStats.mostExpensiveDay.date ? UI.formatDateDisplay(state.currentStats.mostExpensiveDay.date) : 'N/A'}</span><br><strong style="font-size: 14px;">${formatMoney(state.currentStats.mostExpensiveDay.amount)}</strong></td>
                <td style="background: #f8fafc; width: 25%;"><strong style="color: #64748b; text-transform: uppercase; font-size: 10px;">Trip Banker</strong><br><span style="font-size: 12px;">${UI.shortName(state.currentStats.tripBanker.name)}</span><br><strong style="font-size: 14px;">${formatMoney(state.currentStats.tripBanker.paid)}</strong></td>
        </tr></table>`;

        html += `<h3 class="pdf-subheader">Category Breakdown</h3>
        <table><thead style="background: #f1f5f9;"><tr><th style="width: 35%; text-align: left;">Category</th><th style="width: 20%; text-align: center;">Activities</th><th style="width: 25%; text-align: right;">Total Spent</th><th style="width: 20%; text-align: right;">Avg / Person</th></tr></thead><tbody>`;
        Object.keys(state.currentStats.categoryTotals).forEach(cat => {
            if (cat !== 'Transfer' && state.currentStats.categoryTotals[cat] > 0) {
                const total = state.currentStats.categoryTotals[cat]; 
                const acts = state.currentStats.categoryActivityCounts[cat]; 
                const avgPerPerson = total / state.currentStats.categoryParticipations[cat];
                html += `<tr><td>${CATEGORIES[cat]?.icon || ''} ${cat}</td><td style="text-align: center;">${acts}</td><td style="text-align: right;"><strong>${formatMoney(total)}</strong></td><td style="text-align: right;">${formatMoney(avgPerPerson)}</td></tr>`;
            }
        });
        html += `</tbody></table>`;

        html += `<h3 class="pdf-subheader">Group / Personal Insights</h3>
        <table><thead style="background: #f1f5f9;"><tr><th style="width: 30%; text-align: left;">Group / Person</th><th style="width: 25%; text-align: right;">Net Paid</th><th style="width: 25%; text-align: right;">Total Share (Owed)</th><th style="width: 20%; text-align: right;">Balance</th></tr></thead><tbody>`;
        Object.keys(state.currentStats.groupStats).forEach(gName => {
            const stats = state.currentStats.groupStats[gName];
            if (stats.owed === 0 && stats.paid === 0) return;
            const diff = stats.paid - stats.owed;
            const diffText = diff > 0.01 ? `<span style="color: #10b981;">+${formatMoney(diff)}</span>` : (diff < -0.01 ? `<span style="color: #ef4444;">${formatMoney(diff)}</span>` : '<span style="color: #64748b;">$0.00</span>');
            html += `<tr><td><strong>${UI.shortName(gName)}</strong>${stats.members.length > 1 ? `<br><span style="font-size: 10px; color: #64748b;">(${stats.members.map(UI.shortName).join(', ')})</span>` : ''}</td><td style="text-align: right;">${formatMoney(stats.paid)}</td><td style="text-align: right;">${formatMoney(stats.owed)}</td><td style="text-align: right; font-weight: bold;">${diffText}</td></tr>`;
        });
        html += `</tbody></table>`;
    }

    if (state.currentGroupBalances && state.currentGroupBalances.length > 0) {
        html += `<div style="page-break-inside: avoid;"><h2 class="pdf-header">💸 Final Settlement</h2><h3 class="pdf-subheader">Overall Standing</h3><ul style="font-size: 13px; line-height: 1.6; padding-left: 20px;">`;
        state.currentGroupBalances.forEach(b => {
            let txt = b.net > 0.01 ? `is owed <strong>${formatMoney(b.net)}</strong>` : (b.net < -0.01 ? `owes <strong style="color:#ef4444;">${formatMoney(Math.abs(b.net))}</strong>` : '<span style="color:#10b981;">is perfectly settled</span>');
            html += `<li><strong style="color: ${b.color};">${b.name}</strong> ${txt}</li>`;
        });
        html += `</ul><h3 class="pdf-subheader" style="margin-top: 15px;">How to Settle Up</h3>`;
        if (state.currentSettlements.length === 0) { 
            html += `<p style="font-size: 14px; color: #10b981; font-weight: bold; background: #f0fdf4; padding: 10px; border: 1px solid #bbf7d0; border-radius: 6px; text-align: center;">🎉 Everyone is fully settled!</p>`;
        } else {
            html += `<ul style="font-size: 14px; line-height: 1.8; padding-left: 20px;">`;
            state.currentSettlements.forEach(s => { 
                html += `<li><strong style="color: ${s.from.color};">${s.from.name}</strong> pays <strong style="color: ${s.to.color};">${s.to.name}</strong>: <strong>${formatMoney(s.amount)}</strong></li>`; 
            });
            html += `</ul>`;
        }
        html += `</div>`;
    }

    if (state.currentFilteredExpenses.length > 0) {
        html += `<h2 class="pdf-header">📜 Activity Ledger</h2><table><thead style="background: #f1f5f9; display: table-header-group;"><tr><th style="width: 15%; text-align: left;">Date</th><th style="width: 30%; text-align: left;">Description</th><th style="width: 18%; text-align: left;">Category</th><th style="width: 17%; text-align: left;">Paid By</th><th style="width: 20%; text-align: right;">Amount</th></tr></thead><tbody>`;
        state.currentFilteredExpenses.forEach(e => {
            const tagStr = e.tags && e.tags.length ? ` <span style="color:#4f46e5;font-size:10px;">[${e.tags.map(t=>'#'+t).join(' ')}]</span>` : '';
            html += `<tr style="page-break-inside: avoid;"><td>${e.date}</td><td><strong>${e.desc}</strong>${tagStr}</td><td>${CATEGORIES[e.category]?.icon || ''} ${e.category}</td><td>${UI.shortName(e.payer)}</td><td style="text-align: right; font-weight: bold;">${formatMoney(e.amount)}</td></tr>`;
        });
        html += `</tbody></table>`;
    }

    if (state.tripNotes && state.tripNotes.trim() !== '' && state.tripNotes !== '<p><br></p>') {
        html += `<div style="page-break-before: always;"><h2 class="pdf-header">📝 Trip Notes</h2><div style="font-size: 14px; line-height: 1.6;">${state.tripNotes}</div></div>`;
    }
    html += `</div>`;

    const opt = {
        margin:       [0.4, 0.4, 0.4, 0.4], 
        filename:     state.tripName.replace(/\s+/g, '_') + '_Report.pdf',
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, letterRendering: true, scrollY: 0, scrollX: 0 },
        jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' },
        pagebreak:    { mode: ['css', 'legacy'] }
    };

    html2pdf().set(opt).from(html).save().then(() => { 
        btn.innerHTML = originalText; 
        btn.disabled = false;
    }).catch(err => { 
        console.error(err); 
        btn.innerHTML = originalText; 
        btn.disabled = false; 
        alert("Failed to generate PDF."); 
    });
}

// Bind to window for HTML event handlers compatibility
window.generatePDF = generatePDF;

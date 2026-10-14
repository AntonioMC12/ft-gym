import {CentersError} from '../errors.js';
import {membershipDate} from './membership-transitions.js';
import {minorUnits} from './money.js';
export function debtPolicy(policy) {
  if(policy?.version!==1||!Number.isSafeInteger(policy.graceDays)||policy.graceDays<0||policy.graceDays>365||policy.automaticSuspension!==false)throw new CentersError(409,'debt-policy-required','explicit supported debt policy required');
  return {version:1,graceDays:policy.graceDays,automaticSuspension:false};
}
export function debtState(balanceMinor,dueOn,today,graceDays) {
  const balance=minorUnits(balanceMinor);membershipDate(dueOn);membershipDate(today);
  if(!Number.isSafeInteger(graceDays)||graceDays<0||graceDays>365)throw new CentersError(400,'invalid-input','invalid grace period');
  const lateDays=Math.max(0,Math.round((Date.parse(today+'T00:00:00Z')-Date.parse(dueOn+'T00:00:00Z'))/86400000));
  return {status:balance===0n?'settled':today<dueOn?'not-due':today===dueOn?'due':lateDays<=graceDays?'grace':'overdue',lateDays};
}
// Human-facing CSV. A visible text marker survives common spreadsheet save/reopen behavior.
// Dangerous formula prefixes (including full-width variants) never start an exported cell.
export function csvCell(value) {
  let text=String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'');
  if(/^[\t\r\n]/.test(text)||/^[\s\uFEFF\u200B-\u200F\u202A-\u202E]*[=+\-@＝＋－＠]/u.test(text))text='[text] '+text;
  return '"'+text.replaceAll('"','""')+'"';
}
const major=minor=>{const value=String(minor).padStart(3,'0');return value.slice(0,-2)+'.'+value.slice(-2)};
export function debtCsv(rows) {
  const columns=['centerId','memberNumber','memberName','receiptId','periodStart','periodEnd','dueOn','currency','total','paid','refunded','balance','status'];
  const lines=[columns,...rows.map(r=>[r.centerId,r.memberNumber,r.memberName,r.id,r.periodStart,r.periodEnd,r.dueOn,r.currency,major(r.totalMinor),major(r.paidMinor),major(r.refundedMinor),major(r.balanceMinor),r.debt.status])];
  return '\uFEFF'+lines.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
}

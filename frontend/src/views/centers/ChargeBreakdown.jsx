import {Row} from '../../components/ui.jsx'
import {minorToPrice} from '../../lib/membership-price.js'
import {t} from '../../lib/i18n.js'

// A preview and an issued receipt use the same presentation; the caller supplies its
// authoritative quote or immutable snapshot. This component performs no calculation.
export default function ChargeBreakdown({quote}) {
  return <div><p className="small muted">{quote.periodStart} → {quote.periodEnd} · {quote.proration==='none'?t('No proration'):t('Actual days')}</p>
    <Row title={t('Billable days')} value={quote.chargeDays+' / '+quote.periodDays}/>
    {quote.activeDays!==quote.chargeDays&&<Row title={t('Active days')} value={quote.activeDays}/>}
    <Row title={t('Discount (%)')} value={minorToPrice(String(quote.discountBasisPoints))}/>
    <Row title={t('Net amount')} value={minorToPrice(quote.netMinor)+' '+quote.currency}/>
    <Row title={t('Tax amount')} value={minorToPrice(quote.taxMinor)+' '+quote.currency}/>
    <Row title={t('Total amount')} value={minorToPrice(quote.totalMinor)+' '+quote.currency}/>
  </div>
}

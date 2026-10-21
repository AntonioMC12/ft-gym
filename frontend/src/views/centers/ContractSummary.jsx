import {Row} from '../../components/ui.jsx'
import {minorToPrice} from '../../lib/membership-price.js'
import {t} from '../../lib/i18n.js'
export default function ContractSummary({contract:row,children}) {
  const status=row.canceled||row.status==='canceled'?t('Canceled'):row.status==='scheduled'?t('Scheduled'):row.status==='ended'?t('Ended subscription'):row.status==='frozen'?t('Frozen member'):t('Current subscription')
  return <Row className="centers-change-row" title={row.name} subtitle={minorToPrice(row.priceMinor)+' '+row.currency+' · '+row.startsOn+(row.effectiveEndsOn?' → '+row.effectiveEndsOn:'')+' · '+t('Discount (%)')+': '+minorToPrice(String(row.discountBasisPoints))} value={status}>{children}</Row>
}

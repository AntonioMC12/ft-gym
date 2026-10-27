import Icon from './Icon.jsx'
import { t } from '../lib/i18n.js'

export default function RepRangeNotice({ advice }) {
  if (!advice) return null
  return <div className={'rep-load-notice ' + advice.kind} role="note" aria-label={t('Load recommendation')}>
    <Icon name={advice.kind === 'increase' ? 'arrowUp' : 'arrowDown'} />
    <div><strong>{t('Load recommendation')}</strong><p>{t(advice.message)}</p></div>
  </div>
}

import {useNavigate} from 'react-router-dom'
import {Button} from '../../components/ui.jsx'
import Icon from '../../components/Icon.jsx'
import {useStore} from '../../store/useStore.js'
import {navBack} from '../../lib/nav.js'
import {t} from '../../lib/i18n.js'
// A cached account may be ready before /api/config. Keep its deep link intact;
// only a known disabled module redirects. Back/retry also work if config is down.
export default function ConfigPending({fallback='/home',title='Manage centers'}) {
  const navigate=useNavigate()
  return <div className="narrow centers-page"><div className="hdr"><button className="iconbtn" aria-label={t('Back')} onClick={()=>navBack(fallback,navigate)}><Icon name="chevronLeft"/></button><h1>{t(title)}</h1></div><p role="status">{t('Loading centers')}</p><Button onClick={()=>useStore.getState().refreshConfig?.()}>{t('Reload centers')}</Button></div>
}

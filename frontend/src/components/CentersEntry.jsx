import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useCenters } from '../store/useCenters.js'
import { Row } from './ui.jsx'
import { t } from '../lib/i18n.js'

export default function CentersEntry() {
  const nav = useNavigate()
  const user = useStore(s => s.user)
  const enabled = useStore(s => s.config?.centers?.enabled)
  const { ownerUid, centers, platformCapabilities } = useCenters()
  if (!enabled || !user || ownerUid !== user.id || (!centers.length && !platformCapabilities.length)) return null
  return <Row icon="personCircle" title={t('Manage centers')} accessory="chevron" onClick={() => nav('/centers')} />
}

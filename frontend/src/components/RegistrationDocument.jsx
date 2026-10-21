import {TextField} from './ui.jsx'
import {t} from '../lib/i18n.js'
export default function RegistrationDocument({value,onChange}){
 return <label style={{display:'grid',gap:6,margin:'14px 0'}}><span className="small">{t('DNI / NIE (required)')}</span><TextField name="nationalDocument" aria-label={t('DNI / NIE (required)')} required autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={20} value={value} onChange={e=>onChange(e.target.value)}/></label>
}

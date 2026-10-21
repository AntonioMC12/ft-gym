import {Row} from '../../components/ui.jsx'
import {t} from '../../lib/i18n.js'

// Historical source values are text, never markup, account authority or consent.
export default function SourceRegistration({value}){
  if(!value)return null
  const fields=[['Original subscriber number',value.subscriberNumber],['Postal address',value.address],['Date of birth',value.birthDate],['Source timestamp',value.submittedAt]]
  return <div className="centers-source-registration">
    <p className="small muted">{t('Source data is preserved as a record; it does not verify consent or replace the internal member number.')}</p>
    {fields.filter(([,value])=>value).map(([label,value])=><Row key={label} title={t(label)} subtitle={value}/>)}
    {value.conditionsText&&<details><summary>{t('Source conditions')}</summary><p className="centers-source-conditions">{value.conditionsText}</p></details>}
    {value.conditionsResponse&&<Row title={t('Source response')} subtitle={value.conditionsResponse}/>}
  </div>
}

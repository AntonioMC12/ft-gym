import {useEffect,useState} from 'react'
import {api} from '../lib/api.js'
import {t} from '../lib/i18n.js'
import {registrationCenterId} from '../lib/registration-center.js'
export default function RegistrationCenter(){
 const id=registrationCenterId(),[name,setName]=useState(''),[failed,setFailed]=useState(false)
 useEffect(()=>{let current=true;setName('');setFailed(false);if(id)api('/api/centers/join?'+new URLSearchParams({centerId:id})).then(r=>{if(current)setName(r.center.name)}).catch(()=>{if(current)setFailed(true)});return()=>{current=false}},[id])
 return <p className="centers-import-notice" role="status">{!id?t('Ask your center manager for the registration link.'):failed?t('The center registration link is unavailable.'):!name?t('Loading centers'):name+' · '+t('By registering, you request access and consent to linking your account to your member record. The center manager must approve it.')}</p>
}

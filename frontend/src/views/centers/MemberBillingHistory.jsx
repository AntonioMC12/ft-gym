import {useEffect,useRef,useState} from 'react'
import {Section} from '../../components/ui.jsx'
import {centerSubscriptions,subscriptionsErrorKey} from '../../lib/centers-api.js'
import {useStore} from '../../store/useStore.js'
import {t} from '../../lib/i18n.js'
import ContractSummary from './ContractSummary.jsx'
import Passes from './Passes.jsx'
export default function MemberBillingHistory({centerId,memberId,ownerUid,today}){
 const [info,setInfo]=useState(null),[error,setError]=useState(null),life=useRef(0)
 useEffect(()=>{const epoch=++life.current;setInfo(null);setError(null);centerSubscriptions(centerId,memberId).then(result=>{if(life.current===epoch&&useStore.getState().user?.id===ownerUid)setInfo(result)}).catch(e=>{if(life.current===epoch&&useStore.getState().user?.id===ownerUid)setError(e)});return()=>{life.current++}},[centerId,memberId,ownerUid])
 return <><Section title={t('Subscription history')}><div className="centers-form">{!info&&!error&&<p role="status">{t('Loading…')}</p>}{info?.subscriptions.map(row=><ContractSummary key={row.id} contract={row}/>)}{info&&!info.subscriptions.length&&<p>{t('No fee assigned')}</p>}{error&&<p role="alert">{t(subscriptionsErrorKey(error))}</p>}</div></Section><Passes centerId={centerId} memberId={memberId} ownerUid={ownerUid} today={info?.today||today} readOnly/></>
}

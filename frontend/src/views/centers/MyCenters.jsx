import SharedProgress from './SharedProgress.jsx'
import {useEffect,useRef,useState} from 'react'
import {Navigate,useNavigate,useSearchParams} from 'react-router-dom'
import {Section,Row,Button} from '../../components/ui.jsx'
import Icon from '../../components/Icon.jsx'
import {navBack} from '../../lib/nav.js'
import {ownCenterMembership,centersErrorKey} from '../../lib/centers-api.js'
import {minorToPrice} from '../../lib/membership-price.js'
import {useStore} from '../../store/useStore.js'
import {useCenters} from '../../store/useCenters.js'
import {t} from '../../lib/i18n.js'
import ContractSummary from './ContractSummary.jsx'
import Receipts from './Receipts.jsx'
import Payments from './Payments.jsx'
import OwnNotifications from './OwnNotifications.jsx'
import ConfigPending from './ConfigPending.jsx'
import TrainingProposals from './TrainingProposals.jsx'
import OwnAccess from './OwnAccess.jsx'
import Classes from './Classes.jsx'
import FreezeRequests from './FreezeRequests.jsx'
import CenterNavigationGuard,{useCenterNavigation} from './NavigationGuard.jsx'
import './centers.css'

const memberState=state=>state==='active'?t('Active member'):state==='frozen'?t('Frozen member'):state==='ended'?t('Ended member'):t('Pending activation')
function Membership({centerId,ownerUid}) {
  const [info,setInfo]=useState(null),[error,setError]=useState(null),[revision,setRevision]=useState(0),life=useRef(0)
  useEffect(()=>{
    const epoch=++life.current;setInfo(null);setError(null)
    ownCenterMembership(centerId).then(result=>{if(life.current===epoch&&useStore.getState().user?.id===ownerUid)setInfo(result)}).catch(e=>{if(life.current===epoch&&useStore.getState().user?.id===ownerUid){setError(e);useCenters.getState().revokeOn(e)}})
    return()=>{life.current++}
  },[centerId,ownerUid,revision])
  if(error)return <p role="alert">{t(centersErrorKey(error))}</p>
  if(!info)return <p role="status">{t('Loading…')}</p>
  return <><Section title={info.center.name}><div className="centers-form"><Row title={info.member.name} subtitle={info.member.number} value={memberState(info.member.state)}/><Row title={t('Outstanding balance')} value={minorToPrice(info.summary.outstandingMinor)+' '+info.summary.currency}/><Row title={t('Overdue balance')} value={minorToPrice(info.summary.overdueMinor)+' '+info.summary.currency}/><Button onClick={()=>setRevision(value=>value+1)}>{t('Reload centers')}</Button></div></Section>
    <Section title={t('Subscriptions')}><div className="centers-form">{info.subscriptions.map(row=><div key={row.id}><ContractSummary contract={row}/><Row title={t('Billing period (months)')} value={row.intervalMonths}/><Row title={t('Billing day')} value={row.billingDay}/><Row title={t('Tax policy')} value={row.priceIncludesTax==null?t('Not configured'):t(row.priceIncludesTax?'Tax included':'Tax excluded')}/>{row.taxBasisPoints!=null&&<Row title={t('Tax rate (%)')} value={minorToPrice(String(row.taxBasisPoints))}/>}</div>)}{!info.subscriptions.length&&<p>{t('Your center has no assigned fee.')}</p>}{info.subscriptionsTruncated&&<p className="small muted">{t('Showing up to 100 contracts.')}</p>}</div></Section>
    <Receipts centerId={centerId} memberId={info.member.id} ownerUid={ownerUid} own canPay={info.center.state==='active'} revision={revision} changed={()=>setRevision(value=>value+1)}/><Payments centerId={centerId} memberId={info.member.id} ownerUid={ownerUid} own revision={revision}/><OwnNotifications centerId={centerId} ownerUid={ownerUid} active={info.center.state==='active'}/>
    <TrainingProposals centerId={centerId} ownerUid={ownerUid} own active={info.center.state==='active'&&info.member.state==='active'}/>
    <SharedProgress centerId={centerId} ownerUid={ownerUid} own centerName={info.center.name}/>
    <FreezeRequests centerId={centerId} ownerUid={ownerUid} own today={info.today} active={info.center.state==='active'} canRequest={info.member.state==='active'} changed={()=>setRevision(value=>value+1)}/>
    <Classes centerId={centerId} ownerUid={ownerUid} own/>
    <OwnAccess revision={revision} centerId={centerId} ownerUid={ownerUid} active={info.center.state==='active'&&info.member.state==='active'} timezone={info.center.timezone}/>
  </>
}
function Content() {
  const user=useStore(s=>s.user),config=useStore(s=>s.config),state=useCenters(),navigate=useNavigate(),[params,setParams]=useSearchParams()
  const requestNavigation=useCenterNavigation()
  if(!user)return <Navigate to="/home" replace/>
  if(config==null)return <ConfigPending title="My centers" fallback={params.get('centerId')?'/centers/membership':'/settings/account'}/>
  if(!config.centers?.enabled)return <Navigate to="/home" replace/>
  const selected=params.get('centerId'),centers=state.ownerUid===user.id?state.centers.filter(c=>c.capabilities.includes('membership.own.read')):[],ready=state.ownerUid===user.id&&state.status==='ready'
  return <div className="narrow centers-page"><div className="hdr"><button className="iconbtn" aria-label={t('Back')} onClick={()=>requestNavigation(()=>navBack(selected?'/centers/membership':'/settings/account',navigate))}><Icon name="chevronLeft"/></button><h1>{t('My centers')}</h1></div>
    {!ready&&<p role="status">{t('Loading centers')}</p>}{state.error&&<p role="alert">{t(centersErrorKey(state.error))}</p>}
    {ready&&(selected?centers.some(c=>c.id===selected)?<Membership key={user.id+':'+selected} centerId={selected} ownerUid={user.id}/>:<p>{t('No linked memberships available.')}</p>:centers.length?centers.map(c=><Section key={c.id}><Row title={c.name} subtitle={t('My membership')} accessory="chevron" onClick={()=>setParams({centerId:c.id})}/></Section>):<p>{t('No linked memberships available.')}</p>)}
  </div>
}
export default function MyCenters(){
  const user=useStore(s=>s.user)
  return <CenterNavigationGuard contextKey={user?.id}><Content/></CenterNavigationGuard>
}

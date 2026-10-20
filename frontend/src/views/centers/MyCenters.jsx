import TabBar from '../../components/TabBar.jsx'
import CenterWorkspace from './CenterWorkspace.jsx'
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
function Membership({centerId,ownerUid,pane,onPaneChange,proposalId,versionId,onCloseProposal}) {
  const [info,setInfo]=useState(null),[error,setError]=useState(null),[revision,setRevision]=useState(0),life=useRef(0)
  useEffect(()=>{
    const epoch=++life.current;setInfo(null);setError(null)
    ownCenterMembership(centerId).then(result=>{if(life.current===epoch&&useStore.getState().user?.id===ownerUid)setInfo(result)}).catch(e=>{if(life.current===epoch&&useStore.getState().user?.id===ownerUid){setError(e);useCenters.getState().revokeOn(e)}})
    return()=>{life.current++}
  },[centerId,ownerUid,revision])
  if(error)return <p role="alert">{t(centersErrorKey(error))}</p>
  if(!info)return <p role="status">{t('Loading…')}</p>
  const options=[{value:'summary',label:t('My membership')},{value:'training',label:t('Training proposals')},{value:'billing',label:t('Subscriptions')},{value:'classes',label:t('Classes')},{value:'access',label:t('Center access')}]
  const contract=row=><div className="own-contract" key={row.id}><ContractSummary contract={row}/><details><summary>{t('Details')}</summary><Row title={t('Billing period (months)')} value={row.intervalMonths}/><Row title={t('Billing day')} value={row.billingDay}/><Row title={t('Tax policy')} value={row.priceIncludesTax==null?t('Not configured'):t(row.priceIncludesTax?'Tax included':'Tax excluded')}/>{row.taxBasisPoints!=null&&<Row title={t('Tax rate (%)')} value={minorToPrice(String(row.taxBasisPoints))}/>}</details></div>
  const current=info.subscriptions.filter(row=>!row.canceled&&!['ended','canceled'].includes(row.status)),history=info.subscriptions.filter(row=>!current.includes(row))
  return <div className="own-center-dashboard">
   <header className="own-center-header"><div><span className="small muted">{info.member.number}</span><h2>{info.center.name}</h2><p>{info.member.name} · {memberState(info.member.state)}</p></div><Button size="sm" onClick={()=>setRevision(value=>value+1)}>{t('Reload centers')}</Button></header>
   <CenterWorkspace label={t('My centers')} options={options} value={pane} onChange={onPaneChange}>
    {pane==='summary'&&<><Section title={t('My membership')}><div className="centers-form"><div className="own-center-stats"><div><span>{t('Outstanding balance')}</span><strong>{minorToPrice(info.summary.outstandingMinor)} {info.summary.currency}</strong></div><div><span>{t('Overdue balance')}</span><strong>{minorToPrice(info.summary.overdueMinor)} {info.summary.currency}</strong></div></div><div className="own-center-shortcuts"><Button variant="tinted" icon="clipboard" onClick={()=>onPaneChange('training')}>{t('Training proposals')}</Button><Button onClick={()=>onPaneChange('billing')}>{t('Subscriptions')}</Button><Button onClick={()=>onPaneChange('access')}>{t('Center access')}</Button></div></div></Section><Section title={t('Current subscription')}><div className="centers-form">{current.length?current.map(contract):<p>{t('Your center has no assigned fee.')}</p>}</div></Section></>}
    {pane==='summary'&&<details className="own-center-disclosure"><summary>{t('Freeze requests')}</summary><FreezeRequests centerId={centerId} ownerUid={ownerUid} own today={info.today} active={info.center.state==='active'} canRequest={info.member.state==='active'} changed={()=>setRevision(value=>value+1)}/></details>}
    {pane==='training'&&<><TrainingProposals centerId={centerId} ownerUid={ownerUid} own initialProposalId={proposalId} initialVersionId={versionId} onCloseProposal={onCloseProposal} active={info.center.state==='active'&&info.member.state==='active'}/><details className="own-center-disclosure"><summary>{t('Shared training progress')}</summary><SharedProgress centerId={centerId} ownerUid={ownerUid} own centerName={info.center.name}/></details></>}
    {pane==='billing'&&<><Section title={t('Subscriptions')}><div className="centers-form">{current.map(contract)}{!info.subscriptions.length&&<p>{t('Your center has no assigned fee.')}</p>}{history.length>0&&<details className="own-center-disclosure"><summary>{t('Subscription history')} · {history.length}</summary>{history.map(contract)}</details>}{info.subscriptionsTruncated&&<p className="small muted">{t('Showing up to 100 contracts.')}</p>}</div></Section><Receipts centerId={centerId} memberId={info.member.id} ownerUid={ownerUid} own canPay={info.center.state==='active'} revision={revision} changed={()=>setRevision(value=>value+1)}/><Payments centerId={centerId} memberId={info.member.id} ownerUid={ownerUid} own revision={revision}/></>}
    {pane==='classes'&&<><Classes centerId={centerId} ownerUid={ownerUid} own/></>}
    {pane==='access'&&<><OwnAccess revision={revision} centerId={centerId} ownerUid={ownerUid} active={info.center.state==='active'&&info.member.state==='active'} timezone={info.center.timezone}/><OwnNotifications centerId={centerId} ownerUid={ownerUid} active={info.center.state==='active'}/></>}
   </CenterWorkspace>
  </div>

}
function Content({onStart}) {
  const user=useStore(s=>s.user),config=useStore(s=>s.config),state=useCenters(),navigate=useNavigate(),[params,setParams]=useSearchParams()
  const requestNavigation=useCenterNavigation()
  const pane=['summary','training','billing','classes','access'].includes(params.get('pane'))?params.get('pane'):'summary'
  const changePane=value=>requestNavigation(()=>{const next=new URLSearchParams(params);next.set('pane',value);next.delete('proposalId');next.delete('versionId');setParams(next)})
  const closeProposal=()=>{const next=new URLSearchParams(params);next.delete('proposalId');next.delete('versionId');setParams(next,{replace:true})}
  if(!user)return <Navigate to="/home" replace/>
  if(config==null)return <ConfigPending title="My centers" fallback={params.get('centerId')?'/centers/membership':'/settings/account'}/>
  if(!config.centers?.enabled)return <Navigate to="/home" replace/>
  const selected=params.get('centerId'),centers=state.ownerUid===user.id?state.centers.filter(c=>c.capabilities.includes('membership.own.read')):[],ready=state.ownerUid===user.id&&state.status==='ready'
  const selectedCenter=centers.find(c=>c.id===selected)
  const fullPortal=state.ownerUid===user.id&&(state.platformCapabilities?.includes('centers.manage')||selectedCenter?.capabilities.includes('center.read'))
  return <div className="narrow centers-page own-centers-page"><div className="hdr"><button className="iconbtn" aria-label={t('Back')} onClick={()=>requestNavigation(()=>navBack(selected?'/centers/membership':'/settings/account',navigate))}><Icon name="chevronLeft"/></button><h1>{t(fullPortal?'My centers':'Training proposals')}</h1></div>
    {!ready&&<p role="status">{t('Loading centers')}</p>}{state.error&&<p role="alert">{t(centersErrorKey(state.error))}</p>}
    {ready&&(selected?centers.some(c=>c.id===selected)?fullPortal?<Membership key={user.id+':'+selected} centerId={selected} ownerUid={user.id} pane={pane} onPaneChange={changePane} proposalId={params.get('proposalId')} versionId={params.get('versionId')} onCloseProposal={closeProposal}/>:<div className="own-training-only"><header className="own-center-header"><h2>{selectedCenter.name}</h2></header><TrainingProposals key={user.id+':'+selected} centerId={selected} ownerUid={user.id} own active={selectedCenter.state==='active'} initialProposalId={params.get('proposalId')} initialVersionId={params.get('versionId')} onCloseProposal={closeProposal}/></div>:<p>{t('No linked memberships available.')}</p>:centers.length?centers.map(c=><Section key={c.id}><Row title={c.name} subtitle={t('My membership')} accessory="chevron" onClick={()=>{const next=new URLSearchParams(params);next.set('centerId',c.id);setParams(next)}}/></Section>):<p>{t('No linked memberships available.')}</p>)}
    <TabBar onStart={onStart} requestNavigation={requestNavigation}/>
  </div>
}
export default function MyCenters({onStart}){
  const user=useStore(s=>s.user)
  return <CenterNavigationGuard contextKey={user?.id}><Content onStart={onStart}/></CenterNavigationGuard>
}

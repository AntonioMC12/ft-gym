// @vitest-environment happy-dom
vi.mock('../../components/TabBar.jsx',()=>({default:()=> <nav data-own-tabs/>}))
vi.mock('./Passes.jsx',()=>({default:()=>null}))
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {MemoryRouter} from 'react-router-dom'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('./SharedProgress.jsx',()=>({default:()=>null}))
vi.mock('../../lib/i18n.js',()=>({t:key=>key}))
vi.mock('./OwnNotifications.jsx',()=>({default:()=>null}))
vi.mock('./Classes.jsx',()=>({default:()=>null}))
vi.mock('./FreezeRequests.jsx',()=>({default:()=>null}))
vi.mock('./OwnAccess.jsx',()=>({default:()=>null}))
vi.mock('./TrainingProposals.jsx',()=>({default:({own,active,initialProposalId,initialVersionId})=><div data-proposal-id={initialProposalId} data-version-id={initialVersionId} data-own-training={own?'yes':'no'} data-active={String(active)}/>}))
vi.mock('../../store/useStore.js',()=>{const state={user:{id:'alice'},config:{centers:{enabled:true}}};return{useStore:Object.assign(selector=>selector(state),{getState:()=>state})}})
vi.mock('../../store/useCenters.js',()=>{const state={ownerUid:'alice',status:'ready',centers:[],revokeOn:vi.fn()};return {useCenters:Object.assign(()=>state,{getState:()=>state})}})
vi.mock('../../lib/centers-api.js',()=>({ownCenterMembership:vi.fn(),ownCenterReceipts:vi.fn(),ownCenterPayments:vi.fn(),centersErrorKey:()=> 'error'}))
import {ownCenterMembership,ownCenterReceipts,ownCenterPayments} from '../../lib/centers-api.js'
import {useCenters} from '../../store/useCenters.js'
import {useStore} from '../../store/useStore.js'
import MyCenters from './MyCenters.jsx'
globalThis.IS_REACT_ACT_ENVIRONMENT=true
let host,root
const affiliation={id:'a',name:'My synthetic center',capabilities:['membership.own.read','center.read']},info={center:{id:'a',name:affiliation.name,state:'active'},member:{id:'own',name:'Alice',number:'M-1',state:'active'},summary:{outstandingMinor:'200',overdueMinor:'0',currency:'EUR'},subscriptions:[{id:'s',name:'Fee',priceMinor:'3100',currency:'EUR',startsOn:'2026-10-14',discountBasisPoints:0,status:'active',intervalMonths:1,billingDay:1}]}
beforeEach(()=>{vi.clearAllMocks();useStore.getState().config={centers:{enabled:true}};useCenters.getState().centers=[affiliation];ownCenterMembership.mockResolvedValue(info);ownCenterReceipts.mockResolvedValue({receipts:[],nextCursor:null});ownCenterPayments.mockResolvedValue({payments:[],nextCursor:null});host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(()=>{act(()=>root.unmount());host.remove()})
const render=(path='/centers/membership')=>act(async()=>{root.render(<MemoryRouter initialEntries={[path]}><MyCenters/></MemoryRouter>);await Promise.resolve()})
it('opens only a linked membership and uses read-only terms/receipt/payment components',async()=>{
  await render();await act(async()=>host.querySelector('button.lrow').click());expect(ownCenterMembership).toHaveBeenCalledWith('a');expect(host.querySelector('[data-own-tabs]')).not.toBeNull();expect(ownCenterReceipts).not.toHaveBeenCalled();expect(ownCenterPayments).not.toHaveBeenCalled();expect(host.textContent).toContain('2.00 EUR');await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Subscriptions').click());expect(ownCenterReceipts).toHaveBeenCalledWith('a');expect(ownCenterPayments).toHaveBeenCalledWith('a');expect(host.textContent).toContain('Alice');expect(host.querySelector('input')).toBeNull();for(const label of ['Create receipt','Record payment','Record refund','Assign plan'])expect(host.textContent).not.toContain(label)
})
it('does not query a selected center absent from own affiliations',async()=>{
  await render('/centers/membership?centerId=foreign');expect(ownCenterMembership).not.toHaveBeenCalled();expect(host.textContent).toContain('No linked memberships available.')
})
it('dropping the view while a request is pending prevents old private data from rendering',async()=>{
  let release;ownCenterMembership.mockReturnValue(new Promise(resolve=>release=resolve));await render();await act(async()=>host.querySelector('button.lrow').click());await act(async()=>root.render(<div>Other page</div>));await act(async()=>release(info));expect(host.textContent).toBe('Other page')
})
it('waits for config before resolving a direct own-membership URL',async()=>{
  useStore.getState().config=null;await render('/centers/membership?centerId=a');expect(ownCenterMembership).not.toHaveBeenCalled();expect(host.textContent).toContain('Loading centers');useStore.getState().config={centers:{enabled:true}};await render('/centers/membership?centerId=a');expect(ownCenterMembership).toHaveBeenCalledWith('a');expect(host.textContent).toContain('Alice')
})

it('opens training directly without mounting billing and keeps the pane when choosing a center',async()=>{
 await render('/centers/membership?pane=training');await act(async()=>host.querySelector('button.lrow').click());
 expect(host.querySelector('[data-own-training="yes"]')).not.toBeNull();expect(ownCenterReceipts).not.toHaveBeenCalled();expect(ownCenterPayments).not.toHaveBeenCalled();
 expect(host.querySelector('[aria-current="page"]').textContent).toBe('Training proposals');
})
it('shows only the current contract and keeps history collapsed in billing',async()=>{
 ownCenterMembership.mockResolvedValue({...info,subscriptions:[...info.subscriptions,{...info.subscriptions[0],id:'old',name:'Old fee',status:'ended'}]});
 await render('/centers/membership?centerId=a&pane=billing');
 const history=host.querySelector('.own-center-disclosure');expect(history.open).toBe(false);expect(history.querySelector('summary').textContent).toContain('Subscription history');expect(host.querySelectorAll('.own-contract')).toHaveLength(2);
})

it('passes a direct proposal and version only into the own training view of an allowed center',async()=>{
 await render('/centers/membership?centerId=a&pane=training&proposalId=p&versionId=v');const proposal=host.querySelector('[data-own-training="yes"]');expect(proposal.dataset.proposalId).toBe('p');expect(proposal.dataset.versionId).toBe('v');expect(ownCenterReceipts).not.toHaveBeenCalled();
})

it.each(['summary','billing','classes','access','training'])('ordinary members see only own training even through a direct %s URL',async pane=>{
 useCenters.getState().centers=[{...affiliation,capabilities:['membership.own.read','training.own.read']}];
 await render('/centers/membership?centerId=a&pane='+pane+'&proposalId=p&versionId=v');
 expect(ownCenterMembership).not.toHaveBeenCalled();expect(ownCenterReceipts).not.toHaveBeenCalled();expect(ownCenterPayments).not.toHaveBeenCalled();
 expect(host.querySelector('.centers-workspace-nav')).toBeNull();expect(host.querySelector('[data-own-training="yes"]')).not.toBeNull();expect(host.querySelector('[data-own-tabs]')).not.toBeNull();
 for(const label of ['Subscriptions','Classes','Center access','Shared training progress','Outstanding balance'])expect(host.textContent).not.toContain(label);
})

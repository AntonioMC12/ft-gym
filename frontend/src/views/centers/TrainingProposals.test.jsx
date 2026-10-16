// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('../../lib/i18n.js',()=>({t:key=>key,exerciseNameFor:ex=>ex?.n||''}))
vi.mock('../../sheets.jsx',()=>({confirmSheet:vi.fn()}))
vi.mock('../../lib/centers-api.js',()=>({centerTraining:vi.fn(),centerTrainingProposal:vi.fn(),centerCommand:vi.fn(),trainingErrorKey:()=> 'Delivery error'}))
vi.mock('../../store/useStore.js',()=>{const state={user:{id:'actor'},S:{},update:vi.fn(),syncNow:vi.fn()};return {useStore:Object.assign(selector=>selector(state),{getState:()=>state})}})
vi.mock('../../store/useCenters.js',()=>({useCenters:{getState:()=>({revokeOn:vi.fn()})}}))
vi.mock('../../components/ui.jsx',async original=>({...await original(),MultiSelectRow:({onToggle})=><button type="button" onClick={()=>onToggle('source')}>Choose routine</button>}))
import {centerTraining,centerTrainingProposal,centerCommand} from '../../lib/centers-api.js'
import {confirmSheet} from '../../sheets.jsx'
import {useStore} from '../../store/useStore.js'
import TrainingProposals from './TrainingProposals.jsx'
import Guard from './NavigationGuard.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT=true
let root,host
const rid='cr_'+'b'.repeat(32),key='td_'+'a'.repeat(32),stamp='2026-10-15T02:00:00.000Z'
const routine={id:'source',name:'Push',ex:[{id:'0025',sets:3,reps:8,weight:60}]}
const proposal={id:'proposal',version:1,versionId:'version1',revision:1,name:'Trainer plan',unit:'kg',state:'offered',proposalState:'offered',acceptedAt:null,deliveryResult:null,deliveryKey:key,routineIds:{source:rid},bundle:{opengym_plan:1,name:'Trainer plan',unit:'kg',routines:[routine],customEx:[],week:{1:['source']}}}
const member={id:'member1',name:'Member One',version:2,state:'active',accountLinked:true}
beforeEach(()=>{
  vi.clearAllMocks();const state=useStore.getState();state.user={id:'actor'};state.S={unit:'kg',routines:[structuredClone(routine)],customEx:[],week:{2:['source']},dayPlan:{'2026-10-16':['source']},active:{id:'live'}}
  state.update.mockImplementation(mut=>mut(state.S));state.syncNow.mockResolvedValue({status:'ok'})
  centerTraining.mockResolvedValue({proposals:[proposal],nextCursor:null});centerTrainingProposal.mockResolvedValue({proposal:structuredClone(proposal)})
  centerCommand.mockImplementation(async path=>({proposal:{...proposal,acceptedAt:stamp,...(path.endsWith('/ack')?{deliveryResult:'applied'}:{})}}))
  host=document.createElement('div');document.body.append(host);root=createRoot(host)
})
afterEach(()=>{act(()=>root.unmount());host.remove()})
const render=(props={})=>act(async()=>{root.render(<Guard><TrainingProposals centerId="center1" ownerUid="actor" own {...props}/></Guard>);await Promise.resolve()})
const button=label=>[...host.querySelectorAll('button')].find(node=>node.textContent===label)
const click=label=>act(async()=>button(label).click())
const confirm=()=>confirmSheet.mock.calls.at(-1)[0]
const open=()=>act(async()=>[...host.querySelectorAll('button.lrow')].find(node=>node.textContent.includes('Trainer plan')).click())

it('reviews the immutable content and imports only after explicit acceptance, preserving active session and calendars',async()=>{
  await render();expect(centerTraining).toHaveBeenCalledWith('center1',{},true);await open();expect(host.textContent).toContain('Push');await click('Accept routines');expect(centerCommand).not.toHaveBeenCalled()
  await act(async()=>confirm().onConfirm())
  expect(centerCommand.mock.calls.map(([path])=>path)).toEqual(['/api/centers/own/training/accept','/api/centers/own/training/ack'])
  expect(centerCommand.mock.calls[0][1]).toEqual(expect.objectContaining({centerId:'center1',id:'proposal',versionId:'version1'}));expect(centerCommand.mock.calls[0][1]).not.toHaveProperty('memberId')
  const s=useStore.getState().S;expect(s.routines.map(row=>row.id)).toEqual(['source',rid]);expect(s.week).toEqual({2:['source']});expect(s.dayPlan).toEqual({'2026-10-16':['source']});expect(s.active).toEqual({id:'live'});expect(s.planDeliveries[0].id).toBe(key);expect(useStore.getState().syncNow).toHaveBeenCalledOnce()
})
it('replaces the week only after the user explicitly enables the existing switch',async()=>{
  await render();await open();await act(async()=>host.querySelector('[role="switch"]').click());await click('Accept routines');expect(confirm().message).toContain('Replaces your current Mon–Sun assignments.');await act(async()=>confirm().onConfirm());expect(useStore.getState().S.week).toEqual({1:[rid]})
})
it('retries after failed synchronization without duplicating or overwriting accepted personal routines',async()=>{
  let ack=0;centerCommand.mockImplementation(async path=>{if(path.endsWith('/ack')&&++ack===1)throw {code:'training-not-synced'};return {proposal:{...proposal,acceptedAt:stamp,deliveryResult:path.endsWith('/ack')?'applied':null}}})
  await render();await open();await click('Accept routines');await act(async()=>confirm().onConfirm());expect(host.textContent).toContain('Delivery error');expect(button('Retry delivery')).toBeTruthy()
  useStore.getState().S.routines.find(row=>row.id===rid).name='My edit';await click('Retry delivery');await act(async()=>confirm().onConfirm());expect(useStore.getState().S.routines.filter(row=>row.id===rid)).toHaveLength(1);expect(useStore.getState().S.routines.find(row=>row.id===rid).name).toBe('My edit')
})
it('drops a captured confirmation after center or account changes',async()=>{
  await render();await open();await click('Accept routines');const old=confirm();await render({centerId:'center2'});await act(async()=>old.onConfirm());expect(centerCommand).not.toHaveBeenCalled()
  await open();await click('Accept routines');useStore.getState().user={id:'other'};await act(async()=>confirm().onConfirm());expect(centerCommand).not.toHaveBeenCalled()
})
it('does not apply an accepted response after the own view unmounts',async()=>{
  let release;centerCommand.mockReturnValueOnce(new Promise(resolve=>release=resolve));await render();await open();await click('Accept routines');let operation;act(()=>{operation=confirm().onConfirm()});await act(async()=>root.render(<div>Other page</div>));await act(async()=>{release({proposal:{...proposal,acceptedAt:stamp}});await operation});expect(useStore.getState().update).not.toHaveBeenCalled();expect(useStore.getState().syncNow).not.toHaveBeenCalled();expect(host.textContent).toBe('Other page')
})
it('allows recovery of an accepted superseded proposal while preventing new acceptance in an inactive center',async()=>{
  await render({active:false});await open();expect(button('Accept routines')).toBeUndefined()
  centerTrainingProposal.mockResolvedValue({proposal:{...proposal,state:'superseded',acceptedAt:stamp}});await click('Back');await open();expect(button('Retry delivery')).toBeTruthy();await click('Retry delivery');await act(async()=>confirm().onConfirm());expect(useStore.getState().update).toHaveBeenCalledOnce()
})
it('offers only chosen routines with an explicit member/version and reuses the request ID after a lost response',async()=>{
  centerCommand.mockRejectedValueOnce(new Error('network')).mockResolvedValue({proposal});await render({own:false,member,canAssign:true});expect(centerTraining).toHaveBeenCalledWith('center1',{memberId:'member1'},false);await click('Choose routine');await click('Propose routines');expect(confirm().message).toContain('Member One');await act(async()=>confirm().onConfirm());expect(useStore.getState().update).not.toHaveBeenCalled();const first=centerCommand.mock.calls[0][1];expect(first.memberVersion).toBe(2);expect(first.bundle.routines.map(row=>row.id)).toEqual(['source']);expect(first.bundle).not.toHaveProperty('active');expect(first.bundle).not.toHaveProperty('planDeliveries');await click('Propose routines');await act(async()=>confirm().onConfirm());expect(centerCommand.mock.calls[1][1].requestId).toBe(first.requestId)
})
it('does not expose staff mutations without training.assign and invalidates old confirmations after capability revocation',async()=>{
  await render({own:false,member,canAssign:false});expect(button('Choose routine')).toBeUndefined();expect(button('Propose routines')).toBeUndefined();await render({own:false,member,canAssign:true});await click('Choose routine');await click('Propose routines');const old=confirm();await render({own:false,member,canAssign:false});await act(async()=>old.onConfirm());expect(centerCommand).not.toHaveBeenCalled()
})
it('explains the account requirement before editing and leaves a clean profile without a discard warning',async()=>{
  const link=vi.fn();await render({own:false,member:{...member,accountLinked:false},canAssign:true,onLinkAccount:link});
  expect(host.textContent).toContain('Link this member to an account before proposing routines.');expect(button('Propose routines')).toBeUndefined();expect(host.querySelector('input')).toBeNull();expect(host.querySelector('aside')).toBeNull();
  await click('Member details');expect(link).toHaveBeenCalledOnce();expect(confirmSheet).not.toHaveBeenCalled();expect(centerCommand).not.toHaveBeenCalled();
  const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);expect(event.defaultPrevented).toBe(false);
})
it('submits existing routines from the shared save action and clears the warning only after confirmed success',async()=>{
  await render({own:false,member,canAssign:true});expect(host.querySelector('aside')).toBeNull();await click('Choose routine');
  expect(host.querySelector('aside button').textContent).toContain('Save form: Training proposals');
  await act(async()=>host.querySelector('aside button').click());expect(centerCommand).not.toHaveBeenCalled();await act(async()=>confirm().onConfirm());
  expect(centerCommand).toHaveBeenCalledWith('/api/centers/training/propose',expect.objectContaining({memberId:member.id,bundle:expect.objectContaining({routines:[expect.objectContaining({id:'source',name:'Push'})]})}));
  expect(host.querySelector('aside')).toBeNull();expect(useStore.getState().update).not.toHaveBeenCalled();
})
it('keeps failed proposals recoverable and cancels their draft so leaving no longer warns',async()=>{
  centerCommand.mockRejectedValueOnce({code:'training-account-required'});await render({own:false,member:{...member,accountLinked:undefined},canAssign:true});await click('Choose routine');await click('Propose routines');await act(async()=>confirm().onConfirm());
  expect(host.textContent).toContain('Link this member to an account before proposing routines.');expect(host.querySelector('aside')).not.toBeNull();
  await click('Cancel');expect(confirm().title).toBe('Discard changes?');await act(async()=>confirm().onConfirm());
  expect(host.querySelector('aside')).toBeNull();expect(button('Cancel')).toBeUndefined();
  const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);expect(event.defaultPrevented).toBe(false);expect(centerCommand).toHaveBeenCalledOnce();
})
it('does not carry another member draft across profile contexts',async()=>{
  await render({own:false,member,canAssign:true});await click('Choose routine');expect(host.querySelector('aside')).not.toBeNull();
  await render({own:false,member:{...member,id:'member2'},canAssign:true});expect(host.querySelector('aside')).toBeNull();expect(button('Propose routines').disabled).toBe(true);
})
it('reviewing an existing proposal without editing is clean',async()=>{
  await render({own:false,member,canAssign:true});await open();expect(host.querySelector('aside')).toBeNull();
  const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);expect(event.defaultPrevented).toBe(false);
})
it('distinguishes account, inactive member and unavailable proposal errors',async()=>{
  const actual=await vi.importActual('../../lib/centers-api.js');
  expect(actual.trainingErrorKey({data:{code:'training-account-required'}})).toBe('Link this member to an account before proposing routines.');
  expect(actual.trainingErrorKey({code:'training-member-inactive'})).toBe('Training proposals require an active member.');
  expect(actual.trainingErrorKey({code:'training-proposal-unavailable'})).toBe('This training proposal is not available. Reload it.');
})
it('invalidates a captured offer confirmation when its draft is cancelled',async()=>{
  await render({own:false,member,canAssign:true});await click('Choose routine');await click('Propose routines');const offer=confirm();
  await click('Cancel');await act(async()=>confirm().onConfirm());await act(async()=>offer.onConfirm());
  expect(centerCommand).not.toHaveBeenCalled();expect(host.querySelector('aside')).toBeNull();
})

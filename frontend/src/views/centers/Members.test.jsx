// @vitest-environment happy-dom
vi.mock('./Passes.jsx',()=>({default:()=>null}))
vi.mock('./Subscriptions.jsx',()=>({default:props=> <div data-member-subscriptions><button onClick={()=>props.receiptCreated({receipt:{id:'issued'}})}>Simulate receipt issued</button></div>}))
vi.mock('./Receipts.jsx',()=>({default:props=> <div data-member-receipts data-reveal={props.revealReceipt?.id} data-can-record={String(props.canRecord)}/>}))
vi.mock('./Payments.jsx',()=>({default:props=> <div data-member-payments data-can-refund={String(props.canRefund)}/>}))
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('./SharedProgress.jsx',()=>({default:()=>null}))
vi.mock('../../lib/i18n.js',()=>({t:(key,...args)=>key.replace(/\{(\d+)\}/g,(_,n)=>args[n])}))
vi.mock('./FreezeRequests.jsx',()=>({default:()=>null}))
vi.mock('../../store/useStore.js',()=>{const state={user:{id:'manager'}};return{useStore:Object.assign(selector=>selector(state),{getState:()=>state})}})
vi.mock('../../lib/centers-api.js',()=>({centerMembers:vi.fn(),centerMember:vi.fn(),centerCommand:vi.fn(),membersErrorKey:()=> 'error',centersMe:vi.fn(),centerInvitations:vi.fn().mockResolvedValue({invites:[]}),invitationErrorKey:()=> 'error'}))
vi.mock('../../sheets.jsx',()=>({confirmSheet:vi.fn(options=>options.onConfirm())}))
import {centerMembers,centerMember,centerCommand} from '../../lib/centers-api.js'
import Members from './Members.jsx'
import {bindUI} from '../../components/ui.jsx'
import {useUI} from '../../store/useUI.js'
bindUI(useUI)
import Guard from './NavigationGuard.jsx'
import {confirmSheet} from '../../sheets.jsx'
import {centerInvitations} from '../../lib/centers-api.js'
globalThis.IS_REACT_ACT_ENVIRONMENT=true
let host,root
const sample={id:'one',name:'Synthetic member',number:'M-000001',version:1,state:'preactive',email:'synthetic@example.test'}
beforeEach(()=>{vi.clearAllMocks();centerMembers.mockResolvedValue({members:[sample],nextCursor:null});centerMember.mockResolvedValue({member:sample});host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(()=>{act(()=>root.unmount());host.remove()})
const render=(centerId='a',capabilities=['members.read','members.manage'])=>act(async()=>{root.render(<Guard contextKey={centerId}><Members key={centerId} centerId={centerId} ownerUid="manager" capabilities={capabilities}/></Guard>);await Promise.resolve()})
const click=text=>act(async()=>{[...host.querySelectorAll('button')].find(button=>button.textContent===text).click();await Promise.resolve()})
const fill=(input,value)=>act(()=>{Object.getOwnPropertyDescriptor(input.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))})
it('explains draft versus inactive CSV requirements and offers details without activating the center',async()=>{
  const onDetails=vi.fn()
  const show=state=>act(async()=>{root.render(<Members centerId="a" ownerUid="manager" capabilities={['members.manage']} active={state==='active'} centerState={state} onDetails={onDetails}/>);await Promise.resolve()})
  await show('draft')
  const csv=[...host.querySelectorAll('button')].find(b=>b.textContent==='Import members (CSV)')
  expect(csv.disabled).toBe(true)
  expect(document.getElementById(csv.getAttribute('aria-describedby')).textContent).toContain('Assign a manager')
  await click('Center details');expect(onDetails).toHaveBeenCalledOnce();expect(centerCommand).not.toHaveBeenCalled()
  await show('inactive');expect(host.textContent).toContain('Activate the center before importing members.')
  expect(host.textContent).not.toContain('Assign a manager to activate')
  await show('active');expect(csv.disabled).toBe(false);expect(csv.hasAttribute('aria-describedby')).toBe(false)
  expect(host.querySelector('.centers-import-notice')).toBeNull()
})
it('replaces each page, counts all results, and returns to the preceding cursor',async()=>{
  centerMembers.mockResolvedValueOnce({members:[sample],total:21,nextCursor:'next'}).mockResolvedValueOnce({members:[{...sample,id:'two',name:'Second member'}],total:21,nextCursor:null}).mockResolvedValueOnce({members:[sample],total:21,nextCursor:'next'})
  await render();expect(host.textContent).toContain('Showing 1–1 of 21');await click('Next page')
  expect(centerMembers).toHaveBeenLastCalledWith('a',{query:'',limit:20,cursor:'next'})
  expect(host.textContent).not.toContain('Synthetic member');expect(host.textContent).toContain('Second member');expect(host.textContent).toContain('Showing 21–21 of 21');await click('Previous page');expect(host.textContent).toContain('Synthetic member');expect(host.textContent).not.toContain('Second member')
})
it('drops a delayed member list from the previously selected center',async()=>{
  let release;centerMembers.mockReturnValueOnce(new Promise(resolve=>{release=resolve})).mockResolvedValueOnce({members:[{...sample,name:'Center B member'}],nextCursor:null})
  await render('a');await render('b');await act(async()=>{release({members:[{...sample,name:'Private center A member'}],nextCursor:null})})
  expect(host.textContent).toContain('Center B member');expect(host.textContent).not.toContain('Private center A member')
})
it('creates a member using a stable request id across failed retries',async()=>{
  centerCommand.mockRejectedValue(new Error('temporary'));await render();await click('New member')
  fill(host.querySelector('input'),'New synthetic member');await click('Save');await click('Save')
  expect(centerCommand).toHaveBeenCalledTimes(2)
  expect(centerCommand.mock.calls[0][0]).toBe('/api/centers/members/create')
  expect(centerCommand.mock.calls[0][1].requestId).toBe(centerCommand.mock.calls[1][1].requestId)
  expect(centerCommand.mock.calls[0][1].name).toBe('New synthetic member')
})
it('trainers can open operational profiles without editing or contact fields',async()=>{
  await render('a',['members.operational.read']);await act(async()=>{host.querySelector('.centers-member-list-card button.lrow').click();await Promise.resolve()})
  expect(host.textContent).toContain('Member details');expect(host.textContent).not.toContain(sample.email)
  expect(host.querySelector('input')).toBeNull();expect(host.textContent).not.toContain('New member')
})
it('the last selected profile wins when detail responses arrive out of order',async()=>{
  const second={...sample,id:'two',name:'Second member'}
  centerMembers.mockResolvedValue({members:[sample,second],nextCursor:null})
  let firstReply,secondReply
  centerMember.mockReturnValueOnce(new Promise(resolve=>{firstReply=resolve})).mockReturnValueOnce(new Promise(resolve=>{secondReply=resolve}))
  await render();await act(async()=>{const buttons=host.querySelectorAll('.centers-member-list-card button.lrow');buttons[0].click();buttons[1].click()})
  await act(async()=>{secondReply({member:second});await Promise.resolve()})
  await act(async()=>{firstReply({member:sample});await Promise.resolve()})
  expect(host.textContent).toContain('Second member');expect(host.textContent).toContain('Member overview');expect(host.querySelector('input')).toBeNull()
})
it('shows a concise overview and mounts only the selected operational section',async()=>{
  await render();await act(async()=>host.querySelector('.centers-member-list-card button.lrow').click());
  expect(host.textContent).toContain('Member overview');expect(host.textContent).toContain(sample.email);
  expect(host.querySelector('form')).toBeNull();expect(centerInvitations).not.toHaveBeenCalled();
  expect(host.textContent).not.toContain('Fees and payments');expect(host.textContent).not.toContain('Training proposals');
  await click('Member details');expect(host.querySelector('input')).toBeNull();
  expect(host.textContent).toContain('Pending activations');expect(centerInvitations).not.toHaveBeenCalled();expect(host.querySelector('form[aria-label="Member details"]')).toBeNull();
  await click('Edit contact details');expect(host.querySelector('form[aria-label="Member details"]')).not.toBeNull();
})
it('protects contact edits on section changes and really discards them only after confirmation',async()=>{
  await render();await act(async()=>host.querySelector('.centers-member-list-card button.lrow').click());await click('Member details');await click('Edit contact details');
  fill(host.querySelector('input'), 'Unsaved name');
  confirmSheet.mockImplementationOnce(()=>{});await click('Access and membership');
  expect(host.querySelector('input').value).toBe('Unsaved name');expect(confirmSheet.mock.calls.at(-1)[0].title).toBe('Discard changes?');
  await act(async()=>confirmSheet.mock.calls.at(-1)[0].onConfirm());
  expect(host.querySelector('form[aria-label="Member details"]')).toBeNull();expect(host.querySelector('aside')).toBeNull();
  await click('Member details');await click('Edit contact details');expect(host.querySelector('input').value).toBe(sample.name);
})
it('updates the profile state after an affiliation change and uses its latest version for contact edits',async()=>{
  const active={...sample,state:'active'},history={today:'2026-10-13',changes:[]};
  centerMembers.mockResolvedValue({members:[active],nextCursor:null});centerMember.mockResolvedValue({member:active,...history});
  centerCommand.mockResolvedValueOnce({member:{...active,state:'frozen',version:2},...history}).mockResolvedValueOnce({member:{...active,name:'Saved contact',state:'frozen',version:3}});
  await render();await act(async()=>host.querySelector('.centers-member-list-card button.lrow').click());await click('Access and membership');
  fill(host.querySelector('textarea'),'Synthetic pause');await click('Freeze membership');
  expect(host.querySelector('.centers-member-status').textContent).toBe('Frozen member');
  await click('Member details');await click('Edit contact details');fill(host.querySelector('input'),'Saved contact');await click('Save');
  expect(centerCommand.mock.calls[1][1]).toMatchObject({name:'Saved contact',version:2});
  expect(host.querySelector('.centers-member-header h2').textContent).toBe('Saved contact');expect(host.querySelector('form[aria-label="Member details"]')).toBeNull();expect(host.querySelector('aside')).toBeNull();
})

it('opens cash management only in its section and preserves separate recording and refund capabilities',async()=>{
  await render('a',['members.manage','billing.manage']);await act(async()=>host.querySelector('.centers-member-list-card button.lrow').click());
  expect(host.querySelector('[data-member-receipts]')).toBeNull();await click('Fees and payments');
  expect(host.querySelector('[data-member-subscriptions]')).not.toBeNull();
  expect(host.querySelector('[data-member-receipts]').dataset.canRecord).toBe('false');expect(host.querySelector('[data-member-payments]').dataset.canRefund).toBe('false');
  await render('b',['members.manage','billing.manage','payments.record']);await act(async()=>host.querySelector('.centers-member-list-card button.lrow').click());await click('Fees and payments');
  expect(host.querySelector('[data-member-receipts]').dataset.canRecord).toBe('true');expect(host.querySelector('[data-member-payments]').dataset.canRefund).toBe('false');
  await click('Simulate receipt issued');expect(host.querySelector('[data-member-receipts]').dataset.reveal).toBe('issued');
})
it('shows each member ID once while preserving different people with the same name',async()=>{
 centerMembers.mockResolvedValue({members:[sample,{...sample},{...sample,id:'two',number:'M-000002'}],nextCursor:null});await render();expect(host.querySelectorAll('.centers-member-list-card')).toHaveLength(2);expect(host.textContent).toContain('M-000001');expect(host.textContent).toContain('M-000002');
})

it('keeps the current page after returning from a member profile',async()=>{
 centerMembers.mockResolvedValueOnce({members:[sample],total:21,nextCursor:'next'}).mockResolvedValue({members:[{...sample,id:'two',name:'Second member'}],total:21,nextCursor:null});
 await render();await click('Next page');await act(async()=>host.querySelector('.centers-member-list-card button').click());await click('Back to members');expect(centerMembers).toHaveBeenLastCalledWith('a',{query:'',limit:20,cursor:'next'});expect(host.textContent).toContain('Second member');
})
it('a changed search returns to the first server page and does not filter loaded rows',async()=>{
 centerMembers.mockResolvedValueOnce({members:[sample],total:21,nextCursor:'next'}).mockResolvedValue({members:[{...sample,id:'two',name:'Second member'}],total:21,nextCursor:null});
 await render();await click('Next page');vi.useFakeTimers();fill(host.querySelector('input'),'12345678Z');await act(async()=>vi.advanceTimersByTimeAsync(300));expect(centerMembers).toHaveBeenLastCalledWith('a',{query:'12345678Z',limit:20});vi.useRealTimers();
})

it('filters restart at page one and stay in server requests, with financial filters restricted by capability',async()=>{
 centerMembers.mockResolvedValueOnce({members:[sample],total:21,nextCursor:'next'}).mockResolvedValue({members:[sample],total:21,nextCursor:null});
 await render('a',['members.read','members.manage','billing.read']);await click('Next page');
 const choose=async(title,label)=>{
   const row=[...host.querySelectorAll('.members-directory-filters .lrow')].find(r=>r.querySelector('.lrow-t')?.textContent===title);await act(async()=>row.click());
   const sheet=useUI.getState().sheets.at(-1),box=document.createElement('div');document.body.append(box);const sheetRoot=createRoot(box);
   await act(async()=>sheetRoot.render(sheet.render(()=>useUI.getState().closeAll())));
   await act(async()=>[...box.querySelectorAll('.lrow')].find(r=>r.querySelector('.lrow-t')?.textContent===label).click());act(()=>sheetRoot.unmount());box.remove();
 };
 await choose('Account link','No linked account');expect(centerMembers).toHaveBeenLastCalledWith('a',{query:'',limit:20,account:'unlinked'});
 await choose('Fee status','Expired fee');expect(centerMembers).toHaveBeenLastCalledWith('a',{query:'',limit:20,account:'unlinked',feeStatus:'expired'});
 await render('b',['members.operational.read']);expect(host.querySelector('.members-directory-filters').textContent).not.toContain('Fee status');expect(host.querySelector('.members-directory-filters').textContent).not.toContain('Account link');
})

it('returns to an existing page when editing removes the last result from the current page',async()=>{
 centerMembers.mockResolvedValueOnce({members:[sample],total:21,nextCursor:'next'}).mockResolvedValueOnce({members:[{...sample,id:'two',name:'Last result'}],total:21,nextCursor:null}).mockResolvedValueOnce({members:[],total:20,nextCursor:null}).mockResolvedValue({members:[sample],total:20,nextCursor:null});
 await render();await click('Next page');await act(async()=>host.querySelector('.centers-member-list-card button').click());await click('Back to members');expect(centerMembers).toHaveBeenLastCalledWith('a',{query:'',limit:20});expect(host.textContent).toContain('Synthetic member');
})

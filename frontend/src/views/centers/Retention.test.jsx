// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('../../lib/i18n.js',()=>({t:key=>key}))
vi.mock('../../lib/centers-api.js',()=>({centerRetention:vi.fn(),centerCommand:vi.fn(),retentionErrorKey:e=>e?.code||'error'}))
vi.mock('../../store/useStore.js',()=>{const state={user:{id:'manager'}};return {useStore:Object.assign(selector=>selector(state),{getState:()=>state})}})
vi.mock('../../store/useCenters.js',()=>({useCenters:{getState:()=>({revokeOn:vi.fn()})}}))
vi.mock('../../sheets.jsx',()=>({confirmSheet:vi.fn()}))
import {centerRetention,centerCommand} from '../../lib/centers-api.js'
import {useUI} from '../../store/useUI.js'
import {bindUI} from '../../components/ui.jsx'
import {confirmSheet} from '../../sheets.jsx'
import Retention from './Retention.jsx'
globalThis.IS_REACT_ACT_ENVIRONMENT=true
const alert={id:'ra_one',memberId:'m_one',name:'Fictional member',number:'M-000001',lastVisitOn:null,daysWithoutVisit:20,neverVisited:true}
const page=(extra={})=>({policy:{enabled:false,daysWithoutVisit:null,includeNeverVisited:false,version:0},today:'2026-10-16',timezone:'Europe/Madrid',active:true,view:'open',items:[],nextCursor:null,...extra})
let host,root
function Sheets(){return useUI(s=>s.sheets).map(sheet=><section key={sheet.id}>{sheet.render(()=>useUI.getState().closeSheet(sheet.id))}</section>)}
beforeEach(()=>{vi.clearAllMocks();useUI.getState().closeAll();bindUI(useUI);centerRetention.mockResolvedValue(page());centerCommand.mockResolvedValue({});host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(()=>{act(()=>{root.unmount();useUI.getState().closeAll()});host.remove()})
const render=(extra={})=>act(async()=>{root.render(<><Retention centerId="a" ownerUid="manager" {...extra}/><Sheets/></>);await Promise.resolve()})
const button=text=>[...host.querySelectorAll('button')].find(node=>node.textContent===text)
const click=text=>act(async()=>{button(text).click();await Promise.resolve()})
const fill=(input,value)=>act(()=>{Object.getOwnPropertyDescriptor(input.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))})
const row=text=>[...host.querySelectorAll('button.lrow')].find(node=>node.querySelector('.lrow-t')?.textContent===text)
it('keeps the rule off and threshold empty until explicit configuration and confirmation',async()=>{
  await render();expect(host.textContent).toContain('Inactivity alerts are disabled until you configure a rule.');await click('Configure inactivity alerts');const threshold=host.querySelector('input');expect(threshold.value).toBe('');await act(async()=>host.querySelector('button[role=switch]').click());expect(button('Save').disabled).toBe(true);fill(threshold,'7');await click('Save');expect(centerCommand).not.toHaveBeenCalled();expect(confirmSheet.mock.calls[0][0].message).toContain('7');await act(async()=>confirmSheet.mock.calls[0][0].onConfirm());expect(centerCommand.mock.calls[0]).toEqual(['/api/centers/retention/policy',expect.objectContaining({centerId:'a',version:0,fields:{enabled:true,daysWithoutVisit:7,includeNeverVisited:false}})]);
})
it('records a chosen outcome only after confirmation and preserves retry identity',async()=>{
  centerRetention.mockResolvedValue(page({policy:{enabled:true,daysWithoutVisit:7,includeNeverVisited:true,version:2},items:[alert]}));centerCommand.mockRejectedValueOnce({code:'network'}).mockResolvedValue({});await render();await click('Review notice');expect(button('Record retention review').disabled).toBe(true);await act(async()=>row('Review outcome').click());await act(async()=>row('Contact recorded').click());await click('Record retention review');expect(centerCommand).not.toHaveBeenCalled();expect(confirmSheet.mock.calls[0][0].message).toContain('Recording a contact does not send a message.');await act(async()=>confirmSheet.mock.calls[0][0].onConfirm());await click('Record retention review');await act(async()=>confirmSheet.mock.calls[1][0].onConfirm());expect(centerCommand.mock.calls[0][1]).toMatchObject({centerId:'a',memberId:'m_one',alertId:'ra_one',policyVersion:2,outcome:'contacted',note:null});expect(centerCommand.mock.calls[1][1].requestId).toBe(centerCommand.mock.calls[0][1].requestId);
})
it('requires a dismissal reason and invalidates edited or cross-center confirmations',async()=>{
  centerRetention.mockResolvedValue(page({policy:{enabled:true,daysWithoutVisit:7,includeNeverVisited:true,version:1},items:[alert]}));await render();await click('Review notice');await act(async()=>row('Review outcome').click());await act(async()=>row('Dismissed').click());expect(button('Record retention review').disabled).toBe(true);fill(host.querySelector('textarea'),'First reason');await click('Record retention review');fill(host.querySelector('textarea'),'Changed reason');await act(async()=>confirmSheet.mock.calls[0][0].onConfirm());expect(centerCommand).not.toHaveBeenCalled();await click('Record retention review');await render({centerId:'b'});await act(async()=>confirmSheet.mock.calls[1][0].onConfirm());expect(centerCommand).not.toHaveBeenCalled();
})
it('uses actual cursors and renders historical notes as inert text',async()=>{
  centerRetention.mockResolvedValueOnce(page({policy:{enabled:true,daysWithoutVisit:7,includeNeverVisited:true,version:1},items:[alert],nextCursor:'more'})).mockResolvedValueOnce(page({policy:{enabled:true,daysWithoutVisit:7,includeNeverVisited:true,version:1},items:[{...alert,id:'two',memberId:'m_two',name:'Second member'}]}));await render();await click('Show more');expect(centerRetention).toHaveBeenLastCalledWith('a',{view:'open',cursor:'more'});expect(host.textContent).toContain('Second member');
  centerRetention.mockResolvedValue(page({view:'history',items:[{id:'ra_done',memberId:'m_one',name:'Fictional member',number:'M-000001',outcome:'reviewed',note:'<script>private()</script>',createdAt:'2026-10-15T12:00:00Z'}]}));await click('Review history');expect(host.textContent).toContain('<script>private()</script>');expect(host.querySelector('script')).toBeNull();expect(button('Review notice')).toBeUndefined();
})

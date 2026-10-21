// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('../../lib/i18n.js',()=>({t:key=>key}))
vi.mock('../../lib/centers-api.js',()=>({centerProgressShare:vi.fn(),centerSharedProgress:vi.fn(),centerCommand:vi.fn(),progressErrorKey:e=>e?.code||'error'}))
vi.mock('../../store/useStore.js',()=>{const state={user:{id:'owner'},S:{routines:[{id:'one',name:'Chosen routine'},{id:'secret',name:'PRIVATE routine'}]},syncNow:vi.fn().mockResolvedValue()};return {useStore:Object.assign(selector=>selector(state),{getState:()=>state})}})
vi.mock('../../store/useCenters.js',()=>({useCenters:{getState:()=>({revokeOn:vi.fn()})}}))
vi.mock('../../sheets.jsx',()=>({confirmSheet:vi.fn()}))
import {centerProgressShare,centerSharedProgress,centerCommand} from '../../lib/centers-api.js'
import {useStore} from '../../store/useStore.js'
import {useUI} from '../../store/useUI.js'
import {bindUI} from '../../components/ui.jsx'
import {confirmSheet} from '../../sheets.jsx'
import SharedProgress from './SharedProgress.jsx'
globalThis.IS_REACT_ACT_ENVIRONMENT=true
const initial=()=>({share:{enabled:false,routineIds:[],from:null,to:null,version:0},today:'2026-10-15',canEnable:true})
let root,host
function Sheets(){return useUI(s=>s.sheets).map(sheet=><section key={sheet.id}>{sheet.render(()=>useUI.getState().closeSheet(sheet.id))}</section>)}
beforeEach(()=>{vi.clearAllMocks();useStore.getState().user={id:'owner'};useUI.getState().closeAll();bindUI(useUI);centerProgressShare.mockResolvedValue(initial());centerSharedProgress.mockResolvedValue({shared:false});centerCommand.mockResolvedValue({share:{enabled:true,routineIds:['one'],from:'2026-10-15',to:'2026-10-15',version:1}});host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(()=>{act(()=>{root.unmount();useUI.getState().closeAll()});host.remove()})
const render=(props={})=>act(async()=>{root.render(<><SharedProgress centerId="a" ownerUid="owner" centerName="Center A" own {...props}/><Sheets/></>);await Promise.resolve()})
const button=text=>[...host.querySelectorAll('button')].find(node=>node.textContent===text)
const click=text=>act(async()=>{button(text).click();await Promise.resolve()})
const fill=(input,value)=>act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))})
const row=text=>[...host.querySelectorAll('button.lrow')].find(node=>node.querySelector('.lrow-t')?.textContent===text)
async function choose(){await act(async()=>row('Routines to share').click());await act(async()=>row('Chosen routine').click());await click('Done')}
it('shares only after explicit confirmation and sync, preserves retries and includes the selected center/date scope',async()=>{
  centerCommand.mockRejectedValueOnce({code:'network'}).mockResolvedValue({share:{enabled:true,routineIds:['one'],from:'2026-10-15',to:'2026-10-15',version:1}});await render();expect(button('Share selected progress').disabled).toBe(true);await choose();await click('Share selected progress');expect(centerCommand).not.toHaveBeenCalled();expect(confirmSheet.mock.calls[0][0].message).toContain('Center A');expect(confirmSheet.mock.calls[0][0].message).toContain('Chosen routine');
  await act(async()=>confirmSheet.mock.calls[0][0].onConfirm());await click('Share selected progress');await act(async()=>confirmSheet.mock.calls[1][0].onConfirm());expect(useStore.getState().syncNow).toHaveBeenCalledTimes(2);expect(centerCommand.mock.calls[0][1]).toMatchObject({centerId:'a',version:0,fields:{enabled:true,routineIds:['one'],from:'2026-10-15',to:'2026-10-15'}});expect(centerCommand.mock.calls[1][1].requestId).toBe(centerCommand.mock.calls[0][1].requestId);expect(button('Stop sharing progress')).toBeDefined();
})
it('revokes even when enabling is unavailable without needing profile sync',async()=>{
  centerProgressShare.mockResolvedValue({share:{enabled:true,routineIds:['one'],from:'2026-10-01',to:'2026-10-15',version:3},today:'2026-10-15',canEnable:false});centerCommand.mockResolvedValue({share:{enabled:false,routineIds:[],from:null,to:null,version:4}});await render();expect(button('Share selected progress').disabled).toBe(true);await click('Stop sharing progress');expect(confirmSheet.mock.calls[0][0].danger).toBe(true);await act(async()=>confirmSheet.mock.calls[0][0].onConfirm());expect(useStore.getState().syncNow).not.toHaveBeenCalled();expect(centerCommand.mock.calls[0][1]).toMatchObject({version:3,fields:{enabled:false}});
})
it('invalidates changed confirmations and drops responses after a center/account switch',async()=>{
  await render();await choose();await click('Share selected progress');fill(host.querySelector('input[type=date]'),'2026-10-01');await act(async()=>confirmSheet.mock.calls[0][0].onConfirm());expect(centerCommand).not.toHaveBeenCalled();
  let release;centerProgressShare.mockImplementationOnce(()=>new Promise(resolve=>release=resolve));await render({centerId:'b'});await render({centerId:'c'});await act(async()=>release({...initial(),share:{...initial().share,enabled:true,routineIds:['secret']}}));expect(button('Stop sharing progress')).toBeUndefined();
})
it('staff sees no consent controls or private routines and only renders the aggregate projection',async()=>{
  await render({own:false,member:{id:'member'}});expect(host.textContent).toContain('This member is not sharing training progress with this center.');expect(host.textContent).not.toContain('PRIVATE');expect(button('Share selected progress')).toBeUndefined();
  centerSharedProgress.mockResolvedValue({shared:true,report:{period:{from:'2026-10-01',to:'2026-10-15'},routines:[{name:'Selected routine',sessions:2,days:1,lastSessionOn:'2026-10-15',weeks:[{from:'2026-10-12',sessions:2}]}]}});await click('Reload centers');expect(host.textContent).toContain('Saved sessions');expect(host.textContent).toContain('Selected routine');expect(host.textContent).not.toContain('PRIVATE');expect(centerSharedProgress).toHaveBeenLastCalledWith('a','member');
})

// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('../../lib/i18n.js',()=>({t:key=>key}))
vi.mock('../../lib/centers-api.js',()=>({centerPasses:vi.fn(),centerPassProducts:vi.fn(),centerCommand:vi.fn(),passesErrorKey:e=>e?.code||'error'}))
vi.mock('../../store/useStore.js',()=>({useStore:{getState:()=>({user:{id:'manager'}})}}))
vi.mock('../../store/useCenters.js',()=>({useCenters:{getState:()=>({revokeOn:vi.fn()})}}))
vi.mock('../../sheets.jsx',()=>({confirmSheet:vi.fn()}))
import {centerPasses,centerPassProducts,centerCommand} from '../../lib/centers-api.js'
import {useUI} from '../../store/useUI.js'
import {bindUI} from '../../components/ui.jsx'
import {confirmSheet} from '../../sheets.jsx'
import Passes from './Passes.jsx'
import PassProducts from './PassProducts.jsx'
import ChargeBreakdown from './ChargeBreakdown.jsx'
globalThis.IS_REACT_ACT_ENVIRONMENT=true
const product={id:'p',name:'Fictional pack',kind:'paid',credits:3,validDays:30,totalMinor:'1210',priceMinor:'1000',priceIncludesTax:false,taxBasisPoints:2100,version:1,archived:false}
const pass={id:'b',name:product.name,credits:3,remaining:2,startsOn:'2026-10-16',endsOn:'2026-11-15',canUse:true,available:true,revoked:false}
let root,host
function Sheets(){return useUI(s=>s.sheets).map(sheet=><section key={sheet.id}>{sheet.render(()=>useUI.getState().closeSheet(sheet.id))}</section>)}
beforeEach(()=>{vi.clearAllMocks();useUI.getState().closeAll();bindUI(useUI);centerPasses.mockResolvedValue({passes:[],nextCursor:null});centerPassProducts.mockResolvedValue({products:[product],nextCursor:null});host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(()=>{act(()=>{root.unmount();useUI.getState().closeAll()});host.remove()})
const render=extra=>act(async()=>{root.render(<><Passes centerId="a" ownerUid="manager" memberId="m" today="2026-10-16" {...extra}/><Sheets/></>);await Promise.resolve()})
const button=text=>[...host.querySelectorAll('button')].find(n=>n.textContent===text)
const row=text=>[...host.querySelectorAll('button.lrow')].find(n=>n.querySelector('.lrow-t')?.textContent===text)
const click=text=>act(async()=>{button(text).click();await Promise.resolve()})
const fill=(input,value)=>act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))})
it('quotes before assignment, confirms exact terms and retries a lost purchase with the same key',async()=>{
  centerCommand.mockResolvedValueOnce({quote:{memberName:'Fictional member',product,startsOn:'2026-10-16',endsOn:'2026-11-15'},quoteHash:'hash'}).mockRejectedValueOnce({code:'network'}).mockResolvedValue({pass});await render();await click('Assign pass');await act(async()=>row('Pass product').click());await act(async()=>row('Fictional pack · 3 Pass credits · 30 Pass validity days · 12.10 EUR').click());await click('Preview pass purchase');await click('Assign pass');expect(centerCommand).toHaveBeenCalledTimes(1);expect(confirmSheet.mock.calls[0][0].message).toContain('12.10 EUR');expect(confirmSheet.mock.calls[0][0].message).toContain('2026-11-15');await act(async()=>confirmSheet.mock.calls[0][0].onConfirm());await click('Assign pass');await act(async()=>confirmSheet.mock.calls[1][0].onConfirm());expect(centerCommand.mock.calls[2][1].requestId).toBe(centerCommand.mock.calls[1][1].requestId);expect(centerCommand.mock.calls[1][1]).toMatchObject({centerId:'a',memberId:'m',productId:'p',startsOn:'2026-10-16',quoteHash:'hash'});
})
it('rejects a stale confirmation after changing the date or center',async()=>{
  centerCommand.mockResolvedValue({quote:{memberName:'Member',product,startsOn:'2026-10-16',endsOn:'2026-11-15'},quoteHash:'hash'});await render();await click('Assign pass');await act(async()=>row('Pass product').click());await act(async()=>row('Fictional pack · 3 Pass credits · 30 Pass validity days · 12.10 EUR').click());await click('Preview pass purchase');await click('Assign pass');fill(host.querySelector('input[type=date]'),'2026-10-17');await act(async()=>confirmSheet.mock.calls[0][0].onConfirm());expect(centerCommand).toHaveBeenCalledTimes(1);await render({centerId:'other'});await act(async()=>confirmSheet.mock.calls[0][0].onConfirm());expect(centerCommand).toHaveBeenCalledTimes(1);
})
it('own selection uses only usable passes and real cursor pagination; never assigns or revokes',async()=>{
  const select=vi.fn();centerPasses.mockResolvedValueOnce({passes:[pass,{...pass,id:'unpaid',name:'Unpaid',canUse:false,available:false}],nextCursor:'next'}).mockResolvedValueOnce({passes:[{...pass,id:'next',name:'Later pack'}],nextCursor:null});await render({own:true,memberId:undefined,onSelect:select});expect(button('Assign pass')).toBeUndefined();expect(button('Revoke pass')).toBeUndefined();await act(async()=>row('Access entitlement').click());expect(host.textContent).not.toContain('Unpaid ·');await act(async()=>row('Fictional pack · 2 Credits remaining').click());expect(select).toHaveBeenLastCalledWith(pass);await click('Show more');expect(centerPasses).toHaveBeenLastCalledWith('a',{cursor:'next'},true);expect(host.textContent).toContain('Later pack');
})
it('revocation requires a reason and explicitly does not refund',async()=>{
  centerPasses.mockResolvedValue({passes:[pass],nextCursor:null});centerCommand.mockResolvedValue({});await render();await click('Revoke pass');expect([...host.querySelectorAll('button')].filter(n=>n.textContent==='Revoke pass').at(-1).disabled).toBe(true);fill(host.querySelector('input'),'Fictional duplicate');await act(async()=>[...host.querySelectorAll('button')].filter(n=>n.textContent==='Revoke pass').at(-1).click());expect(confirmSheet.mock.calls[0][0].message).toContain('Revoking a pass does not issue a refund.');await act(async()=>confirmSheet.mock.calls[0][0].onConfirm());expect(centerCommand).toHaveBeenCalledWith('/api/centers/passes/revoke',expect.objectContaining({centerId:'a',id:'b',reason:'Fictional duplicate'}));
})
it('catalogue leaves commercial terms unset and preserves acquired packs when archiving',async()=>{
  await act(async()=>{root.render(<PassProducts centerId="a" ownerUid="manager"/>);await Promise.resolve()});await click('Archive pass product');expect(confirmSheet.mock.calls[0][0].message).toContain('Purchased passes keep their original terms.');await click('Create pass product');expect(host.querySelector('input').value).toBe('');expect(button('Save').disabled).toBe(true);
})
it('pass receipts show exact amounts without fabricated monthly proration',()=>{
  act(()=>root.render(<ChargeBreakdown quote={{concept:'pass',name:'Fictional pass',credits:3,startsOn:'2026-10-16',periodEnd:'2026-11-15',netMinor:'1000',taxMinor:'210',totalMinor:'1210',currency:'EUR'}}/>));expect(host.textContent).toContain('12.10 EUR');expect(host.textContent).not.toContain('Billable days');expect(host.textContent).not.toContain('undefined');
})

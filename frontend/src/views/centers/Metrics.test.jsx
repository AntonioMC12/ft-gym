// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('../../lib/i18n.js',()=>({t:key=>key}))
vi.mock('../../lib/centers-api.js',()=>({centerMetrics:vi.fn(),metricsErrorKey:()=> 'Metrics error'}))
vi.mock('../../store/useStore.js',()=>{const state={user:{id:'actor'},S:{routines:[]}};return {useStore:{getState:()=>state}}})
vi.mock('../../store/useCenters.js',()=>({useCenters:{getState:()=>({revokeOn:vi.fn()})}}))
import {centerMetrics} from '../../lib/centers-api.js'
import {useStore} from '../../store/useStore.js'
import Metrics from './Metrics.jsx'
globalThis.IS_REACT_ACT_ENVIRONMENT=true
let root,host
const report={definitionVersion:1,currency:'EUR',capturedAt:'2026-10-15T10:00:00Z',centerCount:'105',period:{from:'2026-10-01',to:'2026-10-15',registeredMembers:'3',activations:'2',terminations:'1',receiptsIssued:'2',receiptTotalMinor:'9007199254740993',collectionsMinor:'100',refundsMinor:'150',netCollectionsMinor:'-50'},current:{members:'12',active:'8',frozen:'2',ended:'1',preactive:'1',subscriptions:'10',outstandingMinor:'1650',overdueMinor:null,overduePolicyComplete:false}}
beforeEach(()=>{vi.clearAllMocks();useStore.getState().user={id:'actor'};centerMetrics.mockResolvedValue(structuredClone(report));host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(()=>{act(()=>root.unmount());host.remove()})
const render=(props={})=>act(async()=>{root.render(<Metrics centerId="center1" ownerUid="actor" {...props}/>);await Promise.resolve()})
const button=label=>[...host.querySelectorAll('button')].find(node=>node.textContent===label)
const fill=(input,value)=>act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))})
it('renders exact cents and negative net flows separately from current balances without personal-state writes',async()=>{
  const before=structuredClone(useStore.getState().S);await render();expect(centerMetrics).toHaveBeenCalledWith('center1',{},false);expect(host.textContent).toContain('90071992547409.93 EUR');expect(host.textContent).toContain('−0.50 EUR');expect(host.textContent).toContain('16.50 EUR');expect(host.textContent).toContain('Not configured');expect(host.textContent).not.toContain('occupancy');expect(useStore.getState().S).toEqual(before)
})
it('loads only the selected public period and asks the parent to preserve it in router history',async()=>{
  const onPeriod=vi.fn();await render({period:{from:'2026-09-01',to:'2026-09-30'},onPeriod});expect(centerMetrics).toHaveBeenCalledWith('center1',{from:'2026-09-01',to:'2026-09-30'},false);const fields=host.querySelectorAll('input');await fill(fields[0],'2026-08-01');await fill(fields[1],'2026-08-31');await act(async()=>button('Apply').click());expect(onPeriod).toHaveBeenCalledWith({from:'2026-08-01',to:'2026-08-31'});expect(centerMetrics).toHaveBeenCalledOnce()
})
it('uses the global scope explicitly and drops responses for a center/account that is no longer open',async()=>{
  let release;centerMetrics.mockReturnValueOnce(new Promise(resolve=>release=resolve));await render();await render({centerId:undefined,global:true});expect(centerMetrics).toHaveBeenLastCalledWith(undefined,{},true);await act(async()=>release({...report,current:{...report.current,outstandingMinor:'999999'}}));expect(host.textContent).not.toContain('9999.99 EUR');expect(host.textContent).toContain('105');useStore.getState().user={id:'other'};await act(async()=>root.render(<div>Other account</div>));expect(host.textContent).toBe('Other account')
})
it('rejects an incomplete date selection without issuing a different report',async()=>{
  await render();await fill(host.querySelectorAll('input')[0],'');await act(async()=>button('Apply').click());expect(centerMetrics).toHaveBeenCalledOnce();expect(host.textContent).toContain('Metrics error')
})

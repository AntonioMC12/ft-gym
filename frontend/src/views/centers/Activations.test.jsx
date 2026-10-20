// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('../../lib/i18n.js',()=>({t:key=>key}))
vi.mock('../../store/useStore.js',()=>{const state={user:{id:'manager'}};return {useStore:Object.assign(fn=>fn(state),{getState:()=>state})}})
vi.mock('../../store/useCenters.js',()=>({useCenters:{getState:()=>({revokeOn:vi.fn()})}}))
vi.mock('../../lib/api.js',()=>({api:vi.fn()}))
vi.mock('../../lib/centers-api.js',()=>({centerMembers:vi.fn(),centerCommand:vi.fn(),centersErrorKey:()=> 'error'}))
vi.mock('../../sheets.jsx',()=>({confirmSheet:vi.fn()}))
vi.mock('../../lib/mobile.js',()=>({MOBILE:false}))
import {api} from '../../lib/api.js'
import {centerMembers,centerCommand} from '../../lib/centers-api.js'
import {confirmSheet} from '../../sheets.jsx'
import Activations from './Activations.jsx'
let host,root
const pending={id:'r1',version:1,name:'Account A',accountUid:'u1',email:'a@example.test'},member={id:'m1',version:3,name:'Imported member',number:'M-001',accountLinked:false}
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.clearAllMocks();vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});api.mockResolvedValue({requests:[pending],nextCursor:null});centerMembers.mockResolvedValue({members:[member,{...member,id:'linked',name:'Already linked',accountLinked:true}],nextCursor:null});host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers()})
const show=async(centerId='c1')=>{await act(async()=>root.render(<Activations centerId={centerId} ownerUid="manager"/>));await act(async()=>vi.advanceTimersByTimeAsync(1))}
const click=text=>act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent.includes(text)).click())
it('lists pending accounts and unlinked members; requires an explicit identity confirmation with the selected version',async()=>{
 await show();expect(host.textContent).toContain('Account A');await click('Account A');await act(async()=>vi.advanceTimersByTimeAsync(1));expect(host.textContent).toContain('Imported member');expect(host.textContent).not.toContain('Already linked');expect([...host.querySelectorAll('button')].find(b=>b.textContent==='Link and activate').disabled).toBe(true);await click('Imported member');await click('Link and activate');expect(centerCommand).not.toHaveBeenCalled();const confirmation=confirmSheet.mock.calls.at(-1)[0];expect(confirmation.message).toContain('Account A');expect(confirmation.message).toContain('a@example.test → Imported member');centerCommand.mockResolvedValue({status:'approved'});await act(async()=>confirmation.onConfirm());expect(centerCommand).toHaveBeenCalledWith('/api/centers/activations/decide',expect.objectContaining({centerId:'c1',id:'r1',memberId:'m1',memberVersion:3}));expect(centerCommand.mock.calls).toHaveLength(1)
})
it('does not apply an old confirmation after switching centers',async()=>{
 await show();await click('Account A');await act(async()=>vi.advanceTimersByTimeAsync(1));await click('Imported member');await click('Link and activate');const confirmation=confirmSheet.mock.calls.at(-1)[0];await show('c2');await act(async()=>confirmation.onConfirm());expect(centerCommand).not.toHaveBeenCalled()
})
it('keeps the search input and focus while filtering accounts with stale-response protection',async()=>{
 await show();const input=host.querySelector('input');input.focus();const fill=value=>act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))});fill('A');fill('Ac');expect(input.readOnly).toBe(false);expect(document.activeElement).toBe(input);await act(async()=>vi.advanceTimersByTimeAsync(300));expect(host.querySelector('input')).toBe(input);expect(document.activeElement).toBe(input);expect(api.mock.calls.at(-1)[0]).toContain('query=Ac')
})

it('shows at most five unlinked records and searches the directory without losing input focus or selection',async()=>{
 const records=Array.from({length:12},(_,i)=>({...member,id:'m'+i,name:'Record '+i}))
 centerMembers.mockResolvedValue({members:records,nextCursor:'next-page'})
 await show();await click('Account A');await act(async()=>vi.advanceTimersByTimeAsync(1))
 expect(centerMembers).toHaveBeenLastCalledWith('c1',{query:'',unlinked:'true',limit:5})
 expect(host.querySelectorAll('.training-link-editor .centers-entity-row')).toHaveLength(5)
 expect(host.textContent).not.toContain('Record 5')
 expect(host.textContent).not.toContain('Show more')
 await click('Record 0')
 const input=host.querySelector('input[aria-label="Search members"]');input.focus()
 centerMembers.mockResolvedValue({members:[{...member,id:'m11',name:'Record 11'}],nextCursor:null})
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Record 11');input.dispatchEvent(new Event('input',{bubbles:true}));await vi.advanceTimersByTimeAsync(300)})
 expect(centerMembers).toHaveBeenLastCalledWith('c1',{query:'Record 11',unlinked:'true',limit:5})
 expect(document.activeElement).toBe(input)
 expect(host.querySelector('input[aria-label="Search members"]')).toBe(input)
 expect(host.textContent).toContain('Record 11')
 await click('Link and activate')
 expect(confirmSheet.mock.calls.at(-1)[0].message).toContain('Record 0')
})

it('shows only the unique document match with explicit selection and never loads unrelated members',async()=>{
 api.mockResolvedValue({requests:[{...pending,documentMatch:'unique',matchedMember:member}],nextCursor:null})
 await show();await click('Account A');await act(async()=>vi.advanceTimersByTimeAsync(1))
 expect(centerMembers).not.toHaveBeenCalled();expect(host.querySelector('input[aria-label="Search members"]')).toBeNull()
 expect(host.querySelectorAll('.training-link-editor .centers-entity-row')).toHaveLength(1)
 expect(host.textContent).toContain('One member matches this DNI or NIE.')
 await click('Imported member');await click('Link and activate');expect(confirmSheet.mock.calls.at(-1)[0].message).toContain('Imported member')
})
it.each(['duplicate','linked'])('does not offer activation for a %s document match',async documentMatch=>{
 api.mockResolvedValue({requests:[{...pending,documentMatch,matchedMember:null}],nextCursor:null})
 await show();await click('Account A');await act(async()=>vi.advanceTimersByTimeAsync(1))
 expect(centerMembers).not.toHaveBeenCalled();expect(host.querySelector('input[aria-label="Search members"]')).toBeNull()
 expect([...host.querySelectorAll('button')].find(b=>b.textContent==='Link and activate').disabled).toBe(true)
 expect(host.querySelector('.training-link-editor [role=status]')).not.toBeNull()
})

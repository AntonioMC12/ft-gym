// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {it,expect,beforeEach,afterEach,vi} from 'vitest'
vi.mock('../../lib/i18n.js',()=>({t:key=>key}))
vi.mock('../../lib/centers-api.js',()=>({centerAccounts:vi.fn(),centersErrorKey:()=> 'Directory unavailable'}))
vi.mock('../../store/useStore.js',()=>{const state={user:{id:'root'}};return {useStore:Object.assign(selector=>selector(state),{getState:()=>state})}})
vi.mock('../../store/useCenters.js',()=>({useCenters:{getState:()=>({revokeOn:vi.fn()})}}))
import {centerAccounts} from '../../lib/centers-api.js'
import {useStore} from '../../store/useStore.js'
import AccountPicker from './AccountPicker.jsx'
globalThis.IS_REACT_ACT_ENVIRONMENT=true
let root,host,choose
const account={id:'u1',name:'Available account',disabled:false}
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();useStore.getState().user={id:'root'};choose=vi.fn();centerAccounts.mockResolvedValue({accounts:[account],nextCursor:null});host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers()})
const render=async()=>{act(()=>root.render(<AccountPicker choose={choose}/>));await act(async()=>vi.advanceTimersByTimeAsync(1))}
const click=text=>act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent.includes(text)).click())
const search=async text=>{act(()=>{const input=host.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,text);input.dispatchEvent(new Event('input',{bubbles:true}))});await act(async()=>vi.advanceTimersByTimeAsync(251))}
it('shows initial account rows without requiring a search and supports single selection',async()=>{
  await render();expect(centerAccounts).toHaveBeenCalledWith('');expect(host.textContent).toContain(account.name);await click(account.name);expect(choose).toHaveBeenCalledWith(account)
})
it('paginates, shows empty searches and never makes disabled accounts selectable',async()=>{
  centerAccounts.mockResolvedValueOnce({accounts:[account],nextCursor:'page2'}).mockResolvedValueOnce({accounts:[{id:'u2',name:'Disabled account',disabled:true}],nextCursor:null}).mockResolvedValueOnce({accounts:[],nextCursor:null});
  await render();await click('Show more');expect(centerAccounts).toHaveBeenLastCalledWith('',{cursor:'page2'});expect(host.textContent).toContain('Disabled account');expect([...host.querySelectorAll('button')].some(b=>b.textContent.includes('Disabled account'))).toBe(false);await search('absent');expect(host.textContent).toContain('No accounts found.')
})
it('drops an older search result and displays a recoverable directory error',async()=>{
  let release;centerAccounts.mockReturnValueOnce(new Promise(resolve=>release=resolve)).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({accounts:[account],nextCursor:null});
  await render();await search('new');expect(host.querySelector('[role=alert]').textContent).toBe('Directory unavailable');await act(async()=>release({accounts:[{id:'old',name:'Stale account'}],nextCursor:null}));expect(host.textContent).not.toContain('Stale account');await click('Retry');await act(async()=>vi.advanceTimersByTimeAsync(251));expect(host.textContent).toContain(account.name)
})

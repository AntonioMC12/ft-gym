// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {MemoryRouter} from 'react-router-dom'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('../lib/i18n.js',()=>({t:key=>key}))
vi.mock('../store/useStore.js',()=>{const state={user:{id:'u',admin:true},config:{centers:{enabled:true}}};return{useStore:Object.assign(selector=>selector(state),{getState:()=>state})}})
vi.mock('../store/useCenters.js',()=>{const state={ownerUid:'u',centers:[],platformCapabilities:[]};return{useCenters:Object.assign(()=>state,{getState:()=>state})}})
import {useCenters} from '../store/useCenters.js'
import CentersEntry from './CentersEntry.jsx'
globalThis.IS_REACT_ACT_ENVIRONMENT=true
let host,root
beforeEach(()=>{useCenters.getState().centers=[];useCenters.getState().platformCapabilities=[];host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(()=>{act(()=>root.unmount());host.remove()})
const render=()=>act(async()=>root.render(<MemoryRouter><CentersEntry/></MemoryRouter>))
it('a member gets a personal center entry rather than an administrative menu',async()=>{
  useCenters.getState().centers=[{id:'c',capabilities:['membership.own.read']}];await render();expect(host.textContent).toBe('My centers')
})
it('a staff member with their own membership gets both explicit destinations',async()=>{
  useCenters.getState().centers=[{id:'c',capabilities:['center.read','membership.own.read']}];await render();expect(host.textContent).toContain('My centers');expect(host.textContent).toContain('Manage centers')
})
it('technical admin alone does not create a centers administration entry',async()=>{
  await render();expect(host.textContent).toBe('')
})

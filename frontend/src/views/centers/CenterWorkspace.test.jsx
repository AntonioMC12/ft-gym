// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
import {bindUI} from '../../components/ui.jsx'
import CenterWorkspace from './CenterWorkspace.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT=true
let root,host,sheetRoot,sheet,changed,closed
const options=[{value:'details',label:'Center details'},{value:'plans',label:'Membership plans'}]
beforeEach(()=>{
 host=document.createElement('div');sheet=document.createElement('div');document.body.append(host,sheet);root=createRoot(host);sheetRoot=createRoot(sheet);changed=vi.fn();closed=vi.fn(()=>sheetRoot.render(null));
 bindUI({getState:()=>({openSheet:render=>{sheetRoot.render(render(closed));return {close:closed}}})})
})
afterEach(()=>{act(()=>{root.unmount();sheetRoot.unmount()});host.remove();sheet.remove();bindUI(null)})
const render=(value='details',items=options)=>act(()=>root.render(<CenterWorkspace label="Center" options={items} value={value} onChange={changed}><p>Current content</p></CenterWorkspace>))
it('marks the current desktop destination and connects navigation to its content',()=>{
 render();const active=host.querySelector('[aria-current=page]');expect(active.textContent).toBe('Center details');expect(document.getElementById(active.getAttribute('aria-controls')).textContent).toBe('Current content');
 act(()=>active.click());expect(changed).not.toHaveBeenCalled();act(()=>host.querySelectorAll('.centers-workspace-desktop-nav button')[1].click());expect(changed).toHaveBeenCalledWith('plans');
 render('plans');expect(host.querySelector('[aria-current=page]').textContent).toBe('Membership plans');
})
it('uses the existing mobile picker with full labels and the same destination callback',()=>{
 render();act(()=>host.querySelector('.centers-workspace-mobile-nav button').click());expect(sheet.textContent).toContain('Membership plans');
 act(()=>[...sheet.querySelectorAll('button')].find(node=>node.textContent==='Membership plans').click());expect(changed).toHaveBeenCalledWith('plans');expect(closed).toHaveBeenCalledOnce();
})
it('keeps removed destinations out of both menus',()=>{
 render('details',options.slice(0,1));expect(host.textContent).not.toContain('Membership plans');act(()=>host.querySelector('.centers-workspace-mobile-nav button').click());expect(sheet.textContent).not.toContain('Membership plans');
})

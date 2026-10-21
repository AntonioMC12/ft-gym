// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {it,expect,beforeEach,afterEach,vi} from 'vitest'
vi.mock('../lib/i18n.js',()=>({t:key=>key}))
import ActionReason from './ActionReason.jsx'
import {Button,SelectRow,bindUI} from './ui.jsx'
import {useUI} from '../store/useUI.js'
let root,host
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;useUI.getState().closeAll();bindUI(useUI);host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(()=>{act(()=>root.unmount());host.remove();useUI.getState().closeAll()})
it('explains a disabled action on focus, hover and touch, with Escape and outside dismissal',()=>{
 act(()=>root.render(<ActionReason reason="Select a pass first"><Button disabled>Save</Button></ActionReason>))
 const [save,help]=host.querySelectorAll('button');expect(save.disabled).toBe(true);expect(help.disabled).toBe(false)
 act(()=>help.focus());expect(document.querySelector('[role=tooltip]').textContent).toBe('Select a pass first');expect(help.getAttribute('aria-describedby')).toBe(document.querySelector('[role=tooltip]').id)
 act(()=>help.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));expect(document.querySelector('[role=tooltip]')).toBeNull()
 act(()=>help.click());expect(document.querySelector('[role=tooltip]')).not.toBeNull();act(()=>document.body.dispatchEvent(new Event('pointerdown',{bubbles:true})));expect(document.querySelector('[role=tooltip]')).toBeNull()
 act(()=>help.blur());act(()=>host.querySelector('.action-reason-help').dispatchEvent(new MouseEvent('mouseover',{bubbles:true})));expect(document.querySelector('[role=tooltip]')).not.toBeNull()
 act(()=>host.querySelector('.action-reason-help').dispatchEvent(new MouseEvent('mouseout',{bubbles:true})));expect(document.querySelector('[role=tooltip]')).toBeNull()
})
it('removes old explanations as eligibility changes',()=>{
 act(()=>root.render(<ActionReason reason="Expired"><Button disabled>Save</Button></ActionReason>));act(()=>host.querySelectorAll('button')[1].click());act(()=>root.render(<ActionReason reason={null}><Button>Save</Button></ActionReason>));expect(document.querySelector('[role=tooltip]')).toBeNull();expect(host.querySelectorAll('button')).toHaveLength(1)
})
it('the field selector forwards error semantics and stays inert when disabled, including an already open sheet',()=>{
 const change=vi.fn(),props={title:'Pass',value:'',options:[{value:'',label:'Choose a pass'},{value:'a',label:'Pack A'}],onChange:change,variant:'field',id:'pass',invalid:true,describedBy:'pass-error'}
 act(()=>root.render(<SelectRow {...props} disabled/>));const select=host.querySelector('button');expect(select.disabled).toBe(true);expect(select.className).toContain('select-field');expect(select.getAttribute('aria-describedby')).toBe('pass-error');expect(select.getAttribute('aria-invalid')).toBe('true');act(()=>select.click());expect(useUI.getState().sheets).toHaveLength(0)
 act(()=>root.render(<SelectRow {...props}/>));act(()=>host.querySelector('button').click());const sheet=useUI.getState().sheets[0];expect(sheet).toBeTruthy();act(()=>root.render(<SelectRow {...props} disabled/>));const content=sheet.render(()=>{});act(()=>content.props.onChange('a'));expect(change).not.toHaveBeenCalled()
})

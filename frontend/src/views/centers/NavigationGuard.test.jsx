// @vitest-environment happy-dom
import React,{act,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {it,expect,beforeEach,afterEach,vi} from 'vitest'
vi.mock('../../sheets.jsx',()=>({confirmSheet:vi.fn()}))
vi.mock('../../lib/i18n.js',()=>({t:key=>key}))
import {confirmSheet} from '../../sheets.jsx'
import Guard,{useCenterNavigation,useUnsavedCenterForm} from './NavigationGuard.jsx'
globalThis.IS_REACT_ACT_ENVIRONMENT=true
let root,host,leave
function Form({dirty,busy}){useUnsavedCenterForm(dirty,busy);const go=useCenterNavigation();return <button onClick={()=>go(leave)}>Leave</button>}
beforeEach(()=>{vi.clearAllMocks();history.replaceState(null,'',location.href);leave=vi.fn();host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(()=>{act(()=>root.unmount());host.remove()})
const render=(dirty,busy=false,contextKey='one')=>act(()=>root.render(<Guard contextKey={contextKey}><Form dirty={dirty} busy={busy}/></Guard>))
it('leaves clean forms directly and confirms before discarding unsaved changes',()=>{
  render(null);act(()=>host.querySelector('button').click());expect(leave).toHaveBeenCalledOnce();render('draft1');act(()=>host.querySelector('button').click());expect(leave).toHaveBeenCalledOnce();act(()=>confirmSheet.mock.calls.at(-1)[0].onConfirm());expect(leave).toHaveBeenCalledTimes(2)
})
it('never discards newer edits through an old confirmation or navigates during a save',()=>{
  render('draft1');act(()=>host.querySelector('button').click());const old=confirmSheet.mock.calls.at(-1)[0].onConfirm;render('draft2');act(()=>old());expect(leave).not.toHaveBeenCalled();expect(confirmSheet).toHaveBeenCalledTimes(2);render('draft2',true);act(()=>confirmSheet.mock.calls.at(-1)[0].onConfirm());expect(leave).not.toHaveBeenCalled()
})
it('drops confirmations after unmount and protects browser reload with beforeunload',()=>{
  render('draft');const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);expect(e.defaultPrevented).toBe(true);act(()=>host.querySelector('button').click());const confirm=confirmSheet.mock.calls[0][0].onConfirm;act(()=>root.render(null));act(()=>confirm());expect(leave).not.toHaveBeenCalled();const clean=new Event('beforeunload',{cancelable:true});window.dispatchEvent(clean);expect(clean.defaultPrevented).toBe(false)
})
it('ignores a confirmation after changing route without unmounting the navigation provider',()=>{
  render('draft');act(()=>host.querySelector('button').click());const confirm=confirmSheet.mock.calls[0][0].onConfirm;render('draft',false,'two');act(()=>confirm());expect(leave).not.toHaveBeenCalled()
})
it('waits for the confirmation sheet history entry to rewind before navigating once',()=>{
  render('draft');act(()=>host.querySelector('button').click());history.replaceState({openGymSheet:true},'',location.href);act(()=>confirmSheet.mock.calls[0][0].onConfirm());expect(leave).not.toHaveBeenCalled();history.replaceState({idx:2},'',location.href);act(()=>window.dispatchEvent(new PopStateEvent('popstate')));expect(leave).toHaveBeenCalledOnce();act(()=>window.dispatchEvent(new PopStateEvent('popstate')));expect(leave).toHaveBeenCalledOnce()
})

function EditableForm({label='Test form',saving=false}){
 const [value,setValue]=useState('saved'),[baseline,setBaseline]=useState('saved');const ref=useUnsavedCenterForm(value!==baseline?value||'empty':null,saving);return <form ref={ref} aria-label={label} onSubmit={e=>{e.preventDefault();leave(label);setBaseline(value)}}><input required value={value} onChange={e=>setValue(e.target.value)}/><button type="submit">Local save</button></form>
}
const edit=(node,value)=>act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}))})
it('shows save feedback only after an edit and submits the existing form, clearing the warning after success',()=>{
 act(()=>root.render(<Guard><EditableForm/></Guard>));expect(host.querySelector('aside')).toBeNull();edit(host.querySelector('input'),'changed');expect(host.querySelector('aside').textContent).toContain('Save form: Test form');act(()=>host.querySelector('aside button').click());expect(leave).toHaveBeenCalledWith('Test form');expect(host.querySelector('aside')).toBeNull();
})
it('keeps native validation and blocks the shared save action during another operation',()=>{
 act(()=>root.render(<Guard><EditableForm/></Guard>));edit(host.querySelector('input'),'');act(()=>host.querySelector('aside button').click());expect(leave).not.toHaveBeenCalled();act(()=>root.render(<Guard><EditableForm saving/></Guard>));expect(host.querySelector('aside button').disabled).toBe(true);
})
it('saves separately when more than one form is edited and never submits another form automatically',()=>{
 act(()=>root.render(<Guard><EditableForm label="First"/><EditableForm label="Second"/></Guard>));edit(host.querySelectorAll('input')[0],'one');edit(host.querySelectorAll('input')[1],'two');act(()=>host.querySelector('aside button').click());expect(leave.mock.calls).toEqual([['First']]);expect(host.querySelector('aside button').textContent).toContain('Second');act(()=>host.querySelector('aside button').click());expect(leave.mock.calls).toEqual([['First'],['Second']]);expect(host.querySelector('aside')).toBeNull();
})

it('shared save opens the form confirmation instead of bypassing it',()=>{
 function Confirmed(){const ref=useUnsavedCenterForm('edited');return <form ref={ref} onSubmit={e=>{e.preventDefault();confirmSheet({onConfirm:leave})}}><button type="submit">Local confirm</button></form>}
 act(()=>root.render(<Guard><Confirmed/></Guard>));act(()=>host.querySelector('aside button').click());expect(confirmSheet).toHaveBeenCalledOnce();expect(leave).not.toHaveBeenCalled();act(()=>confirmSheet.mock.calls[0][0].onConfirm());expect(leave).toHaveBeenCalledOnce();
})

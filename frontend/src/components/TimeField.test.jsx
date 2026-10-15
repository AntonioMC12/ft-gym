// @vitest-environment happy-dom
import React,{act,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {it,expect,beforeEach,afterEach,vi} from 'vitest'
vi.mock('../lib/i18n.js',()=>({t:key=>key}))
import TimeField from './TimeField.jsx'
import {bindUI} from './ui.jsx'
import {useUI} from '../store/useUI.js'
globalThis.IS_REACT_ACT_ENVIRONMENT=true
let root,host,changed
function Sheets(){return useUI(s=>s.sheets).map(sheet=><section key={sheet.id} data-sheet>{sheet.render(()=>useUI.getState().closeSheet(sheet.id))}</section>)}
function Fixture({allowEnd=false,disabled=false}){const [value,setValue]=useState('08:00');return <><TimeField aria-label="Opening" value={value} disabled={disabled} allowEnd={allowEnd} onChange={next=>{changed(next);setValue(next)}}/><Sheets/></>}
beforeEach(()=>{changed=vi.fn();useUI.getState().closeAll();bindUI(useUI);host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(()=>{act(()=>root.unmount());host.remove();useUI.getState().closeAll()})
const render=props=>act(()=>root.render(<Fixture {...props}/>))
const click=text=>act(()=>[...host.querySelectorAll('button')].find(b=>b.textContent===text||b.querySelector('.lrow-t')?.textContent===text).click())
it('keeps keyboard editing and converts four digits without using a native time input',()=>{
  render();const input=host.querySelector('input');expect(input.type).toBe('text');
  act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'0937');input.dispatchEvent(new Event('input',{bubbles:true}))});
  act(()=>input.dispatchEvent(new FocusEvent('focusout',{bubbles:true})));expect(input.value).toBe('09:37');expect(changed).toHaveBeenLastCalledWith('09:37')
})
it('uses app sheets and applies an exact minute only on explicit confirmation',()=>{
  render();act(()=>host.querySelector('.time-field-picker').click());click('Minute');click('37');expect(changed).not.toHaveBeenCalled();click('Apply');expect(changed).toHaveBeenCalledWith('08:37');expect(host.querySelector('[data-sheet]')).toBeNull()
})
it('supports24:00 only as a closing time and cancellation does not change the value',()=>{
  render({allowEnd:true});act(()=>host.querySelector('.time-field-picker').click());click('Hour');click('24');expect(host.textContent).toContain('00');click('Apply');expect(changed).toHaveBeenLastCalledWith('24:00');
  act(()=>host.querySelector('.time-field-picker').click());click('Cancel');expect(changed).toHaveBeenCalledTimes(1)
})
it('removes its picker on disable and never applies a stale response after unmount',()=>{
  render();act(()=>host.querySelector('.time-field-picker').click());click('Hour');expect(host.querySelectorAll('[data-sheet]').length).toBe(2);render({disabled:true});expect(host.querySelector('[data-sheet]')).toBeNull();expect(host.querySelector('input').disabled).toBe(true);expect(changed).not.toHaveBeenCalled()
})

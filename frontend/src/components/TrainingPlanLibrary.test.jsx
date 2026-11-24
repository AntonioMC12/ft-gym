// @vitest-environment happy-dom
import React,{act,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
vi.mock('../lib/i18n.js',()=>({t:(key,...args)=>({'Men':'Hombres','New category':'Nueva categoría','Category name':'Nombre de categoría','New folder':'Nueva carpeta'}[key]||key).replace(/\{(\d+)\}/g,(_,i)=>args[i])}))
vi.mock('../sheets.jsx',()=>({confirmSheet:vi.fn()}))
import TrainingPlanLibrary from './TrainingPlanLibrary.jsx'
import {initializePlanFolders,savePlanFolder} from '../lib/training-plans.js'
let root,host,state
function Library(){
 const [S,setS]=useState(state),[location,setLocation]=useState('root')
 const update=action=>{const next=structuredClone(state);action(next);state=next;setS(next)}
 return <TrainingPlanLibrary S={S} update={update} onChange={()=>{}} location={location} onLocationChange={setLocation}/>
}
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;state={trainingPlans:{},trainingFolders:{}};initializePlanFolders(state);host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(()=>{act(()=>root.unmount());host.remove()})
const mount=()=>act(async()=>root.render(<Library/>))
const click=name=>act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent===name).click())
const enter=value=>act(async()=>{const input=host.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}))})
const submit=()=>act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
it('creates a category directly at the root and folders inside it with the same action',async()=>{
 await mount();expect(host.textContent).not.toContain('Nueva carpeta');await click('Nueva categoría')
 expect(host.textContent).toContain('Nombre de categoría');expect(host.textContent).not.toContain('Destination folder')
 await enter('Fuerza');await click('Save')
 const category=Object.entries(state.trainingFolders).find(([,f])=>f.name==='Fuerza')
 expect(category[1]).toMatchObject({parentId:null,category:true})
 await act(async()=>[...host.querySelectorAll('.is-folder')].find(b=>b.textContent.includes('Fuerza')).click())
 expect(host.textContent).toContain('Nueva carpeta');expect(host.textContent).not.toContain('Nueva categoría')
 await click('Nueva carpeta');await enter('Inicio');await click('Save')
 expect(Object.values(state.trainingFolders).find(f=>f.name==='Inicio')).toMatchObject({parentId:category[0],category:false})
 await click('Previous level');expect(host.querySelector('.plan-folder-grid').textContent).toContain('Fuerza');expect(host.querySelector('.plan-folder-grid').textContent).not.toContain('Inicio')
})
it('keeps the new-category form open with an error for duplicate names',async()=>{
 savePlanFolder(state,'Fuerza',null,'strength');await mount();await click('Nueva categoría');await enter(' fuerza ');await submit()
 expect(host.querySelector('[role="alert"]').textContent).toContain('This name already exists')
 expect(host.querySelector('form')).not.toBeNull();expect(Object.keys(state.trainingFolders)).toHaveLength(6)
})
it('lets custom categories be renamed without translating their chosen names',async()=>{
 savePlanFolder(state,'New folder',null,'custom');await mount()
 const custom=[...host.querySelectorAll('.is-folder')].find(b=>b.querySelector('strong').textContent==='New folder')
 expect(custom).toBeDefined();await act(async()=>custom.click());expect(host.textContent).toContain('Folder actions')
 await click('Rename folder');expect(host.textContent).toContain('Nombre de categoría');await enter('Fuerza');await submit()
 expect(state.trainingFolders.custom).toMatchObject({name:'Fuerza',category:true,parentId:null})
})

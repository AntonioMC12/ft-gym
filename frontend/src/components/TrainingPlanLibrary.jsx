import {useUnsavedCenterForm,useCenterNavigation} from '../views/centers/NavigationGuard.jsx'
import {useEffect,useState,useRef} from 'react'
import {Button,TextField,SelectRow} from './ui.jsx'
import Icon from './Icon.jsx'
import {confirmSheet} from '../sheets.jsx'
import {t} from '../lib/i18n.js'
import {plansOf,createTrainingPlan,removeTrainingPlan,PLAN_CATEGORIES,foldersOf,folderPath,planFolder,initializePlanFolders,savePlanFolder,removePlanFolder,movePlan,routinesForPlan} from '../lib/training-plans.js'

const planCount=n=>t(n===1?'{0} plan':'{0} plans',n)
const routineCount=n=>t(n===1?'{0} routine':'{0} routines',n)
const exerciseCount=n=>t(n===1?'{0} exercise':'{0} exercises',n)
export default function TrainingPlanLibrary({S,update,value,onChange,canAssign,onAssign,location='root',onLocationChange,children}){
 const plans=plansOf(S),selected=plans.find(p=>p.id===value),folders=foldersOf(S),navigate=useCenterNavigation()
 const [editing,setEditing]=useState(null),[name,setName]=useState(''),[destination,setDestination]=useState(''),[error,setError]=useState('')
 const titleRef=useRef(null)
 useEffect(()=>{titleRef.current?.focus({preventScroll:true})},[selected?.id,location])
 const formRef=useUnsavedCenterForm(editing?JSON.stringify([editing,name,destination]):null)
 const path=folderPath(S,selected?planFolder(S,selected):location),folder=path.at(-1)
 const ready=PLAN_CATEGORIES.every(([id])=>S.trainingFolders?.[id])
 useEffect(()=>{if(!ready){try{update(initializePlanFolders)}catch(e){setError(t(e.message))}}},[ready,update])
 useEffect(()=>{if(location!=='root'&&location!=='unorganized'&&!folderPath(S,location).length)onLocationChange?.('root')},[S.trainingFolders,location])
 useEffect(()=>{if(editing?.id&&!(editing.kind.includes('folder')?S.trainingFolders?.[editing.id]:S.trainingPlans?.[editing.id]))setEditing(null)},[S.trainingFolders,S.trainingPlans,editing])
 const run=action=>{try{action();setError('');return true}catch(e){setError(t(e.message));return false}}
 const start=(kind,id=null)=>navigate(()=>{setEditing({kind,id});setName(id?(kind.includes('folder')?folders.find(f=>f.id===id)?.name:plans.find(p=>p.id===id)?.name)||'':'');setDestination('');setError('')})
 const go=id=>navigate(()=>{setEditing(null);setError('');onLocationChange?.(id)})
 const parentId=folder?.id||null,choosingParent=editing?.kind==='new-folder'&&!folder
 const visibleFolders=location==='root'?folders.filter(f=>f.category):folders.filter(f=>f.parentId===location)
 const visiblePlans=plans.filter(p=>location==='unorganized'?!planFolder(S,p):location!=='root'&&planFolder(S,p)===location)
 const count=id=>plans.filter(p=>folderPath(S,p.folderId).some(f=>f.id===id)).length
 const label=f=>f.category?t(f.name):f.name
 const folderLabel=id=>folderPath(S,id).map(label).join(' / ')
 const moving=editing?.kind.startsWith('move')
 const destinations=[...(editing?.kind==='move-plan'?[{value:'unorganized',label:t('Unorganized')}]:[]),...folders.filter(f=>folderPath(S,f.id).length&&!(editing?.kind==='move-folder'&&folderPath(S,f.id).some(x=>x.id===editing.id))).map(f=>({value:f.id,label:folderLabel(f.id)}))]
 const save=e=>{e.preventDefault();let id;const ok=run(()=>update(s=>{
  if(editing.id&&!(editing.kind.includes('folder')?s.trainingFolders?.[editing.id]:s.trainingPlans?.[editing.id]))throw new Error(editing.kind.includes('folder')?'Folder unavailable':'Plan unavailable')
  if(editing.kind==='move-plan')movePlan(s,editing.id,destination==='unorganized'?null:destination)
  else if(editing.kind==='move-folder')savePlanFolder(s,s.trainingFolders[editing.id].name,destination,editing.id)
  else if(editing.kind.includes('folder'))id=savePlanFolder(s,name,editing.id?s.trainingFolders[editing.id]?.parentId:(destination||parentId),editing.id||undefined)
  else id=createTrainingPlan(s,name,editing.id||undefined,editing.id?planFolder(s,s.trainingPlans[editing.id]):parentId)
 }));if(ok){setEditing(null);if(editing.kind==='move-plan'&&value===editing.id)onChange(editing.id,destination);else if(id&&!editing.kind.includes('folder'))onChange(id)}}
 const removeFolder=()=>{
  if(folders.some(f=>f.parentId===folder.id)||plans.some(p=>p.folderId===folder.id)){setError(t('Move all subfolders and plans before deleting this folder'));return}
  confirmSheet({title:t('Delete folder'),message:label(folder),danger:true,confirmText:t('Delete'),onConfirm:()=>{if(run(()=>update(s=>removePlanFolder(s,folder.id))))go(folder.parentId||'root')}})
 }
 const remove=p=>confirmSheet({title:t('Delete plan'),message:t('Deleting this plan keeps its routines in No plan. Assignments and workout history are preserved.'),danger:true,confirmText:t('Delete'),onConfirm:()=>{if(run(()=>update(s=>removeTrainingPlan(s,p.id)))){setEditing(null);if(value===p.id)onChange(null)}}})
 const planMenu=p=><details className="training-action-menu"><summary aria-label={t('Actions for {0}',p.name)}><Icon name="more"/></summary><div onClick={e=>e.currentTarget.parentElement.removeAttribute('open')}><Button icon="pencil" onClick={()=>start('rename-plan',p.id)}>{t('Rename')}</Button><Button icon="folder" onClick={()=>start('move-plan',p.id)}>{t('Move plan')}</Button><Button icon="trash" onClick={()=>remove(p)}>{t('Delete plan')}</Button></div></details>
 const currentUnorganized=selected?!planFolder(S,selected):location==='unorganized'
 const returnLocation=location==='root'||location==='unorganized'||folderPath(S,location).length?location:'root'
 const returnName=returnLocation==='root'?t('Library'):returnLocation==='unorganized'?t('Unorganized'):label(folders.find(f=>f.id===returnLocation))
 const selectedRoutines=selected?routinesForPlan(S,selected.id):[]
 return <section className={'training-plan-library'+(selected?' is-plan-detail':'')} aria-label={selected?selected.name:t('Training plans')}>
  <nav className="plan-folder-path" aria-label={t('Folder path')}><button onClick={()=>go('root')}>{t('Library')}</button>{currentUnorganized&&<span> / <button onClick={()=>go('unorganized')}>{t('Unorganized')}</button></span>}{path.map(f=><span key={f.id}> / <button aria-current={!selected&&f.id===location?'location':undefined} onClick={()=>go(f.id)}>{label(f)}</button></span>)}{selected&&<span aria-current="page"> / {selected.name}</span>}</nav>
  {selected?<>
   <Button icon="chevronLeft" onClick={()=>go(returnLocation)}>{t('Back to {0}',returnName)}</Button>
   <header className="plan-detail-header"><div><span className="ss">{t('Weekly plan')}</span><h2 ref={titleRef} tabIndex={-1}>{selected.name}</h2><p>{routineCount(selectedRoutines.length)} · {exerciseCount(selectedRoutines.reduce((sum,r)=>sum+(r.ex?.length||0),0))}</p></div><div className="training-plan-actions">{canAssign&&<Button variant="primary" icon="person" disabled={!selectedRoutines.some(r=>r.ex?.length)} onClick={()=>navigate(()=>onAssign?.(selected.id))}>{t('Assign plan')}</Button>}{planMenu(selected)}</div></header>
   {!selectedRoutines.some(r=>r.ex?.length)&&<p className="ss">{t('Add exercises to a routine before assigning this plan.')}</p>}
  </>:<>
   <div className="row between"><div><h2 ref={titleRef} tabIndex={-1}>{folder?label(folder):location==='unorganized'?t('Unorganized'):t('Training plans')}</h2><p className="ss">{t('Categories and weekly plans')}</p></div><div className="training-plan-actions"><Button icon="folder" onClick={()=>start('new-folder')}>{t('New folder')}</Button><Button variant="tinted" icon="plus" onClick={()=>start('new-plan')}>{t('New plan')}</Button></div></div>
   {location!=='root'&&<Button icon="chevronLeft" onClick={()=>go(folder?.parentId||'root')}>{t('Previous level')}</Button>}
   {folder&&!folder.category&&<details className="training-action-menu folder-menu"><summary>{t('Folder actions')} <Icon name="more"/></summary><div><Button icon="pencil" onClick={()=>start('rename-folder',folder.id)}>{t('Rename folder')}</Button><Button icon="folder" onClick={()=>start('move-folder',folder.id)}>{t('Move folder')}</Button><Button icon="trash" onClick={removeFolder}>{t('Delete folder')}</Button></div></details>}
   <div className="plan-folder-grid">
    {visibleFolders.map(f=><button className="plan-library-entry is-folder" key={f.id} onClick={()=>go(f.id)}><Icon name="folder"/><span><strong>{label(f)}</strong><small>{planCount(count(f.id))}</small></span><Icon name="chevronRight"/></button>)}
    {location==='root'&&<button className="plan-library-entry is-folder" onClick={()=>go('unorganized')}><Icon name="folder"/><span><strong>{t('Unorganized')}</strong><small>{planCount(plans.filter(p=>!planFolder(S,p)).length)}</small></span><Icon name="chevronRight"/></button>}
    {visiblePlans.map(p=><article className="plan-library-card" key={p.id}><button className="plan-library-entry is-plan" onClick={()=>navigate(()=>onChange(p.id))}><Icon name="calendar"/><span><strong>{p.name}</strong><small>{t('Weekly plan')} · {routineCount(routinesForPlan(S,p.id).length)}</small><span className="plan-open-label">{t('Open plan')} <Icon name="chevronRight"/></span></span></button>{planMenu(p)}</article>)}
   </div>
   {location!=='root'&&!visibleFolders.length&&!visiblePlans.length&&<p className="plan-library-empty">{t('This folder is empty. Create a plan or move one here.')}</p>}
   {location==='root'&&<p className="ss">{t('Open a category to create subfolders. Existing plans are in Unorganized.')}</p>}
  </>}
  {editing&&<form className="plan-library-form" ref={formRef} onSubmit={save}>
   <h3>{t(editing.kind==='move-plan'?'Move plan':editing.kind==='move-folder'?'Move folder':editing.kind.includes('folder')?'Folder name':'Plan name')}</h3>
   {choosingParent&&<SelectRow variant="field" title={t('Destination folder')} value={destination} options={[{value:'',label:t('Choose a folder')},...destinations]} onChange={setDestination}/>}
   {moving?<SelectRow variant="field" title={t('Destination folder')} value={destination} options={[{value:'',label:t('Choose a folder')},...destinations]} onChange={setDestination}/>:<label className="centers-field"><span>{t(editing.kind.includes('folder')?'Folder name':'Plan name')}</span><TextField autoFocus maxLength={120} required value={name} onChange={e=>setName(e.target.value)}/></label>}
   <div className="training-plan-actions"><Button variant="primary" type="submit" disabled={moving?!destination:!name.trim()||(choosingParent&&!destination)}>{t('Save')}</Button><Button type="button" onClick={()=>{setEditing(null);setError('')}}>{t('Cancel')}</Button></div>
  </form>}
  {error&&<p role="alert">{error}</p>}
  {selected&&children}
 </section>
}

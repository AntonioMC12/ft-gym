import {useUnsavedCenterForm} from '../views/centers/NavigationGuard.jsx'
import {useState} from 'react'
import {Button,TextField,SelectRow} from './ui.jsx'
import {confirmSheet} from '../sheets.jsx'
import {t} from '../lib/i18n.js'
import {plansOf,createTrainingPlan,removeTrainingPlan,planOf} from '../lib/training-plans.js'
export default function TrainingPlanLibrary({S,update,value,onChange,canAssign,onAssign}){
 const [editing,setEditing]=useState(null),[name,setName]=useState('')
 const formRef=useUnsavedCenterForm(editing&&name!==(editing==='new'?'':S.trainingPlans?.[editing]?.name||'')?JSON.stringify([editing,name]):null)
 const plans=plansOf(S),selected=plans.find(p=>p.id===value)
 const save=e=>{e.preventDefault();if(!name.trim())return;let id;update(s=>{id=createTrainingPlan(s,name,editing==='new'?undefined:editing)});onChange(id);setEditing(null);setName('')}
 const remove=()=>confirmSheet({title:t('Delete plan'),message:t('Routines will be kept in Unfiled. Assignments and workout history will be preserved.'),danger:true,confirmText:t('Delete'),onConfirm:()=>{update(s=>removeTrainingPlan(s,value));onChange(null)}})
 const ids=(S.routines||[]).filter(r=>value==='*'||planOf(S,r)===value).map(r=>r.id)
 return <section className="training-plan-library">
  <div className="row between"><h2>{t('Training plans')}</h2><Button variant="tinted" icon="plus" onClick={()=>{setEditing('new');setName('')}}>{t('New plan')}</Button></div>
  <SelectRow variant="field" title={t('Training plans')} value={value??''} options={[{value:'*',label:t('All routines')},{value:'',label:t('Unfiled')},...plans.map(p=>({value:p.id,label:p.name+' · '+(S.routines||[]).filter(r=>planOf(S,r)===p.id).length}))]} onChange={v=>onChange(v||null)}/>
  {selected&&<div className="training-plan-actions"><Button icon="pencil" onClick={()=>{setEditing(selected.id);setName(selected.name)}}>{t('Rename')}</Button><Button icon="trash" onClick={remove}>{t('Delete plan')}</Button></div>}
  {editing&&<form ref={formRef} onSubmit={save}><label className="centers-field"><span>{t('Plan name')}</span><TextField autoFocus maxLength={120} required value={name} onChange={e=>setName(e.target.value)}/></label><div className="training-plan-actions"><Button variant="primary" type="submit" disabled={!name.trim()}>{t('Save')}</Button><Button type="button" onClick={()=>setEditing(null)}>{t('Cancel')}</Button></div></form>}
  {canAssign&&ids.length>0&&<Button variant="tinted" icon="person" onClick={()=>onAssign?.(value)}>{t(selected?'Assign plan':'Assign routines')}</Button>}
 </section>
}

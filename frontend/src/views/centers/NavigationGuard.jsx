import {createContext,useContext,useEffect,useRef,useState,useCallback} from 'react'
import {createPortal} from 'react-dom'
import {confirmSheet} from '../../sheets.jsx'
import {t} from '../../lib/i18n.js'
import {onSheetEntry} from '../../lib/nav.js'

const Context=createContext(null)
export default function CenterNavigationGuard({children,contextKey}){
  const entries=useRef(new Set()),alive=useRef(true)
  const [pending,setPending]=useState([])
  const report=useCallback(()=>{
    const next=[...entries.current].filter(ref=>ref.current.dirty||ref.current.busy).map(ref=>({ref,value:ref.current}))
    setPending(previous=>previous.length===next.length&&previous.every((item,i)=>item.ref===next[i].ref&&item.value===next[i].value)?previous:next)
  },[])
  const waiting=useRef(new Set())
  const context=useRef(contextKey);context.current=contextKey
  useEffect(()=>{
    alive.current=true
    const beforeUnload=e=>{if([...entries.current].some(ref=>ref.current.dirty||ref.current.busy)){e.preventDefault();e.returnValue=''}}
    window.addEventListener('beforeunload',beforeUnload)
    return()=>{alive.current=false;window.removeEventListener('beforeunload',beforeUnload);for(const done of waiting.current)window.removeEventListener('popstate',done);waiting.current.clear()}
  },[])
  useEffect(()=>()=>{for(const done of waiting.current)window.removeEventListener('popstate',done);waiting.current.clear()},[contextKey])
  const afterClosingSheet=action=>{
    if(!onSheetEntry()){action();return}
    // Modals owns the sheet's history entry and rewinds it on close. Wait for
    // that pop before navigating; two concurrent history.go calls can skip pages.
    const done=()=>{waiting.current.delete(done);if(alive.current)action()}
    waiting.current.add(done);window.addEventListener('popstate',done,{once:true})
  }
  const request=(action,options={})=>{
    if(!alive.current)return
    const refs=[...entries.current].filter(ref=>!options.form||ref.current.form===options.form),snapshot=refs.map(ref=>ref.current),origin=context.current
    if(snapshot.some(item=>item.busy))return
    if(!snapshot.some(item=>item.dirty)){action();return}
    confirmSheet({title:t('Discard changes?'),message:t('Your unsaved changes will be lost.'),confirmText:t('Discard'),cancelText:t('Keep editing'),danger:true,onConfirm:()=>afterClosingSheet(()=>{
      if(!alive.current||context.current!==origin||refs.some(ref=>!entries.current.has(ref)))return
      if(refs.some((ref,i)=>ref.current!==snapshot[i])){request(action,options);return}
      action()
    })})
  }
  const dirty=pending.filter(item=>item.value.dirty)
  return <Context.Provider value={{entries:entries.current,request,report}}>{children}{dirty.map((item,index)=>{
    const form=item.ref.current.form.current
    if(!form?.isConnected)return null
    const actions=form.querySelector('[data-center-form-actions]')||form
    return createPortal(<small className="centers-unsaved-indicator" role="status">{t('Unsaved changes')}</small>,actions,'unsaved-'+index)
  })}</Context.Provider>

}
export const useCenterNavigation=()=>useContext(Context)?.request||(action=>action())
export function useUnsavedCenterForm(dirty,busy=false,{saveable=true}={}){
  const context=useContext(Context),form=useRef(null),entry=useRef({dirty,busy,saveable,form})
  if(entry.current.dirty!==dirty||entry.current.busy!==busy||entry.current.saveable!==saveable)entry.current={dirty,busy,saveable,form}
  const entries=context?.entries
  const report=context?.report
  useEffect(()=>{if(!entries)return;entries.add(entry);report();return()=>{entries.delete(entry);report()}},[entries,report])
  useEffect(()=>{report?.()},[dirty,busy,saveable,report])
  return form
}

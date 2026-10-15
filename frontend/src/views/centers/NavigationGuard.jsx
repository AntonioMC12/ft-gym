import {createContext,useContext,useEffect,useRef} from 'react'
import {confirmSheet} from '../../sheets.jsx'
import {t} from '../../lib/i18n.js'
import {onSheetEntry} from '../../lib/nav.js'

const Context=createContext(null)
export default function CenterNavigationGuard({children,contextKey}){
  const entries=useRef(new Set()),alive=useRef(true)
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
  const request=action=>{
    if(!alive.current)return
    const refs=[...entries.current],snapshot=refs.map(ref=>ref.current),origin=context.current
    if(snapshot.some(item=>item.busy))return
    if(!snapshot.some(item=>item.dirty)){action();return}
    confirmSheet({title:t('Discard changes?'),message:t('Your unsaved changes will be lost.'),confirmText:t('Discard'),cancelText:t('Keep editing'),danger:true,onConfirm:()=>afterClosingSheet(()=>{
      if(!alive.current||context.current!==origin||entries.current.size!==refs.length||refs.some(ref=>!entries.current.has(ref)))return
      if(refs.some((ref,i)=>ref.current!==snapshot[i])){request(action);return}
      action()
    })})
  }
  return <Context.Provider value={{entries:entries.current,request}}>{children}</Context.Provider>
}
export const useCenterNavigation=()=>useContext(Context)?.request||(action=>action())
export function useUnsavedCenterForm(dirty,busy=false){
  const context=useContext(Context),entry=useRef({dirty,busy})
  if(entry.current.dirty!==dirty||entry.current.busy!==busy)entry.current={dirty,busy}
  const entries=context?.entries
  useEffect(()=>{if(!entries)return;entries.add(entry);return()=>entries.delete(entry)},[entries])
}

import {useEffect,useId,useLayoutEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {Button} from './ui.jsx'
import {t} from '../lib/i18n.js'
// Chart tooltips are tied to chart data. This independent trigger stays usable
// beside a disabled action, including with keyboard and touch.
export default function ActionReason({reason,children}){
 const [open,setOpen]=useState(false),[position,setPosition]=useState({}),id=useId(),root=useRef(null),trigger=useRef(null),tip=useRef(null),pinned=useRef(false)
 const close=()=>{pinned.current=false;setOpen(false)}
 useEffect(()=>{if(!open)return;const outside=e=>{if(!root.current?.contains(e.target)&&!tip.current?.contains(e.target))close()};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside)},[open])
 useEffect(()=>close(),[reason])
 useLayoutEffect(()=>{
  if(!open)return
  trigger.current=root.current?.querySelector('.action-reason-trigger')
  if(!trigger.current)return
  const place=()=>{
   const rect=trigger.current.getBoundingClientRect(),width=Math.min(280,window.innerWidth-32),height=tip.current?.getBoundingClientRect().height||0
   const top=rect.top>=height+16?rect.top-height-8:Math.min(rect.bottom+8,Math.max(8,window.innerHeight-height-8))
   setPosition({width,left:Math.max(16,Math.min(rect.right-width,window.innerWidth-width-16)),top})
  }
  place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true)
  return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true)}
 },[open,reason])
 return <span className="action-reason" ref={root}>{children}{reason&&<span className="action-reason-help" onMouseEnter={()=>setOpen(true)} onMouseLeave={e=>{if(!pinned.current&&document.activeElement!==trigger.current&&!tip.current?.contains(e.relatedTarget))setOpen(false)}}>
  <Button type="button" icon="info" className="action-reason-trigger" aria-label={t('Why is this unavailable?')} aria-describedby={open?id:undefined} aria-expanded={open} onFocus={e=>{trigger.current=e.currentTarget;setOpen(true)}} onBlur={close} onMouseEnter={e=>{trigger.current=e.currentTarget;setOpen(true)}} onClick={e=>{trigger.current=e.currentTarget;pinned.current=!pinned.current;setOpen(pinned.current)}} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close()}}}/>
  {open&&createPortal(<span ref={tip} id={id} role="tooltip" className="action-reason-tip" style={position} onMouseLeave={()=>{if(!pinned.current&&document.activeElement!==trigger.current)setOpen(false)}}>{reason}</span>,document.body)}
 </span>}</span>
}

import {useEffect,useRef,useState} from 'react'
import {Button,TextField,SelectRow,Row} from './ui.jsx'
import Icon from './Icon.jsx'
import {useUI} from '../store/useUI.js'
import {t} from '../lib/i18n.js'

const pad=n=>String(n).padStart(2,'0')
const valid=(value,end)=>/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(value)||(end&&value==='24:00')
function TimeSheet({value,allowEnd,title,choose,close,register}){
  const initial=valid(value,allowEnd)?value:'00:00'
  const [hour,setHour]=useState(initial.slice(0,2)),[minute,setMinute]=useState(initial.slice(3))
  return <><h3>{title}</h3><div className="list">
    <SelectRow title={t('Hour')} value={hour} options={Array.from({length:allowEnd?25:24},(_,n)=>({value:pad(n),label:pad(n)}))} onOpen={register} onChange={next=>{setHour(next);if(next==='24')setMinute('00')}}/>
    {hour==='24'?<Row title={t('Minute')} value="00"/>:<SelectRow title={t('Minute')} value={minute} options={Array.from({length:60},(_,n)=>({value:pad(n),label:pad(n)}))} onOpen={register} onChange={setMinute}/>}
  </div><div className="time-field-actions"><Button type="button" variant="tinted" onClick={close}>{t('Cancel')}</Button><Button type="button" variant="primary" onClick={()=>{choose(hour+':'+minute);close()}}>{t('Apply')}</Button></div></>
}

// Same controlled contract as NumberField. The text remains editable by keyboard;
// the optional picker reuses the app's themed sheets and selection controls.
export default function TimeField({value,onChange,allowEnd=false,disabled=false,'aria-label':label,...rest}){
  const latest=useRef({onChange,disabled}),sheets=useRef([]),alive=useRef(true)
  const closeOwned=()=>{for(const sheet of sheets.current.splice(0).reverse())sheet.close()}
  latest.current={onChange,disabled}
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;closeOwned()}},[])
  useEffect(()=>{if(disabled)closeOwned()},[disabled])
  const choose=next=>{if(alive.current&&!latest.current.disabled)latest.current.onChange(next)}
  const open=()=>{
    if(disabled)return
    closeOwned()
    const register=handle=>sheets.current.push(handle)
    register(useUI.getState().openSheet(close=><TimeSheet title={label||t('Choose time')} value={value} allowEnd={allowEnd} choose={choose} close={close} register={register}/>))
  }
  return <div className="time-field">
    <TextField {...rest} type="text" inputMode="numeric" autoComplete="off" placeholder="HH:mm" aria-label={label} disabled={disabled} value={value}
      pattern={allowEnd?'(?:[01][0-9]|2[0-3]):[0-5][0-9]|24:00':'(?:[01][0-9]|2[0-3]):[0-5][0-9]'}
      onChange={e=>choose(e.target.value)} onBlur={e=>{const raw=e.target.value;if(/^\d{4}$/.test(raw)){const next=raw.slice(0,2)+':'+raw.slice(2);if(valid(next,allowEnd))choose(next)}}}/>
    <button type="button" className="time-field-picker" disabled={disabled} aria-label={label?t('Choose time')+': '+label:t('Choose time')} onClick={open}><Icon name="clock"/></button>
  </div>
}

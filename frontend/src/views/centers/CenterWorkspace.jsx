import {useId} from 'react'
import {Button,SelectRow} from '../../components/ui.jsx'

// Shared by center areas and member profiles; the caller owns permissions and navigation.
export default function CenterWorkspace({label,options,value,onChange,children}){
  const panelId=useId()
  return <div className="centers-workspace">
    <nav className="centers-workspace-nav" aria-label={label}>
      <div className="centers-workspace-desktop-nav">{options.map(option=><Button key={option.value} type="button" aria-current={value===option.value?'page':undefined} aria-controls={panelId} onClick={()=>{if(option.value!==value)onChange(option.value)}}>{option.label}</Button>)}</div>
      <div className="centers-workspace-mobile-nav"><SelectRow title={label} value={value} options={options} onChange={option=>{if(option!==value)onChange(option)}}/></div>
    </nav>
    <div id={panelId} className="centers-workspace-content">{children}</div>
  </div>
}

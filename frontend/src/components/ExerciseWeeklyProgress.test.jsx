// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {it,expect,vi} from 'vitest'
vi.mock('../lib/i18n.js',()=>({t:(key,...args)=>key.replace(/\{(\d+)\}/g,(_,i)=>args[i]),exerciseNameFor:()=> 'Bench press'}))
import ExerciseWeeklyProgress from './ExerciseWeeklyProgress.jsx'
it('renders independent load/reps charts and explicit weekly changes, including missing data',()=>{
 const host=document.createElement('div'),root=createRoot(host)
 act(()=>root.render(<ExerciseWeeklyProgress unit="kg" period={{to:'2026-10-25'}} exercises={[{id:'0025',dbLoad:'as',side:'both',assisted:false,weeks:[{from:'2026-10-05',load:60,reps:8,sets:3},{from:'2026-10-19',load:65,reps:6,sets:2}]}]}/>))
 expect(host.textContent).toContain('Bench press');expect(host.querySelectorAll('svg[role="img"]')).toHaveLength(2)
 const rows=host.querySelectorAll('tbody tr');expect(rows).toHaveLength(3);expect(rows[0].textContent).toContain('+5');expect(rows[0].textContent).toContain('-2');expect(rows[1].querySelector('td').textContent).toContain('—')
 expect(host.querySelector('.strength-spark[data-state="higher"]')).not.toBeNull();expect(host.querySelector('.strength-spark[data-state="lower"]')).not.toBeNull();act(()=>root.unmount())
})

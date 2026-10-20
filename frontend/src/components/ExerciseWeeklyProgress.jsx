import {useState} from 'react'
import {Button} from './ui.jsx'
import {exerciseNameFor,t} from '../lib/i18n.js'
import {exOr} from '../lib/exercises.js'
import {fmtNum} from '../lib/format.js'
import {exerciseWeekRows,comparisonState} from '../lib/training-trend.js'

function Delta({value,assisted=false}){
 if(value==null)return <span className="strength-delta is-none">—</span>
 return <span className={'strength-delta is-'+comparisonState(value,assisted)} title={t('Compared with the previous recorded week.')}><span aria-hidden="true">{value===0?'=':value>0?'↑':'↓'}</span> {value>0?'+':''}{fmtNum(value)}</span>
}
function Spark({rows,field,label,assisted=false}){
 const values=rows.filter(row=>row[field]!=null),last=values.at(-1),low=Math.min(...values.map(row=>row[field])),high=Math.max(...values.map(row=>row[field])),range=high-low||1;
 let pen=false;const paths=rows.map((row,index)=>{
  if(row[field]==null){pen=false;return ''}const x=8+index/Math.max(1,rows.length-1)*264,y=66-(row[field]-low)/range*48;
  const path=(pen?'L':'M')+x+','+y;pen=true;return path;
 }).join(' ')
 const delta=last?.[field==='load'?'loadDelta':'repsDelta'];
 return <div className="strength-spark" data-state={comparisonState(delta,assisted)}><div className="strength-spark-heading"><span>{label}</span><strong>{last?fmtNum(last[field]):'—'}</strong><Delta value={delta} assisted={assisted}/></div>
  <svg viewBox="0 0 280 82" role="img" aria-label={label+' · '+t('Weekly comparison')}><path d="M8 70H272" className="strength-spark-baseline"/><path d={paths} className="strength-spark-line"/>{rows.map((row,index)=>row[field]!=null&&<circle key={row.from} cx={8+index/Math.max(1,rows.length-1)*264} cy={66-(row[field]-low)/range*48} r="3"><title>{row.from+': '+fmtNum(row[field])}</title></circle>)}</svg>
  <div className="training-trend-axis muted"><span>{rows[0]?.from}</span><span>{rows.at(-1)?.from}</span></div>
 </div>
}
function Exercise({exercise,period,unit,initialOpen}){
 const [all,setAll]=useState(false),rows=exerciseWeekRows(exercise,period),last=rows.filter(row=>row.load!=null).at(-1),recent=[...rows].reverse(),visible=all?recent:recent.slice(0,6)
 const name=exerciseNameFor(exOr(exercise.id)),side=exercise.side==='L'?t('Left'):exercise.side==='R'?t('Right'):null
 return <details className="strength-exercise" open={initialOpen}>
  <summary><div className="strength-exercise-title"><strong>{name}</strong><div className="strength-exercise-tags">{side&&<span className="tag">{side}</span>}{exercise.dbLoad!=='as'&&<span className="tag">{t(exercise.dbLoad==='each'?'Each':'Both')}</span>}{exercise.assisted&&<span className="tag">{t('Assisted')}</span>}</div></div><div className="strength-exercise-latest"><strong>{last?fmtNum(last.load)+' '+unit+' × '+fmtNum(last.reps):'—'}</strong><div className="strength-exercise-deltas"><span><Delta value={last?.loadDelta} assisted={exercise.assisted}/> {unit}</span><span><Delta value={last?.repsDelta}/> {t('Reps')}</span></div></div></summary>
  <div className="strength-exercise-body"><div className="strength-sparks"><Spark rows={rows} field="load" label={t('Load ({0})',unit)} assisted={exercise.assisted}/><Spark rows={rows} field="reps" label={t('Reps')}/></div>
   <p className="small muted">{t('Compared with the previous recorded week.')}</p>
   <div className="strength-week-table" tabIndex={0} role="region" aria-label={name+' · '+t('Weekly comparison')}><table><thead><tr><th scope="col">{t('Week')}</th><th scope="col">{t('Load ({0})',unit)}</th><th scope="col">{t('Reps')}</th><th scope="col">{t('Sets')}</th></tr></thead><tbody>{visible.map(row=><tr key={row.from}><th scope="row">{row.from}</th><td><strong>{row.load==null?'—':fmtNum(row.load)}</strong><Delta value={row.loadDelta} assisted={exercise.assisted}/></td><td><strong>{row.reps==null?'—':fmtNum(row.reps)}</strong><Delta value={row.repsDelta}/></td><td>{row.sets??'—'}</td></tr>)}</tbody></table></div>
   {rows.length>6&&<Button size="sm" onClick={()=>setAll(!all)}>{t(all?'Show less':'Show more')}</Button>}
  </div>
 </details>
}
export default function ExerciseWeeklyProgress({exercises,period,unit}){
 return <div className="strength-comparison"><h4>{t('Weekly comparison')}</h4><p className="small muted">{t('Weekly reference: highest load and its repetitions; lowest assistance on assisted machines. Completed work sets only.')}</p>
  {!exercises.length&&<p className="small muted" role="status">{t('No completed sets to compare.')}</p>}
  {exercises.map((exercise,index)=><Exercise key={JSON.stringify([exercise.id,exercise.side,exercise.dbLoad,exercise.assisted])} exercise={exercise} period={period} unit={unit} initialOpen={index===0}/>)}
 </div>
}

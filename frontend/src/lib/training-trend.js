// Display saved-session frequency; no load estimates or completion/adherence claims.
export function routineTrend(row,period){
  const start=new Date(period.from+'T00:00:00Z'),end=new Date(period.to+'T00:00:00Z');
  if(!Number.isFinite(+start)||!Number.isFinite(+end)||start>end)return [];
  start.setUTCDate(start.getUTCDate()-(start.getUTCDay()+6)%7);
  const values=new Map((row.weeks||[]).map(week=>[week.from,week.sessions]));
  const points=[];
  for(let day=start;day<=end&&points.length<54;day.setUTCDate(day.getUTCDate()+7)){
    const from=day.toISOString().slice(0,10);points.push({from,sessions:values.get(from)||0});
  }
  return points;
}

export function exerciseWeekRows(exercise,period){
 const values=new Map((exercise.weeks||[]).map(row=>[row.from,row]));
 const first=[...values.keys()].sort()[0];if(!first)return [];
 let previous=null;
 return routineTrend({weeks:[]},{from:first,to:period.to}).map(point=>{
  const row=values.get(point.from);if(!row)return {from:point.from,load:null,reps:null,sets:null,loadDelta:null,repsDelta:null};
  const result={...row,loadDelta:previous?Math.round((row.load-previous.load)*1000)/1000:null,repsDelta:previous?row.reps-previous.reps:null};previous=row;return result;
 });
}
export const comparisonState=(delta,assisted=false)=>delta==null?'none':delta===0?'equal':(delta>0)!==assisted?'higher':'lower'

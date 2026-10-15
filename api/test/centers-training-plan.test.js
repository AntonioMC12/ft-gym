import {test} from 'node:test';
import assert from 'node:assert/strict';
import {trainingPlan as validateTrainingPlan,appliedTrainingDelivery} from '../centers/domain/training-plan.js';
import {libraryHas} from '../coach/core/library.js';
const trainingPlan=value=>validateTrainingPlan(value,libraryHas);

const plan=()=>({opengym_plan:1,name:'Strength',unit:'kg',routines:[{id:'r1',name:'Push',emoji:'💪',prog:'double',ex:[{id:'0025',sets:3,reps:8,weight:60}]}],week:{1:['r1']},customEx:[]});
test('proposals fail closed without the injected existing catalogue',()=>{
  assert.throws(()=>validateTrainingPlan(plan()),{status:503,code:'training-catalogue-unavailable'});
});
test('training proposals preserve the full prescription vocabulary with deterministic normalization',()=>{
  const p=plan();p.routines[0].excludeFromProgression=true;
  Object.assign(p.routines[0].ex[0],{mode:'reps',pyramid:[12,8,'max'],pyramidRest:[90,60,0],pyramidWeight:[60,65,0],bodyweight:false,side:true,prog:'linear',inc:2.5,backoff:true,lastToFailure:true,deloadFactor:0.8,dbLoad:'each',repsMin:5,repsMax:12,setsMax:5,restSec:90,warmupRestSec:60,sg:'a',note:'Keep form',warmupSets:2,intensifier:{type:'dropset',count:2,pct:20}});
  assert.deepEqual(trainingPlan(p),p);
  p.routines[0].ex[0].intensifier={type:'restpause',totalReps:12,restSec:15};
  assert.deepEqual(trainingPlan(p),p);
  const reordered={unit:p.unit,customEx:[],week:{1:'r1'},routines:p.routines,name:p.name,opengym_plan:1,exported:'2026-10-15'};
  assert.deepEqual(trainingPlan(reordered),p);
});
test('proposals reject whole profiles, private media, unknown catalogue IDs and ambiguous prescriptions',()=>{
  const mutations=[
    p=>{p.workouts=[]},p=>{p.routines[0].account_uid='victim'},p=>{p.routines[0].ex[0].video='https://example.invalid'},
    p=>{p.customEx=[{id:'custom'}]},p=>{p.unit='lbs'},p=>{delete p.unit},p=>{p.opengym_plan=true},p=>{p.routines[0].ex[0].id='unknown'},
    p=>{p.routines[0].ex[0].sets='3'},p=>{p.routines[0].ex[0].weight=NaN},p=>{p.routines[0].ex[0].side='true'},p=>{p.routines[0].ex[0].warmupSets=6},
    p=>{p.routines[0].ex[0].prog='run-script'},p=>{p.routines[0].ex[0].pyramid=['bogus']},p=>{p.routines[0].ex[0].pyramidRest=[90]},
    p=>{p.routines[0].ex[0].intensifier={type:'dropset',count:2,pct:20,script:'bad'}},p=>{p.week={7:['r1']}},
    p=>{p.week={1:['foreign']}},p=>{p.week={1:['r1','r1']}},p=>{p.routines.push(structuredClone(p.routines[0]))},p=>{p.routines[0].ex=[]},
  ];
  for(const mutate of mutations){const p=plan();mutate(p);assert.throws(()=>trainingPlan(p),{status:400,code:'invalid-training-plan'})}
});
test('proposals bound routines, per-routine exercises, total exercises, note length and UTF-8 bytes',()=>{
  const p=plan(),exercise=p.routines[0].ex[0];
  assert.throws(()=>trainingPlan({...p,routines:Array.from({length:21},(_,i)=>({...p.routines[0],id:`r${i}`}))}),{status:400});
  p.routines[0].ex=Array.from({length:41},()=>exercise);assert.throws(()=>trainingPlan(p),{status:400});
  p.routines=Array.from({length:6},(_,i)=>({id:`r${i}`,name:'Many',ex:Array.from({length:40},()=>exercise)}));assert.throws(()=>trainingPlan(p),{status:400});
  const q=plan();q.routines[0].ex[0].note='x'.repeat(1001);assert.throws(()=>trainingPlan(q),{status:400});
  q.routines[0].ex=Array.from({length:40},()=>({...exercise,note:'🦾'.repeat(450)}));assert.throws(()=>trainingPlan(q),{status:400});
  const cycle=plan();cycle.week=cycle;assert.throws(()=>trainingPlan(cycle),{status:400});
});
test('durable delivery evidence must exactly match the accepted marker and all destinations',()=>{
  const key='td_'+'a'.repeat(32),id='cr_'+'b'.repeat(32),acceptedAt=1800000000000,delivery={deliveryKey:key,acceptedAt,routineIds:{r1:id}};
  const s={planDeliveries:[{id:key,acceptedAt,routineIds:[id]}],routines:[{id}]};
  assert.equal(appliedTrainingDelivery(s,delivery),'applied');
  assert.equal(appliedTrainingDelivery(s,{...delivery,acceptedAt:acceptedAt+1}),null);
  assert.equal(appliedTrainingDelivery({...s,planDeliveries:[]},delivery),null);
  assert.equal(appliedTrainingDelivery({...s,routines:[]},delivery),null);
  assert.equal(appliedTrainingDelivery({...s,routines:[],deleted:{routines:{[id]:123}}},delivery),'removed');
  assert.equal(appliedTrainingDelivery({...s,routines:[],resetIds:{routines:[id]}},delivery),'removed');
  assert.equal(appliedTrainingDelivery({...s,routines:[],deleted:{routines:{[id]:-123}}},delivery),null);
  assert.equal(appliedTrainingDelivery(null,delivery),null);
});

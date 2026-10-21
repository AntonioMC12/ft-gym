import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classSeriesInput} from '../centers/domain/class-series.js';
import {classFields} from '../centers/domain/classes.js';
const fields={name:'Weekly class',date:'2026-10-18',startTime:'02:15',endTime:'02:45',capacity:10,waitlistCapacity:0,cancelBeforeMinutes:0,eligiblePlanIds:['plan_a']};
test('weekly calendar expands exact civil dates, explicit exclusions and normalized selections',()=>{
  const input=classSeriesInput(fields,{until:'2026-11-01',weekdays:[0],excludedDates:['2026-10-25']},'Europe/Madrid');
  assert.deepEqual(input.dates,[{date:'2026-10-18',excluded:false},{date:'2026-10-25',excluded:true},{date:'2026-11-01',excluded:false}]);
  assert.equal(Object.hasOwn(input.fields,'startsAt'),false);assert.equal(Object.hasOwn(input.fields,'timezone'),false);
  assert.throws(()=>classFields({...input.fields,date:'2026-10-25'},{timezone:input.timezone}),{code:'class-time-ambiguous'});
  assert.equal(classFields({...input.fields,date:'2026-10-25',disambiguation:{start:'earlier',end:'later'}},{timezone:input.timezone}).endsAt,'2026-10-25T01:45:00.000Z');
});
test('weekly bounds reject ambiguous input, unknown authority and silently ignored exclusions',()=>{
  for(const rule of [{until:'2026-10-17',weekdays:[0]},{until:'2027-02-01',weekdays:[0]},{until:'2026-11-01',weekdays:[]},{until:'2026-11-01',weekdays:[0,0]},{until:'2026-11-01',weekdays:[7]},{until:'2026-11-01',weekdays:[0],excludedDates:['2026-10-19']},{until:'2026-11-01',weekdays:[0],excludedDates:['2026-10-25','2026-10-25']},{until:'2026-11-01',weekdays:[0],actorUid:'forged'}])assert.throws(()=>classSeriesInput(fields,rule,'Europe/Madrid'));
  assert.throws(()=>classSeriesInput({...fields,seriesId:'claimed'},{until:'2026-11-01',weekdays:[0]},'Europe/Madrid'));
});

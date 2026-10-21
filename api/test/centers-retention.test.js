import {test} from 'node:test';
import assert from 'node:assert/strict';
import {retentionFields,retentionActionFields,retentionOptions} from '../centers/domain/retention.js';
test('inactivity is opt-in with explicit bounded days and an explicit never-visited policy',()=>{
  assert.deepEqual(retentionFields({enabled:false,includeNeverVisited:false}),{enabled:false,daysWithoutVisit:null,includeNeverVisited:false});
  assert.equal(retentionFields({enabled:true,daysWithoutVisit:7,includeNeverVisited:true}).daysWithoutVisit,7);
  for(const raw of [{enabled:true,includeNeverVisited:false},{enabled:true,daysWithoutVisit:0,includeNeverVisited:false},{enabled:true,daysWithoutVisit:3651,includeNeverVisited:false},{enabled:true,daysWithoutVisit:7},{enabled:false,includeNeverVisited:false,memberId:'other'}])assert.throws(()=>retentionFields(raw),{status:400});
});
test('recorded reviews require explicit outcomes and dismissal reasons, with bounded list selectors',()=>{
  assert.deepEqual(retentionActionFields({outcome:'reviewed'}),{outcome:'reviewed',note:null});assert.equal(retentionActionFields({outcome:'contacted',note:'Already contacted manually'}).outcome,'contacted');
  for(const raw of [{outcome:'email'},{outcome:'dismissed'},{outcome:'dismissed',note:' '},{outcome:'reviewed',note:'x'.repeat(501)}])assert.throws(()=>retentionActionFields(raw),{status:400});
  assert.deepEqual(retentionOptions(new URLSearchParams()),{view:'open',cursor:null});assert.throws(()=>retentionOptions(new URLSearchParams('accountUid=x')),{status:400});assert.throws(()=>retentionOptions(new URLSearchParams('view=all')),{status:400});
});

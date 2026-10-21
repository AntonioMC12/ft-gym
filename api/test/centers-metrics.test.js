import {test} from 'node:test';
import assert from 'node:assert/strict';
import {metricsOptions,metricsDto} from '../centers/domain/metrics.js';

test('metrics periods are bounded actual business dates and reject identity/clock selectors',()=>{
  assert.deepEqual(metricsOptions(new URLSearchParams()),{from:null,to:null});
  assert.deepEqual(metricsOptions(new URLSearchParams('from=2024-01-01&to=2024-12-31')),{from:'2024-01-01',to:'2024-12-31'});
  for(const value of ['from=2026-01-01','from=2026-02-30&to=2026-03-01','from=2026-02-02&to=2026-02-01','from=2024-01-01&to=2025-01-01','from=&to=','accountUid=other','memberId=other','now=0'])assert.throws(()=>metricsOptions(new URLSearchParams(value)),{status:400});
  assert.throws(()=>metricsOptions(new URLSearchParams('centerId=other'),{global:true}),{status:400});
});
test('metrics keep exact monetary/count strings, distinguish flow from stock and mark unsupported overdue policy',()=>{
  const row={period_from:'2026-10-01',period_to:'2026-10-15',latest_today:'2026-10-15',captured_at:'2026-10-15T12:00:00Z',center_count:'2',members:'12',active_members:'8',frozen_members:'2',ended_members:'1',preactive_members:'1',subscriptions:'10',registered_members:'3',activations:'2',terminations:'1',receipts_issued:'4',receipt_total_minor:'999999999999999999',collections_minor:'9007199254740993',refunds_minor:'9007199254740994',net_collections_minor:'-1',outstanding_minor:'9007199254740995',overdue_minor:'9007199254740990',incomplete_policies:'0'};
  const report=metricsDto(row);assert.equal(report.definitionVersion,1);assert.equal(report.period.netCollectionsMinor,'-1');assert.equal(report.current.outstandingMinor,row.outstanding_minor);assert.equal(report.current.active,'8');assert.equal(report.period.activations,'2');assert.ok(!('occupancy' in report));assert.ok(!('visits' in report));
  const partial=metricsDto({...row,incomplete_policies:'1'});assert.equal(partial.current.overdueMinor,null);assert.equal(partial.current.overduePolicyComplete,false);assert.equal(partial.current.outstandingMinor,row.outstanding_minor);
  assert.throws(()=>metricsDto({...row,period_to:'2026-10-16'}),{status:400,code:'invalid-metrics-period'});
});

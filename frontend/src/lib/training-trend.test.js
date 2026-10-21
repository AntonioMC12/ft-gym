import {it,expect} from 'vitest'
import {routineTrend,exerciseWeekRows,comparisonState} from './training-trend.js'
it('fills weeks without sessions with zero and uses Mondays across year boundaries',()=>{
 expect(routineTrend({weeks:[{from:'2025-12-29',sessions:3},{from:'2026-01-12',sessions:1}]},{from:'2025-12-31',to:'2026-01-18'})).toEqual([{from:'2025-12-29',sessions:3},{from:'2026-01-05',sessions:0},{from:'2026-01-12',sessions:1}])
})
it('keeps missing weeks empty and compares to previous recorded week without inventing zero loads',()=>{
 const rows=exerciseWeekRows({weeks:[{from:'2026-10-05',load:60,reps:8,sets:3},{from:'2026-10-19',load:65,reps:6,sets:3}]},{to:'2026-10-25'})
 expect(rows).toHaveLength(3);expect(rows[1]).toMatchObject({load:null,reps:null,loadDelta:null});expect(rows[2]).toMatchObject({loadDelta:5,repsDelta:-2})
 expect(comparisonState(5)).toBe('higher');expect(comparisonState(5,true)).toBe('lower');expect(comparisonState(-5,true)).toBe('higher');expect(comparisonState(0)).toBe('equal');expect(comparisonState(null)).toBe('none')
})
it('includes zero activity and rejects malformed or reversed periods',()=>{
 expect(routineTrend({weeks:[]},{from:'2026-10-20',to:'2026-10-20'})).toEqual([{from:'2026-10-19',sessions:0}])
 expect(routineTrend({},{from:'bad',to:'bad'})).toEqual([])
 expect(routineTrend({},{from:'2026-10-20',to:'2026-10-19'})).toEqual([])
})

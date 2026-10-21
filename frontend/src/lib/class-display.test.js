import {it,expect} from 'vitest'
import {classSchedule} from './class-display.js'
it('formats both ends in the scheduled center zone, independently of the viewer device zone',()=>{
  const event={startsAt:'2026-10-20T08:00:00Z',endsAt:'2026-10-20T09:00:00Z',timezone:'Asia/Kathmandu'}
  const text=classSchedule(event,'en-GB');expect(text).toContain('13:45');expect(text).toContain('14:45');expect(text).toContain('2026')
})

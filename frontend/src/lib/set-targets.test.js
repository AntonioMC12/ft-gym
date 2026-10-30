import { describe, it, expect } from 'vitest'
import { buildSets, setsRepsOf } from './history.js'
import { policyFor, plannedOf, planChanged } from './progression.js'
import { plannedRepReference } from './rep-reference.js'
import { resizeSetTargets } from './set-targets.js'
const cfg = { id: '0025', mode: 'reps', sets: 3, reps: 10, weight: 40, setTargets: [{repsMin:8,reps:10},{repsMin:10,reps:12},{reps:12}] }
describe('per-set goals throughout training', () => {
  it('builds each row at its own minimum or fixed target and formats the plan', () => {
    expect(buildSets({workouts:[]}, cfg).map(s => s.r)).toEqual([8,10,12])
    expect(setsRepsOf(cfg)).toBe('8–10 · 10–12 · 12')
    expect(policyFor(cfg, {prog:'double'})).toBe('off')
  })
  it('stamps a deep copy and recognises edits to an individual range', () => {
    const planned = plannedOf(cfg)
    expect(planChanged(planned, cfg)).toBe(false)
    expect(planChanged(planned, {...cfg,setTargets:[{repsMin:9,reps:10},...cfg.setTargets.slice(1)]})).toBe(true)
    expect(planned.setTargets[0]).not.toBe(cfg.setTargets[0])
  })
  it('adds independent copies of the last goal and preserves existing goals', () => {
    const targets = resizeSetTargets(cfg,4)
    expect(targets).toEqual([...cfg.setTargets,{reps:12}])
    expect(targets[3]).not.toBe(targets[2])
  })
})

it('references the goal of each work set after warmups, including per-side targets', () => {
 const entry={target:cfg,sets:[{phase:'warmup'},{r:null},{r:null},{r:null}]}
 expect(plannedRepReference(entry,2)).toBe('10–12')
 const plain={target:cfg,sets:[{r:null},{r:null},{r:null}]}
 expect(plannedRepReference(plain,0)).toBe('8–10')
 expect(plannedRepReference(plain,1)).toBe('10–12')
 expect(plannedRepReference(plain,2)).toBe('12')
 expect(plannedRepReference(plain,1,'L')).toBe('5–6')
})

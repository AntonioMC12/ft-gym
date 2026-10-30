/** Per-set goals use the same upper/lower bounds as flat prescriptions. */
export const hasSetTargets = cfg => Array.isArray(cfg?.setTargets) && cfg.setTargets.length > 0
export const validSetTarget = goal => Number.isSafeInteger(goal?.reps) && goal.reps > 0 && goal.reps <= 1000 && (goal.repsMin == null || (Number.isSafeInteger(goal.repsMin) && goal.repsMin > 0 && goal.repsMin <= goal.reps))
export const setTargetLabel = goal => goal.repsMin > 0 && goal.repsMin < goal.reps ? goal.repsMin + '–' + goal.reps : String(goal.reps)
export const setTargetsLabel = cfg => cfg.setTargets.map(setTargetLabel).join(' · ')
export function resizeSetTargets(cfg, count) {
  return Array.from({ length: Math.max(1, Math.min(50, Math.round(count) || 1)) }, (_, i) => ({ ...(cfg.setTargets?.[i] || cfg.setTargets?.at(-1) || { reps: cfg.reps || 10, ...(cfg.repsMin > 0 ? { repsMin: cfg.repsMin } : {}) }) }))
}

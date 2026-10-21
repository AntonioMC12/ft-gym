// Per-device navigation preference, never training state or permissions.
export const PLAN_VIEW_KEY='gym_plan_view'
export function readPlanView(){try{return localStorage.getItem(PLAN_VIEW_KEY)==='routines'?'routines':'schedule'}catch{return 'schedule'}}
export function writePlanView(view){try{localStorage.setItem(PLAN_VIEW_KEY,view)}catch{}}

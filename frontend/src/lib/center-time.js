import {dateLocale} from './i18n-core.js'

// Physical visits are instants; unlike a due-date string they must be displayed
// in the center's zone, including entries around the local day boundary.
export function centerDateTime(value,timezone){
  const date=new Date(value);if(!Number.isFinite(date.getTime()))return '–'
  try{return new Intl.DateTimeFormat(dateLocale(),{timeZone:timezone||'UTC',dateStyle:'medium',timeStyle:'short'}).format(date)}catch{return date.toISOString()}
}

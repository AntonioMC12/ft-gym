import {routineOrigin} from '../lib/routine-origin.js'
import {t} from '../lib/i18n.js'
export default function RoutineOriginBadge({state,routine}){
 return <OriginBadge trainer={routineOrigin(state,routine)==='trainer'}/>
}
export function OriginBadge({trainer}){
 return <span className={'tag'+(trainer?' acc':'')} style={{marginInlineStart:8,verticalAlign:'middle'}}>{trainer?'FT Trainer':t('Personal routine')}</span>
}

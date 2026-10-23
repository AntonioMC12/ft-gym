import { useSyncExternalStore } from 'react'
import { subscribeCatalogue, catalogueRevision, isSharedEx } from '../lib/exercises.js'
import { t } from '../lib/i18n.js'
export const useCatalogueRevision = () => useSyncExternalStore(subscribeCatalogue, catalogueRevision, catalogueRevision)
export function ExerciseOriginBadge({ ex }) { useCatalogueRevision(); return isSharedEx(ex) ? <span className="tag acc ft-exercise-label">FT Training</span> : null }
export function ExerciseOriginFilter({ value, onChange }) {
  return <div className="chips" style={{ marginBottom: 10 }} aria-label={t('Exercise origin')}>
    {[['','All'],['platform','FT Training'],['base','Base catalogue'],['own','My exercises']].map(([key, label]) =>
      <button key={key} className={'chip nocap' + (value === key ? ' on' : '')} aria-pressed={value === key} onClick={() => onChange(key)}>{t(label)}</button>)}
  </div>
}

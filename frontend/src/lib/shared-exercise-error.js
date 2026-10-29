import { t } from './i18n.js'
import { fmtMB } from './media-limits.js'

const positive = n => typeof n === 'number' && Number.isFinite(n) && n > 0

export function sharedExerciseErrorText(error) {
  const code = error?.code, status = error?.status, data = error?.data || {}
  // A quota refusal is also 413: preserve its specific cause before the status fallback.
  if (code === 'media-quota') return t('The server has no space available for more photos or videos.')
  if (code === 'media-too-long') return positive(data.maxSec)
    ? t('That video is too long. Max {0} seconds.', data.maxSec)
    : t('The server refused the video because it is too long.')
  if (code === 'media-too-large' || code === 'proxy-too-large' || status === 413) {
    return positive(data.maxMB)
      ? t('That file is too big. Max {0} MB.', fmtMB(data.maxMB))
      : t('The server refused the file as too large.')
  }
  if (code === 'media-type' || status === 415) return t('That file type isn’t supported. Use a photo, a GIF, or an MP4, MOV or WebM video.')
  if (['media-invalid', 'hash-mismatch', 'shared-media-missing', 'invalid-media'].includes(code)) return t('Could not save the media. Select the file again and retry.')
  if (code === 'storage-full' || status === 507) return t('The server has no space available for more photos or videos.')
  if (code === 'exercise-semantics-immutable') return t('Changing the movement type requires a new exercise.')
  if (status === 401) return t('Your session has expired. Sign in again to save the exercise.')
  if (status === 403) return t('You do not have permission to save shared exercises.')
  if (status === 409) return t('The exercise has changed. Reload it before saving again.')
  if (status === 429) return t('Too many upload attempts. Wait a moment and try again.')
  if (code === 'timeout' || status === 408 || status === 504) return t('The server did not answer in time.')
  if (code === 'network' || code === 'offline' || !status && error instanceof TypeError) return t('Could not save the shared exercise. Check connection and try again.')
  // Unknown errors must not invent a connection failure or show raw server/HTML messages.
  return t('Could not save the shared exercise. Try again.')
}

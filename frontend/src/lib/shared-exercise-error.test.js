import { afterEach, expect, it } from 'vitest'
import { sharedExerciseErrorText } from './shared-exercise-error.js'
import { _setLangState } from './i18n-core.js'
import es from '../locales/es.js'

afterEach(() => _setLangState('en', null, null, null))

it.each([
  [{ status: 413, code: 'proxy-too-large' }, 'The server refused the file as too large.'],
  [{ status: 413, code: 'http' }, 'The server refused the file as too large.'],
  [{ status: 413, code: 'media-too-large', data: { maxMB: 50 } }, 'That file is too big. Max 50 MB.'],
  [{ status: 413, code: 'media-too-large', data: { maxMB: NaN } }, 'The server refused the file as too large.'],
  [{ status: 413, code: 'media-quota' }, 'The server has no space available for more photos or videos.'],
  [{ status: 413, code: 'media-too-long', data: { maxSec: 60 } }, 'That video is too long. Max 60 seconds.'],
  [{ status: 413, code: 'media-too-long' }, 'The server refused the video because it is too long.'],
  [{ status: 415 }, 'That file type isn’t supported. Use a photo, a GIF, or an MP4, MOV or WebM video.'],
  [{ code: 'shared-media-missing' }, 'Could not save the media. Select the file again and retry.'],
  [{ status: 507 }, 'The server has no space available for more photos or videos.'],
  [{ status: 401 }, 'Your session has expired. Sign in again to save the exercise.'],
  [{ status: 403 }, 'You do not have permission to save shared exercises.'],
  [{ status: 409, code: 'exercise-version-conflict' }, 'The exercise has changed. Reload it before saving again.'],
  [{ status: 409, code: 'exercise-semantics-immutable' }, 'Changing the movement type requires a new exercise.'],
  [{ status: 429 }, 'Too many upload attempts. Wait a moment and try again.'],
  [{ code: 'timeout' }, 'The server did not answer in time.'],
  [{ code: 'network' }, 'Could not save the shared exercise. Check connection and try again.'],
  [new TypeError('Failed to fetch'), 'Could not save the shared exercise. Check connection and try again.'],
  [{ status: 500, message: '<html>private server details</html>' }, 'Could not save the shared exercise. Try again.'],
  [new Error('unknown'), 'Could not save the shared exercise. Try again.'],
])('presents the cause of %j', (error, expected) => {
  expect(sharedExerciseErrorText(error)).toBe(expected)
})

it('shows the size refusal in Spanish without inventing a proxy limit', () => {
  _setLangState('es', es, null, null)
  expect(sharedExerciseErrorText({ status: 413, code: 'proxy-too-large' }))
    .toBe('El servidor rechazó el archivo por ser demasiado grande.')
  expect(sharedExerciseErrorText({ status: 413, code: 'media-too-large', data: { maxMB: 50 } }))
    .toBe('Ese archivo es demasiado grande. Máximo 50 MB.')
  expect(sharedExerciseErrorText({ status: 500 }))
    .toBe('No se pudo guardar el ejercicio compartido. Vuelve a intentarlo.')
})

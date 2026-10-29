const es = {
 'Archived routines':'Rutinas archivadas',
 'Refresh proposals':'Actualizar propuestas',
 'Change member':'Cambiar socio',
 'Personal routine':'Personal',
 'Active assignments':'Activas','Archived assignments':'Archivadas',
 'Pending synchronization':'Pendiente de sincronización',
 'Assignments':'Asignaciones','Archived':'Archivadas','Partially archived':'Parcialmente archivada','Withdrawn by superadmin':'Retirada por el superadmin','Removed by member':'Retirada por el socio','Retire assignment?':'¿Retirar asignación?','Retire assignment':'Retirar asignación','Saved workouts and the current session are kept. Removal applies when the member synchronizes.':'Se conservan los entrenamientos guardados y la sesión en curso. La retirada se aplica cuando el socio sincronice.',
 'Publish private exercises to FT Training from their exercise details before sending this plan.': 'Publica los ejercicios privados en FT Training desde su ficha antes de enviar este plan.',
 'Member progress': 'Progreso Socios', 'Read only': 'Solo consulta', 'No training data': 'No hay entrenamientos registrados', 'Could not load member progress': 'No se pudo cargar el progreso del socio',
  'Exercise origin': 'Origen del ejercicio', 'FT Training': 'FT Training', 'Base catalogue': 'Catálogo base', 'My exercises': 'Mis ejercicios',
  'Create FT Training exercise': 'Crear ejercicio FT Training', 'Create or edit FT Training exercise': 'Crear o editar ejercicio FT Training',
  'This exercise will be available to everyone.': 'Este ejercicio estará disponible para todos.',
  'Could not save the shared exercise. Check connection and try again.': 'No se pudo guardar el ejercicio compartido. Comprueba la conexión y vuelve a intentarlo.',
  'Could not save the shared exercise. Try again.': 'No se pudo guardar el ejercicio compartido. Vuelve a intentarlo.',
  'The server has no space available for more photos or videos.': 'El servidor no tiene espacio disponible para más fotos o vídeos.',
  'The server refused the video because it is too long.': 'El servidor rechazó el vídeo porque supera la duración permitida.',
  'Could not save the media. Select the file again and retry.': 'No se pudo guardar el archivo multimedia. Selecciónalo de nuevo y vuelve a intentarlo.',
  'Your session has expired. Sign in again to save the exercise.': 'Tu sesión ha caducado. Inicia sesión de nuevo para guardar el ejercicio.',
  'You do not have permission to save shared exercises.': 'No tienes permiso para guardar ejercicios compartidos.',
  'The exercise has changed. Reload it before saving again.': 'El ejercicio ha cambiado. Vuelve a cargarlo antes de guardar.',
  'Too many upload attempts. Wait a moment and try again.': 'Demasiados intentos de subida. Espera un momento y vuelve a intentarlo.',
  'Changing the movement type requires a new exercise.': 'Para cambiar el tipo de movimiento debes crear otro ejercicio.',
  'Shared exercises are unavailable. Reconnect to load your routine safely.': 'Los ejercicios compartidos no están disponibles. Vuelve a conectarte para cargar tu rutina correctamente.',
  'Hidden from new selections. Existing routines and history remain available.': 'Se ocultará de las nuevas selecciones. Las rutinas existentes y el historial seguirán disponibles.',
  'Publish to FT Training': 'Publicar en FT Training', 'Publish': 'Publicar', 'Archive': 'Archivar',
  'This exercise will be available to everyone. Existing routines and history keep its identifier.': 'Este ejercicio estará disponible para todos. Las rutinas y el historial conservarán su identificador.',
  'This exercise cannot be published. Check its definition and media.': 'No se puede publicar este ejercicio. Revisa sus datos y archivos multimedia.',
}
const labels = {
  de: ['Übungsherkunft','Basiskatalog','Meine Übungen'], fr: ["Origine de l’exercice",'Catalogue de base','Mes exercices'],
  it: ["Origine dell’esercizio",'Catalogo base','I miei esercizi'], pt: ['Origem do exercício','Catálogo base','Os meus exercícios'],
  'pt-BR': ['Origem do exercício','Catálogo base','Meus exercícios'], pl: ['Pochodzenie ćwiczenia','Katalog podstawowy','Moje ćwiczenia'],
  tr: ['Egzersiz kaynağı','Temel katalog','Egzersizlerim'], ru: ['Источник упражнения','Базовый каталог','Мои упражнения'],
  uk: ['Джерело вправи','Базовий каталог','Мої вправи'], zh: ['动作来源','基础动作库','我的动作'], 'zh-TW': ['動作來源','基本動作庫','我的動作'],
  ko: ['운동 출처','기본 카탈로그','내 운동'], hi: ['व्यायाम का स्रोत','मूल सूची','मेरे व्यायाम'], bn: ['ব্যায়ামের উৎস','মূল তালিকা','আমার ব্যায়াম'],
  th: ['แหล่งที่มาของท่า','รายการพื้นฐาน','ท่าของฉัน'], hu: ['Gyakorlat forrása','Alapkatalógus','Saját gyakorlatok'], ar: ['مصدر التمرين','الكتالوج الأساسي','تماريني'],
}
export function sharedExerciseStrings(lang) {
  if (lang === 'es') return es
  const out = Object.fromEntries(Object.keys(es).map(key => [key, key]))
  if (labels[lang]) ['Exercise origin','Base catalogue','My exercises'].forEach((key, i) => { out[key] = labels[lang][i] })
  return out
}

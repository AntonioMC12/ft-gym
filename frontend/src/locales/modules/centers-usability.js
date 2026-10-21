const keys = ['Add time interval','Scroll to see more sections','Assign a manager to activate this draft before importing members.','Activate the center before importing members.']
const words = {
  es: 'Añadir tramo|Desliza para ver más apartados|Asigna un responsable para activar este borrador antes de importar socios.|Activa el centro antes de importar socios.',
  de: 'Zeitspanne hinzufügen|Scrollen, um weitere Bereiche zu sehen|Weise eine Leitung zu, um diesen Entwurf vor dem Mitgliederimport zu aktivieren.|Aktiviere das Zentrum vor dem Mitgliederimport.',
  fr: 'Ajouter un créneau|Faites défiler pour voir les autres rubriques|Affectez un responsable pour activer ce brouillon avant d’importer des membres.|Activez le centre avant d’importer des membres.',
  it: 'Aggiungi fascia oraria|Scorri per vedere altre sezioni|Assegna un responsabile per attivare questa bozza prima di importare i soci.|Attiva il centro prima di importare i soci.',
  pt: 'Adicionar intervalo|Deslize para ver mais secções|Atribua um responsável para ativar este rascunho antes de importar sócios.|Ative o centro antes de importar sócios.',
  'pt-BR': 'Adicionar intervalo|Deslize para ver mais seções|Atribua um responsável para ativar este rascunho antes de importar sócios.|Ative o centro antes de importar sócios.',
  pl: 'Dodaj przedział godzin|Przewiń, aby zobaczyć więcej sekcji|Przypisz kierownika, aby aktywować ten szkic przed importem członków.|Aktywuj centrum przed importem członków.',
  hu: 'Idősáv hozzáadása|Görgessen a további szakaszokhoz|Rendeljen hozzá vezetőt a piszkozat aktiválásához a tagok importálása előtt.|Aktiválja a központot a tagok importálása előtt.',
  tr: 'Zaman aralığı ekle|Diğer bölümleri görmek için kaydırın|Üyeleri içe aktarmadan önce bu taslağı etkinleştirmek için bir yönetici atayın.|Üyeleri içe aktarmadan önce merkezi etkinleştirin.',
  ru: 'Добавить интервал|Прокрутите, чтобы увидеть другие разделы|Назначьте руководителя для активации черновика перед импортом участников.|Активируйте центр перед импортом участников.',
  uk: 'Додати інтервал|Прокрутіть, щоб побачити інші розділи|Призначте керівника для активації чернетки перед імпортом учасників.|Активуйте центр перед імпортом учасників.',
  ar: 'إضافة فترة زمنية|مرّر لعرض المزيد من الأقسام|عيّن مسؤولًا لتفعيل هذه المسودة قبل استيراد الأعضاء.|فعّل المركز قبل استيراد الأعضاء.',
  hi: 'समय अंतराल जोड़ें|अधिक अनुभाग देखने के लिए स्क्रॉल करें|सदस्य आयात करने से पहले इस ड्राफ्ट को सक्रिय करने के लिए प्रबंधक नियुक्त करें।|सदस्य आयात करने से पहले केंद्र सक्रिय करें।',
  bn: 'সময়ের পরিসর যোগ করুন|আরও বিভাগ দেখতে স্ক্রল করুন|সদস্য আমদানির আগে এই খসড়া সক্রিয় করতে একজন ব্যবস্থাপক নিয়োগ করুন।|সদস্য আমদানির আগে কেন্দ্র সক্রিয় করুন।',
  th: 'เพิ่มช่วงเวลา|เลื่อนเพื่อดูส่วนอื่น|กำหนดผู้รับผิดชอบเพื่อเปิดใช้งานฉบับร่างนี้ก่อนนำเข้าสมาชิก|เปิดใช้งานศูนย์ก่อนนำเข้าสมาชิก',
  ko: '시간대 추가|스크롤하여 다른 섹션 보기|회원을 가져오기 전에 관리자를 지정하여 이 초안을 활성화하세요.|회원을 가져오기 전에 센터를 활성화하세요.',
  zh: '添加时段|滚动查看更多栏目|导入会员前，请分配负责人以激活此草稿。|导入会员前，请先激活中心。',
  'zh-TW': '新增時段|捲動查看更多欄目|匯入會員前，請指派負責人以啟用此草稿。|匯入會員前，請先啟用中心。',
}
export function centersUsabilityStrings(language) {
  const values = words[language]?.split('|')
  if (values?.length !== keys.length) throw new Error('incomplete centers usability translations: '+language)
  return Object.fromEntries(keys.map((key,index)=>[key,values[index]]))
}

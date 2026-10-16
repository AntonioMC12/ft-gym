const keys=['Edit center','Edit opening hours','Closed']
const words={
 es:'Editar centro|Editar horario|Cerrado',
 fr:'Modifier le centre|Modifier les horaires|Fermé',
 de:'Zentrum bearbeiten|Öffnungszeiten bearbeiten|Geschlossen',
 it:'Modifica centro|Modifica orari|Chiuso',
 pt:'Editar centro|Editar horário|Fechado',
 'pt-BR':'Editar centro|Editar horário|Fechado',
 pl:'Edytuj centrum|Edytuj godziny otwarcia|Zamknięte',
 hu:'Központ szerkesztése|Nyitvatartás szerkesztése|Zárva',
 tr:'Merkezi düzenle|Çalışma saatlerini düzenle|Kapalı',
 ru:'Изменить центр|Изменить часы работы|Закрыто',
 uk:'Редагувати центр|Редагувати години роботи|Зачинено',
 ar:'تعديل المركز|تعديل ساعات العمل|مغلق',
 hi:'केंद्र संपादित करें|खुलने का समय संपादित करें|बंद',
 bn:'কেন্দ্র সম্পাদনা করুন|খোলার সময় সম্পাদনা করুন|বন্ধ',
 th:'แก้ไขศูนย์|แก้ไขเวลาเปิดทำการ|ปิด',
 ko:'센터 수정|운영 시간 수정|휴무',
 zh:'编辑中心|编辑营业时间|休息',
 'zh-TW':'編輯中心|編輯營業時間|休息'
}
export function centerProfileStrings(lang){const values=words[lang]?.split('|');if(!values||values.length!==keys.length)throw new Error('incomplete center profile translations: '+lang);return Object.fromEntries(keys.map((key,i)=>[key,values[i]]))}

const keys=['My centers','My membership','No linked memberships available.','Your center has no assigned fee.','Showing up to 100 contracts.']
const words={
 es:['Mis centros','Mi afiliación','No hay afiliaciones vinculadas disponibles.','Tu centro no ha asignado ninguna cuota.','Se muestran hasta 100 contratos.'],
 de:['Meine Zentren','Meine Mitgliedschaft','Keine verknüpften Mitgliedschaften verfügbar.','Dein Zentrum hat keinen Tarif zugewiesen.','Bis zu 100 Verträge werden angezeigt.'],
 fr:['Mes centres','Mon adhésion','Aucune adhésion liée disponible.','Votre centre n’a attribué aucun tarif.','Jusqu’à 100 contrats sont affichés.'],
 it:['I miei centri','La mia iscrizione','Nessuna iscrizione collegata disponibile.','Il centro non ha assegnato alcuna quota.','Sono mostrati fino a 100 contratti.'],
 pt:['Os meus centros','A minha inscrição','Sem inscrições associadas disponíveis.','O seu centro não atribuiu nenhuma quota.','São apresentados até 100 contratos.'],
 pl:['Moje centra','Moje członkostwo','Brak powiązanych członkostw.','Twoje centrum nie przypisało opłaty.','Wyświetlono maksymalnie 100 umów.'],
 tr:['Merkezlerim','Üyeliğim','Bağlı üyelik bulunmuyor.','Merkeziniz ücret planı atamadı.','En fazla 100 sözleşme gösteriliyor.'],
 ru:['Мои центры','Моё членство','Нет связанных членств.','Ваш центр не назначил тариф.','Показано до 100 договоров.'],
 uk:['Мої центри','Моє членство','Немає пов’язаних членств.','Ваш центр не призначив тариф.','Показано до 100 договорів.'],
 zh:['我的中心','我的会员资格','暂无关联会员资格。','中心尚未分配会费方案。','最多显示100份合同。'],
 'zh-TW':['我的中心','我的會員資格','暫無關聯會員資格。','中心尚未分配會費方案。','最多顯示100份合約。'],
 ko:['내 센터','내 회원 정보','연결된 회원 정보가 없습니다.','센터에서 요금제를 배정하지 않았습니다.','계약을 최대 100건 표시합니다.'],
 hi:['मेरे केंद्र','मेरी सदस्यता','कोई जुड़ी सदस्यता उपलब्ध नहीं।','आपके केंद्र ने शुल्क नहीं तय किया है।','अधिकतम 100 अनुबंध दिखाए जाते हैं।'],
 bn:['আমার কেন্দ্র','আমার সদস্যপদ','কোনো সংযুক্ত সদস্যপদ নেই।','আপনার কেন্দ্র কোনো ফি নির্ধারণ করেনি।','সর্বোচ্চ ১০০টি চুক্তি দেখানো হয়।'],
 th:['ศูนย์ของฉัน','สมาชิกของฉัน','ไม่มีสมาชิกที่เชื่อมโยง','ศูนย์ยังไม่ได้กำหนดค่าบริการให้คุณ','แสดงสัญญาสูงสุด 100 รายการ'],
 hu:['Központjaim','Tagságom','Nincs összekapcsolt tagság.','A központod nem rendelt hozzád díjat.','Legfeljebb 100 szerződés látható.'],
 ar:['مراكزي','عضويتي','لا توجد عضويات مرتبطة.','لم يحدد مركزك رسومًا.','يتم عرض ما يصل إلى 100 عقد.'],
}
export function memberPortalStrings(lang){const values=words[lang];if(!values||values.length!==keys.length)throw new Error('incomplete member portal translations: '+lang);return Object.fromEntries(keys.map((key,i)=>[key,values[i]]))}

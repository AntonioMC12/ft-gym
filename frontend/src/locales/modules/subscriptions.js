const keys=['Subscriptions','Assign membership plan','Change membership plan','Discount (%)','Discount reason']
const words={
 es:['Suscripciones','Asignar cuota','Cambiar cuota','Descuento (%)','Motivo del descuento'],
 de:['Abonnements','Mitgliedstarif zuweisen','Mitgliedstarif ändern','Rabatt (%)','Rabattgrund'],
 fr:['Abonnements','Attribuer une cotisation','Changer de cotisation','Réduction (%)','Motif de réduction'],
 it:['Abbonamenti','Assegna quota','Cambia quota','Sconto (%)','Motivo dello sconto'],
 pt:['Subscrições','Atribuir quota','Alterar quota','Desconto (%)','Motivo do desconto'],
 pl:['Subskrypcje','Przypisz plan opłat','Zmień plan opłat','Rabat (%)','Powód rabatu'],
 tr:['Abonelikler','Üyelik ücreti ata','Üyelik ücretini değiştir','İndirim (%)','İndirim nedeni'],
 ru:['Подписки','Назначить тариф','Изменить тариф','Скидка (%)','Причина скидки'],
 uk:['Підписки','Призначити тариф','Змінити тариф','Знижка (%)','Причина знижки'],
 zh:['订阅','分配会费方案','更改会费方案','折扣 (%)','折扣原因'],
 'zh-TW':['訂閱','指定會費方案','變更會費方案','折扣 (%)','折扣原因'],
 ko:['구독','회원 요금제 지정','회원 요금제 변경','할인 (%)','할인 사유'],
 hi:['सदस्यताएँ','शुल्क योजना निर्धारित करें','शुल्क योजना बदलें','छूट (%)','छूट का कारण'],
 bn:['সাবস্ক্রিপশন','ফি পরিকল্পনা নির্ধারণ করুন','ফি পরিকল্পনা পরিবর্তন করুন','ছাড় (%)','ছাড়ের কারণ'],
 th:['การสมัครสมาชิก','กำหนดแผนค่าสมาชิก','เปลี่ยนแผนค่าสมาชิก','ส่วนลด (%)','เหตุผลส่วนลด'],
 hu:['Előfizetések','Tagdíjcsomag hozzárendelése','Tagdíjcsomag módosítása','Kedvezmény (%)','Kedvezmény oka'],
 ar:['الاشتراكات','تعيين خطة رسوم','تغيير خطة الرسوم','الخصم (%)','سبب الخصم'],
}
export function subscriptionStrings(lang){const values=words[lang];if(!values||values.length!==keys.length)throw new Error('incomplete subscription translations: '+lang);return Object.fromEntries(keys.map((key,i)=>[key,values[i]]))}

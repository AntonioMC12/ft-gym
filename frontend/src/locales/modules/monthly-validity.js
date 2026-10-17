const key='Monthly fees cover the calendar month and remain valid through the 5th of the next month.'
const words={
 es:'Las mensualidades corresponden al mes natural y son válidas hasta el día 5 del mes siguiente, incluido.',
 fr:'Les cotisations mensuelles couvrent le mois civil et restent valables jusqu’au 5 du mois suivant inclus.',
 de:'Monatsbeiträge gelten für den Kalendermonat und bis einschließlich zum 5. des Folgemonats.',
 it:'Le quote mensili coprono il mese solare e restano valide fino al 5 del mese successivo incluso.',
 pt:'As mensalidades cobrem o mês civil e são válidas até ao dia 5 do mês seguinte, inclusive.',
 'pt-BR':'As mensalidades cobrem o mês e são válidas até o dia 5 do mês seguinte, inclusive.',
 pl:'Opłaty miesięczne obejmują miesiąc kalendarzowy i obowiązują do 5. dnia następnego miesiąca włącznie.',
 hu:'A havidíj a naptári hónapra szól, és a következő hónap 5. napjáig bezárólag érvényes.',
 tr:'Aylık ücretler takvim ayını kapsar ve sonraki ayın 5. günü dahil geçerlidir.',
 ru:'Месячный взнос действует за календарный месяц и до 5-го числа следующего месяца включительно.',
 uk:'Місячний внесок охоплює календарний місяць і діє до 5-го числа наступного місяця включно.',
 ar:'تغطي الرسوم الشهرية الشهر التقويمي وتظل سارية حتى يوم 5 من الشهر التالي شاملاً.',
 hi:'मासिक शुल्क कैलेंडर महीने को कवर करता है और अगले महीने की 5 तारीख तक मान्य रहता है।',
 bn:'মাসিক ফি ক্যালেন্ডার মাসের জন্য এবং পরের মাসের ৫ তারিখ পর্যন্ত বৈধ থাকে।',
 th:'ค่ารายเดือนครอบคลุมเดือนปฏิทินและใช้ได้ถึงวันที่ 5 ของเดือนถัดไปรวมวันดังกล่าว',
 ko:'월 이용료는 해당 달에 적용되며 다음 달 5일까지 유효합니다.',
 zh:'月费对应自然月，有效期至次月5日（含当天）。',
 'zh-TW':'月費對應曆月，有效期至次月5日（含當天）。'
}
export function monthlyValidityStrings(lang){if(!words[lang])throw new Error('missing monthly validity locale: '+lang);return {[key]:words[lang]}}

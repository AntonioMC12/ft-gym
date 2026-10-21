const keys=['Preview charge','Billing period start','Billable days','Active days','Net amount','Tax amount','Total amount','Preview only. No receipt or payment is created.','Check the billing period.']
const words={
 es:['Previsualizar importe','Inicio del periodo de cobro','Días cobrables','Días activos','Importe neto','Impuestos','Importe total','Solo previsualización. No se crea ningún recibo ni pago.','Revisa el periodo de cobro.'],
 de:['Gebühr voranzeigen','Beginn des Abrechnungszeitraums','Abrechenbare Tage','Aktive Tage','Nettobetrag','Steuerbetrag','Gesamtbetrag','Nur Vorschau. Es wird kein Beleg oder Zahlung erstellt.','Abrechnungszeitraum prüfen.'],
 fr:['Prévisualiser le montant','Début de la période de facturation','Jours facturables','Jours actifs','Montant net','Taxes','Montant total','Aperçu uniquement. Aucun reçu ni paiement créé.','Vérifiez la période de facturation.'],
 it:['Anteprima importo','Inizio periodo di fatturazione','Giorni fatturabili','Giorni attivi','Importo netto','Imposte','Importo totale','Solo anteprima. Nessuna ricevuta o pagamento creato.','Controlla il periodo di fatturazione.'],
 pt:['Pré-visualizar valor','Início do período de cobrança','Dias cobráveis','Dias ativos','Valor líquido','Impostos','Valor total','Apenas pré-visualização. Não é criado recibo nem pagamento.','Verifica o período de cobrança.'],
 pl:['Podgląd kwoty','Początek okresu rozliczeniowego','Dni rozliczane','Dni aktywne','Kwota netto','Podatek','Kwota łączna','Tylko podgląd. Nie powstaje rachunek ani płatność.','Sprawdź okres rozliczeniowy.'],
 tr:['Tutarı önizle','Faturalama dönemi başlangıcı','Ücretlendirilen günler','Aktif günler','Net tutar','Vergi tutarı','Toplam tutar','Yalnızca önizleme. Makbuz veya ödeme oluşturulmaz.','Faturalama dönemini kontrol edin.'],
 ru:['Предпросмотр суммы','Начало расчётного периода','Оплачиваемые дни','Активные дни','Сумма без налога','Налоги','Общая сумма','Только предпросмотр. Квитанция или платёж не создаются.','Проверьте расчётный период.'],
 uk:['Перегляд суми','Початок розрахункового періоду','Оплачувані дні','Активні дні','Сума без податку','Податки','Загальна сума','Лише перегляд. Квитанція чи платіж не створюються.','Перевірте розрахунковий період.'],
 zh:['预览费用','计费周期开始','计费天数','有效天数','净额','税额','总金额','仅供预览，不会创建收据或付款。','请检查计费周期。'],
 'zh-TW':['預覽費用','計費週期開始','計費天數','有效天數','淨額','稅額','總金額','僅供預覽，不會建立收據或付款。','請檢查計費週期。'],
 ko:['요금 미리보기','청구 기간 시작','청구 일수','활성 일수','세전 금액','세금','총 금액','미리보기입니다. 영수증이나 결제가 생성되지 않습니다.','청구 기간을 확인하세요.'],
 hi:['शुल्क का पूर्वावलोकन','बिल अवधि की शुरुआत','शुल्क योग्य दिन','सक्रिय दिन','शुद्ध राशि','कर राशि','कुल राशि','केवल पूर्वावलोकन। कोई रसीद या भुगतान नहीं बनाया जाता।','बिल अवधि जाँचें।'],
 bn:['ফি পূর্বরূপ','বিলের সময়কালের শুরু','চার্জযোগ্য দিন','সক্রিয় দিন','নিট পরিমাণ','করের পরিমাণ','মোট পরিমাণ','শুধু পূর্বরূপ। কোনো রসিদ বা পেমেন্ট তৈরি হয় না।','বিলের সময়কাল যাচাই করুন।'],
 th:['ดูตัวอย่างค่าบริการ','วันเริ่มรอบเรียกเก็บ','วันที่คิดค่าบริการ','วันที่ใช้งาน','ยอดสุทธิ','ภาษี','ยอดรวม','เป็นเพียงตัวอย่าง ไม่มีการสร้างใบรับเงินหรือการชำระเงิน','ตรวจสอบรอบเรียกเก็บ'],
 hu:['Díj előnézete','Számlázási időszak kezdete','Számlázható napok','Aktív napok','Nettó összeg','Adóösszeg','Teljes összeg','Csak előnézet. Nem készül nyugta vagy fizetés.','Ellenőrizd a számlázási időszakot.'],
 ar:['معاينة الرسوم','بداية فترة الفوترة','الأيام المحتسبة','الأيام النشطة','المبلغ الصافي','الضريبة','المبلغ الإجمالي','معاينة فقط. لا يتم إنشاء إيصال أو دفعة.','راجع فترة الفوترة.'],
}
export function billingStrings(lang){const values=words[lang];if(!values||values.length!==keys.length)throw new Error('incomplete billing translations: '+lang);return Object.fromEntries(keys.map((key,i)=>[key,values[i]]))}

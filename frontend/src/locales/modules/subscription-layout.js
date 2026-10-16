const keys=["Subscription history","Current subscription","Ended subscription"]
const words={
  "es": [
    "Historial de cuotas",
    "Cuota vigente",
    "Cuota finalizada"
  ],
  "fr": [
    "Historique des abonnements",
    "Abonnement en cours",
    "Abonnement terminé"
  ],
  "de": [
    "Abonnementverlauf",
    "Aktuelles Abonnement",
    "Beendetes Abonnement"
  ],
  "it": [
    "Storico abbonamenti",
    "Abbonamento attuale",
    "Abbonamento terminato"
  ],
  "pt": [
    "Histórico de subscrições",
    "Subscrição atual",
    "Subscrição terminada"
  ],
  "pt-BR": [
    "Histórico de assinaturas",
    "Assinatura atual",
    "Assinatura encerrada"
  ],
  "pl": [
    "Historia subskrypcji",
    "Bieżąca subskrypcja",
    "Zakończona subskrypcja"
  ],
  "hu": [
    "Előfizetési előzmények",
    "Jelenlegi előfizetés",
    "Lezárt előfizetés"
  ],
  "tr": [
    "Abonelik geçmişi",
    "Geçerli abonelik",
    "Sona eren abonelik"
  ],
  "ru": [
    "История подписок",
    "Текущая подписка",
    "Завершённая подписка"
  ],
  "uk": [
    "Історія підписок",
    "Поточна підписка",
    "Завершена підписка"
  ],
  "ar": [
    "سجل الاشتراكات",
    "الاشتراك الحالي",
    "اشتراك منتهٍ"
  ],
  "hi": [
    "सदस्यता इतिहास",
    "वर्तमान सदस्यता",
    "समाप्त सदस्यता"
  ],
  "bn": [
    "সাবস্ক্রিপশনের ইতিহাস",
    "বর্তমান সাবস্ক্রিপশন",
    "সমাপ্ত সাবস্ক্রিপশন"
  ],
  "th": [
    "ประวัติการสมัคร",
    "การสมัครปัจจุบัน",
    "การสมัครสิ้นสุดแล้ว"
  ],
  "ko": [
    "구독 내역",
    "현재 구독",
    "종료된 구독"
  ],
  "zh": [
    "订阅历史",
    "当前订阅",
    "已结束订阅"
  ],
  "zh-TW": [
    "訂閱紀錄",
    "目前訂閱",
    "已結束訂閱"
  ]
}
export function subscriptionLayoutStrings(lang){const values=words[lang];if(values?.length!==keys.length)throw new Error('incomplete subscription layout: '+lang);return Object.fromEntries(keys.map((key,i)=>[key,values[i]]))}

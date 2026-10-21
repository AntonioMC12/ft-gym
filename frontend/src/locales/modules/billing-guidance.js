const key="Configure the fee, then assign its new version to this member. Existing subscriptions keep their original terms."
const words={
  "es": "Configura la cuota y después asigna su nueva versión a este socio. Las suscripciones existentes conservan sus condiciones originales.",
  "fr": "Configurez la cotisation, puis attribuez sa nouvelle version à ce membre. Les abonnements existants conservent leurs conditions initiales.",
  "de": "Konfiguriere den Beitrag und weise diesem Mitglied dann die neue Version zu. Bestehende Abonnements behalten ihre ursprünglichen Bedingungen.",
  "it": "Configura la quota, poi assegna la nuova versione a questo socio. Gli abbonamenti esistenti mantengono le condizioni originali.",
  "pt": "Configure a quota e depois atribua a nova versão a este sócio. As subscrições existentes mantêm as condições originais.",
  "pt-BR": "Configure a mensalidade e depois atribua a nova versão a este membro. As assinaturas existentes mantêm as condições originais.",
  "pl": "Skonfiguruj składkę, a następnie przypisz jej nową wersję temu członkowi. Istniejące subskrypcje zachowują pierwotne warunki.",
  "hu": "Állítsd be a díjat, majd rendeld az új verziót ehhez a taghoz. A meglévő előfizetések megtartják eredeti feltételeiket.",
  "tr": "Aidatı yapılandırın, ardından yeni sürümünü bu üyeye atayın. Mevcut abonelikler ilk koşullarını korur.",
  "ru": "Настройте тариф и назначьте его новую версию этому участнику. Существующие подписки сохраняют первоначальные условия.",
  "uk": "Налаштуйте тариф і призначте його нову версію цьому учаснику. Наявні підписки зберігають початкові умови.",
  "ar": "اضبط الرسوم ثم عيّن إصدارها الجديد لهذا العضو. تحتفظ الاشتراكات الحالية بشروطها الأصلية.",
  "hi": "शुल्क सेट करें, फिर इसका नया संस्करण इस सदस्य को सौंपें। मौजूदा सदस्यताओं की मूल शर्तें बनी रहती हैं।",
  "bn": "ফি নির্ধারণ করুন, তারপর এর নতুন সংস্করণ এই সদস্যকে বরাদ্দ করুন। বিদ্যমান সাবস্ক্রিপশনের মূল শর্ত অপরিবর্তিত থাকে।",
  "th": "กำหนดค่าธรรมเนียม แล้วกำหนดเวอร์ชันใหม่ให้สมาชิกนี้ การสมัครเดิมยังคงเงื่อนไขเดิม",
  "ko": "회비를 설정한 후 새 버전을 이 회원에게 배정하세요. 기존 구독의 원래 조건은 유지됩니다.",
  "zh": "请配置会费，然后为此会员分配新版本。现有订阅保留原有条款。",
  "zh-TW": "請設定會費，然後為此會員指派新版本。現有訂閱保留原有條款。"
}
export function billingGuidanceStrings(lang){if(!words[lang])throw new Error('incomplete billing guidance: '+lang);return {[key]:words[lang]}}

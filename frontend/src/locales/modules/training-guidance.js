const keys=["Link this member to an account before proposing routines.","Training proposals require an active member."]
const words={
  "es": [
    "Vincula este socio a una cuenta antes de proponerle rutinas.",
    "El socio debe estar activo para recibir propuestas de entrenamiento."
  ],
  "fr": [
    "Associez ce membre à un compte avant de lui proposer des routines.",
    "Le membre doit être actif pour recevoir des propositions d’entraînement."
  ],
  "de": [
    "Verknüpfe dieses Mitglied mit einem Konto, bevor du Routinen vorschlägst.",
    "Für Trainingsvorschläge muss das Mitglied aktiv sein."
  ],
  "it": [
    "Collega questo socio a un account prima di proporre routine.",
    "Il socio deve essere attivo per ricevere proposte di allenamento."
  ],
  "pt": [
    "Associe este sócio a uma conta antes de propor rotinas.",
    "O sócio deve estar ativo para receber propostas de treino."
  ],
  "pt-BR": [
    "Vincule este membro a uma conta antes de propor rotinas.",
    "O membro deve estar ativo para receber propostas de treino."
  ],
  "pl": [
    "Powiąż tego członka z kontem przed zaproponowaniem treningów.",
    "Członek musi być aktywny, aby otrzymywać propozycje treningowe."
  ],
  "hu": [
    "Kapcsold ezt a tagot egy fiókhoz, mielőtt edzéstervet ajánlasz neki.",
    "Edzésjavaslatokhoz aktív tagság szükséges."
  ],
  "tr": [
    "Rutin önermeden önce bu üyeyi bir hesaba bağlayın.",
    "Antrenman önerileri için üyenin aktif olması gerekir."
  ],
  "ru": [
    "Свяжите участника с аккаунтом, прежде чем предлагать программы.",
    "Для предложений тренировок участник должен быть активен."
  ],
  "uk": [
    "Пов’яжіть учасника з обліковим записом, перш ніж пропонувати програми.",
    "Для пропозицій тренувань учасник має бути активним."
  ],
  "ar": [
    "اربط هذا العضو بحساب قبل اقتراح التمارين.",
    "يجب أن تكون عضوية الشخص نشطة لتلقي مقترحات التدريب."
  ],
  "hi": [
    "रूटीन प्रस्तावित करने से पहले इस सदस्य को किसी खाते से जोड़ें।",
    "प्रशिक्षण प्रस्ताव पाने के लिए सदस्य सक्रिय होना चाहिए।"
  ],
  "bn": [
    "রুটিন প্রস্তাব করার আগে এই সদস্যকে একটি অ্যাকাউন্টের সঙ্গে যুক্ত করুন।",
    "প্রশিক্ষণের প্রস্তাব পেতে সদস্যকে সক্রিয় থাকতে হবে।"
  ],
  "th": [
    "เชื่อมโยงสมาชิกนี้กับบัญชีก่อนเสนอโปรแกรมฝึก",
    "สมาชิกต้องมีสถานะใช้งานเพื่อรับข้อเสนอการฝึก"
  ],
  "ko": [
    "루틴을 제안하기 전에 이 회원을 계정에 연결하세요.",
    "훈련 제안을 받으려면 회원이 활성 상태여야 합니다."
  ],
  "zh": [
    "请先为此会员关联账号，再推荐训练计划。",
    "会员必须处于有效状态才能接收训练建议。"
  ],
  "zh-TW": [
    "請先為此會員連結帳號，再推薦訓練計畫。",
    "會員必須處於有效狀態才能接收訓練建議。"
  ]
}
export function trainingGuidanceStrings(lang){const values=words[lang];if(values?.length!==keys.length)throw new Error('incomplete training guidance: '+lang);return Object.fromEntries(keys.map((key,i)=>[key,values[i]]))}

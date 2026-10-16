const keys=["Link account","Search by name or email","The account holder must accept the invitation to complete the link."]
const words={
  "es": [
    "Vincular cuenta",
    "Buscar por nombre o correo",
    "El titular debe aceptar la invitación para completar la vinculación."
  ],
  "fr": [
    "Associer un compte",
    "Rechercher par nom ou e-mail",
    "Le titulaire doit accepter l’invitation pour terminer l’association."
  ],
  "de": [
    "Konto verknüpfen",
    "Nach Name oder E-Mail suchen",
    "Der Kontoinhaber muss die Einladung annehmen, um die Verknüpfung abzuschließen."
  ],
  "it": [
    "Collega account",
    "Cerca per nome o email",
    "Il titolare deve accettare l’invito per completare il collegamento."
  ],
  "pt": [
    "Associar conta",
    "Pesquisar por nome ou email",
    "O titular deve aceitar o convite para concluir a associação."
  ],
  "pt-BR": [
    "Vincular conta",
    "Buscar por nome ou email",
    "O titular deve aceitar o convite para concluir a vinculação."
  ],
  "pl": [
    "Połącz konto",
    "Szukaj według nazwy lub e-maila",
    "Właściciel konta musi zaakceptować zaproszenie, aby zakończyć łączenie."
  ],
  "hu": [
    "Fiók kapcsolása",
    "Keresés név vagy e-mail alapján",
    "A fiók tulajdonosának el kell fogadnia a meghívást az összekapcsoláshoz."
  ],
  "tr": [
    "Hesap bağla",
    "Ad veya e-posta ile ara",
    "Bağlantıyı tamamlamak için hesap sahibi daveti kabul etmelidir."
  ],
  "ru": [
    "Связать аккаунт",
    "Поиск по имени или почте",
    "Владелец аккаунта должен принять приглашение для завершения привязки."
  ],
  "uk": [
    "Пов’язати обліковий запис",
    "Пошук за ім’ям або поштою",
    "Власник має прийняти запрошення для завершення прив’язки."
  ],
  "ar": [
    "ربط حساب",
    "البحث بالاسم أو البريد",
    "يجب أن يقبل صاحب الحساب الدعوة لإكمال الربط."
  ],
  "hi": [
    "खाता जोड़ें",
    "नाम या ईमेल से खोजें",
    "लिंक पूरा करने के लिए खाताधारक को निमंत्रण स्वीकार करना होगा।"
  ],
  "bn": [
    "অ্যাকাউন্ট যুক্ত করুন",
    "নাম বা ইমেইল দিয়ে খুঁজুন",
    "সংযোগ সম্পূর্ণ করতে অ্যাকাউন্টের মালিককে আমন্ত্রণ গ্রহণ করতে হবে।"
  ],
  "th": [
    "เชื่อมโยงบัญชี",
    "ค้นหาด้วยชื่อหรืออีเมล",
    "เจ้าของบัญชีต้องยอมรับคำเชิญเพื่อเชื่อมโยงให้เสร็จ"
  ],
  "ko": [
    "계정 연결",
    "이름 또는 이메일로 검색",
    "연결을 완료하려면 계정 소유자가 초대를 수락해야 합니다."
  ],
  "zh": [
    "关联账号",
    "按姓名或邮箱搜索",
    "账号持有人必须接受邀请才能完成关联。"
  ],
  "zh-TW": [
    "連結帳號",
    "依姓名或電子郵件搜尋",
    "帳號持有人必須接受邀請才能完成連結。"
  ]
}
export function accountLinkingStrings(lang){const values=words[lang];if(values?.length!==keys.length)throw new Error('incomplete account linking: '+lang);return Object.fromEntries(keys.map((key,i)=>[key,values[i]]))}

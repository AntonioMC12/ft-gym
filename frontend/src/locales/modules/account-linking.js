const baseKeys=["Link account","Search by name or email","The account holder must accept the invitation to complete the link."]
const baseWords={
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
const keys=[...baseKeys,"Change account","Confirm invitation","Choose a center member, with or without a linked account."]
const additions={"es": ["Cambiar cuenta", "Confirmar invitación", "Elige un socio del centro, con cuenta vinculada o sin ella."], "fr": ["Changer de compte", "Confirmer l’invitation", "Choisissez un membre du centre, avec ou sans compte associé."], "de": ["Konto ändern", "Einladung bestätigen", "Wählen Sie ein Mitglied des Zentrums, mit oder ohne verknüpftes Konto."], "it": ["Cambia account", "Conferma invito", "Scegli un socio del centro, con o senza account collegato."], "pt": ["Alterar conta", "Confirmar convite", "Escolha um membro do centro, com ou sem conta associada."], "pt-BR": ["Alterar conta", "Confirmar convite", "Escolha um membro do centro, com ou sem conta vinculada."], "pl": ["Zmień konto", "Potwierdź zaproszenie", "Wybierz członka centrum, z połączonym kontem lub bez niego."], "hu": ["Fiók módosítása", "Meghívás megerősítése", "Válasszon tagot a központból, kapcsolt fiókkal vagy anélkül."], "tr": ["Hesabı değiştir", "Daveti onayla", "Merkezden bağlı hesabı olan veya olmayan bir üye seçin."], "ru": ["Изменить аккаунт", "Подтвердить приглашение", "Выберите участника центра с привязанным аккаунтом или без него."], "uk": ["Змінити обліковий запис", "Підтвердити запрошення", "Виберіть учасника центру з прив’язаним обліковим записом або без нього."], "ar": ["تغيير الحساب", "تأكيد الدعوة", "اختر عضوًا في المركز، سواء كان حسابه مرتبطًا أم لا."], "hi": ["खाता बदलें", "निमंत्रण की पुष्टि करें", "केंद्र का सदस्य चुनें, चाहे खाता जुड़ा हो या नहीं।"], "bn": ["অ্যাকাউন্ট পরিবর্তন করুন", "আমন্ত্রণ নিশ্চিত করুন", "কেন্দ্রের সদস্য বাছুন, অ্যাকাউন্ট যুক্ত থাকুক বা না থাকুক।"], "th": ["เปลี่ยนบัญชี", "ยืนยันคำเชิญ", "เลือกสมาชิกของศูนย์ ทั้งที่เชื่อมโยงบัญชีแล้วหรือยังไม่ได้เชื่อมโยง"], "ko": ["계정 변경", "초대 확인", "계정 연결 여부와 관계없이 센터 회원을 선택하세요."], "zh": ["更换账号", "确认邀请", "选择中心会员，无论是否已关联账号。"], "zh-TW": ["更換帳號", "確認邀請", "選擇中心會員，無論是否已連結帳號。"]}
const words=Object.fromEntries(Object.entries(baseWords).map(([lang,values])=>[lang,[...values,...additions[lang]]]))
export function accountLinkingStrings(lang){const values=words[lang];if(values?.length!==keys.length)throw new Error('incomplete account linking: '+lang);return {...Object.fromEntries(keys.map((key,i)=>[key,values[i]])), 'Mail unavailable':lang==='es'?'mail no disponible':'Mail unavailable', 'Name unavailable':lang==='es'?'Nombre no disponible':'Name unavailable', 'DNI unavailable':lang==='es'?'DNI no disponible':'DNI unavailable'}}

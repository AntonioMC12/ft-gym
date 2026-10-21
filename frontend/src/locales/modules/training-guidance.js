const baseKeys=["Link this member to an account before proposing routines.","Training proposals require an active member."]
const baseWords={
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
const keys=[...baseKeys,"View all members","Select one or more members. Search keeps your selection.","Pending acceptance","Status changed","Start training","Send plan","Sent proposals","Choose a member to view their sent proposals."]
const additions={"es": ["Ver todos los socios", "Selecciona uno o varios socios. La búsqueda conserva tu selección.", "Pendiente de aceptación", "Estado actualizado", "Empezar a entrenar", "Enviar plan", "Propuestas enviadas", "Selecciona un socio para consultar sus propuestas enviadas."], "fr": ["Voir tous les membres", "Sélectionnez un ou plusieurs membres. La recherche conserve votre sélection.", "En attente d’acceptation", "Statut mis à jour", "Commencer à s’entraîner", "Envoyer un programme", "Propositions envoyées", "Sélectionnez un membre pour consulter ses propositions envoyées."], "de": ["Alle Mitglieder anzeigen", "Wählen Sie ein oder mehrere Mitglieder. Die Suche behält Ihre Auswahl bei.", "Annahme ausstehend", "Status aktualisiert", "Training beginnen", "Plan senden", "Gesendete Vorschläge", "Wählen Sie ein Mitglied, um die gesendeten Vorschläge anzuzeigen."], "it": ["Vedi tutti i soci", "Seleziona uno o più soci. La ricerca mantiene la selezione.", "In attesa di accettazione", "Stato aggiornato", "Inizia ad allenarti", "Invia piano", "Proposte inviate", "Seleziona un socio per vedere le proposte inviate."], "pt": ["Ver todos os membros", "Selecione um ou mais membros. A pesquisa mantém a seleção.", "A aguardar aceitação", "Estado atualizado", "Começar a treinar", "Enviar plano", "Propostas enviadas", "Selecione um sócio para consultar as propostas enviadas."], "pt-BR": ["Ver todos os membros", "Selecione um ou mais membros. A busca mantém sua seleção.", "Aguardando aceitação", "Estado atualizado", "Começar a treinar", "Enviar plano", "Propostas enviadas", "Selecione um sócio para consultar as propostas enviadas."], "pl": ["Zobacz wszystkich członków", "Wybierz jednego lub więcej członków. Wyszukiwanie zachowuje wybór.", "Oczekuje na akceptację", "Status zaktualizowany", "Rozpocznij trening", "Wyślij plan", "Wysłane propozycje", "Wybierz członka, aby zobaczyć wysłane propozycje."], "hu": ["Összes tag megtekintése", "Válasszon egy vagy több tagot. A keresés megőrzi a kijelölést.", "Elfogadásra vár", "Állapot frissítve", "Edzés indítása", "Terv küldése", "Elküldött javaslatok", "Válasszon tagot az elküldött javaslatok megtekintéséhez."], "tr": ["Tüm üyeleri gör", "Bir veya daha fazla üye seçin. Arama seçiminizi korur.", "Kabul bekleniyor", "Durum güncellendi", "Antrenmana başla", "Plan gönder", "Gönderilen öneriler", "Gönderilen önerileri görmek için bir üye seçin."], "ru": ["Показать всех участников", "Выберите одного или нескольких участников. Поиск сохраняет выбор.", "Ожидает принятия", "Статус обновлён", "Начать тренировку", "Отправить план", "Отправленные предложения", "Выберите участника для просмотра отправленных предложений."], "uk": ["Переглянути всіх учасників", "Виберіть одного або кількох учасників. Пошук зберігає вибір.", "Очікує прийняття", "Статус оновлено", "Почати тренування", "Надіслати план", "Надіслані пропозиції", "Виберіть учасника для перегляду надісланих пропозицій."], "ar": ["عرض جميع الأعضاء", "اختر عضوًا أو أكثر. يحتفظ البحث باختياراتك.", "بانتظار القبول", "تم تحديث الحالة", "ابدأ التدريب", "إرسال الخطة", "المقترحات المرسلة", "اختر عضوًا لعرض المقترحات المرسلة إليه."], "hi": ["सभी सदस्य देखें", "एक या अधिक सदस्य चुनें। खोज आपका चयन बनाए रखती है।", "स्वीकृति लंबित", "स्थिति अपडेट हुई", "प्रशिक्षण शुरू करें", "योजना भेजें", "भेजे गए प्रस्ताव", "भेजे गए प्रस्ताव देखने के लिए सदस्य चुनें।"], "bn": ["সব সদস্য দেখুন", "এক বা একাধিক সদস্য বাছুন। অনুসন্ধান আপনার নির্বাচন বজায় রাখে।", "গ্রহণের অপেক্ষায়", "অবস্থা আপডেট হয়েছে", "প্রশিক্ষণ শুরু করুন", "পরিকল্পনা পাঠান", "পাঠানো প্রস্তাব", "পাঠানো প্রস্তাব দেখতে একজন সদস্য বাছুন।"], "th": ["ดูสมาชิกทั้งหมด", "เลือกสมาชิกหนึ่งคนขึ้นไป การค้นหาจะเก็บการเลือกไว้", "รอการยอมรับ", "อัปเดตสถานะแล้ว", "เริ่มฝึก", "ส่งแผน", "ข้อเสนอที่ส่งแล้ว", "เลือกสมาชิกเพื่อดูข้อเสนอที่ส่งแล้ว"], "ko": ["모든 회원 보기", "한 명 이상의 회원을 선택하세요. 검색해도 선택이 유지됩니다.", "수락 대기 중", "상태 업데이트됨", "운동 시작", "계획 보내기", "보낸 제안", "보낸 제안을 보려면 회원을 선택하세요."], "zh": ["查看所有会员", "选择一位或多位会员。搜索会保留你的选择。", "待接受", "状态已更新", "开始训练", "发送计划", "已发送的建议", "选择会员以查看已发送的建议。"], "zh-TW": ["查看所有會員", "選擇一位或多位會員。搜尋會保留你的選擇。", "待接受", "狀態已更新", "開始訓練", "傳送計畫", "已傳送的建議", "選擇會員以查看已傳送的建議。"]}
const words=Object.fromEntries(Object.entries(baseWords).map(([lang,values])=>[lang,[...values,...additions[lang]]]))
export function trainingGuidanceStrings(lang){const values=words[lang];if(values?.length!==keys.length)throw new Error('incomplete training guidance: '+lang);return Object.fromEntries(keys.map((key,i)=>[key,values[i]]))}

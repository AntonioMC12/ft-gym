const keys=['Classes','New class','Class name','Capacity','Waiting list capacity','Cancellation notice (minutes)','Eligible plans','Reserve place','Join waiting list','Cancel reservation','Cancel class','Class roster','Booked','Waiting list','Attended','No-show','Ineligible','No classes available.','No reservations available.','Choose the first or second occurrence of this repeated hour.','First occurrence','Second occurrence','Check the class schedule, plans and limits.','This class is full.','Your membership or plan does not allow this class.','Booking or cancellation is closed.','No automatic fees or penalties.','Create class']
const words={
 es:'Clases|Nueva clase|Nombre de la clase|Aforo|Plazas en lista de espera|Preaviso de cancelación (minutos)|Cuotas admitidas|Reservar plaza|Entrar en lista de espera|Cancelar reserva|Cancelar clase|Reservas de la clase|Plaza reservada|Lista de espera|Asistencia confirmada|Ausencia|Sin derecho a esta clase|No hay clases disponibles.|No hay reservas disponibles.|Elige la primera o segunda aparición de esta hora repetida.|Primera aparición|Segunda aparición|Revisa el horario, las cuotas y los límites de la clase.|La clase está completa.|Tu afiliación o cuota no permite esta clase.|El plazo de reserva o cancelación ha cerrado.|Sin cargos ni penalizaciones automáticas.|Crear clase',
 de:'Kurse|Neuer Kurs|Kursname|Kapazität|Wartelistenplätze|Stornierungsfrist (Minuten)|Zulässige Tarife|Platz buchen|Auf die Warteliste|Buchung stornieren|Kurs absagen|Kursbuchungen|Gebucht|Warteliste|Teilnahme bestätigt|Nicht erschienen|Nicht berechtigt|Keine Kurse verfügbar.|Keine Buchungen verfügbar.|Erstes oder zweites Auftreten dieser doppelten Uhrzeit wählen.|Erstes Auftreten|Zweites Auftreten|Kurszeiten, Tarife und Grenzen prüfen.|Dieser Kurs ist voll.|Mitgliedschaft oder Tarif erlaubt diesen Kurs nicht.|Buchungs- oder Stornierungsfrist abgelaufen.|Keine automatischen Gebühren oder Strafen.|Kurs erstellen',
 fr:'Cours|Nouveau cours|Nom du cours|Capacité|Places en liste d’attente|Préavis d’annulation (minutes)|Tarifs admis|Réserver une place|Rejoindre la liste d’attente|Annuler la réservation|Annuler le cours|Réservations du cours|Place réservée|Liste d’attente|Présence confirmée|Absence|Non admissible|Aucun cours disponible.|Aucune réservation disponible.|Choisissez la première ou la seconde occurrence de cette heure répétée.|Première occurrence|Seconde occurrence|Vérifiez les horaires, tarifs et limites du cours.|Ce cours est complet.|Votre adhésion ou tarif ne permet pas ce cours.|Le délai de réservation ou d’annulation est dépassé.|Aucuns frais ni pénalités automatiques.|Créer le cours',
 it:'Corsi|Nuovo corso|Nome del corso|Capienza|Posti in lista d’attesa|Preavviso di cancellazione (minuti)|Tariffe ammesse|Prenota posto|Entra in lista d’attesa|Annulla prenotazione|Annulla corso|Prenotazioni del corso|Posto prenotato|Lista d’attesa|Presenza confermata|Assenza|Non idoneo|Nessun corso disponibile.|Nessuna prenotazione disponibile.|Scegli la prima o la seconda occorrenza di questa ora ripetuta.|Prima occorrenza|Seconda occorrenza|Controlla orari, tariffe e limiti del corso.|Il corso è completo.|La tua iscrizione o tariffa non consente questo corso.|Il termine per prenotare o annullare è scaduto.|Nessun addebito o penalità automatica.|Crea corso',
 pt:'Aulas|Nova aula|Nome da aula|Lotação|Lugares na lista de espera|Antecedência de cancelamento (minutos)|Quotas admitidas|Reservar lugar|Entrar na lista de espera|Cancelar reserva|Cancelar aula|Reservas da aula|Lugar reservado|Lista de espera|Presença confirmada|Falta|Sem elegibilidade|Não há aulas disponíveis.|Não há reservas disponíveis.|Escolha a primeira ou segunda ocorrência desta hora repetida.|Primeira ocorrência|Segunda ocorrência|Verifique horário, quotas e limites da aula.|A aula está lotada.|A sua inscrição ou quota não permite esta aula.|O prazo de reserva ou cancelamento terminou.|Sem cobranças nem penalizações automáticas.|Criar aula',
 'pt-BR':'Aulas|Nova aula|Nome da aula|Capacidade|Vagas na lista de espera|Antecedência de cancelamento (minutos)|Planos aceitos|Reservar vaga|Entrar na lista de espera|Cancelar reserva|Cancelar aula|Reservas da aula|Vaga reservada|Lista de espera|Presença confirmada|Falta|Não elegível|Não há aulas disponíveis.|Não há reservas disponíveis.|Escolha a primeira ou segunda ocorrência desta hora repetida.|Primeira ocorrência|Segunda ocorrência|Confira horário, planos e limites da aula.|A aula está lotada.|Sua matrícula ou plano não permite esta aula.|O prazo de reserva ou cancelamento terminou.|Sem cobranças nem penalidades automáticas.|Criar aula',
 pl:'Zajęcia|Nowe zajęcia|Nazwa zajęć|Liczba miejsc|Miejsca na liście oczekujących|Wyprzedzenie anulowania (minuty)|Dozwolone plany|Zarezerwuj miejsce|Dołącz do listy oczekujących|Anuluj rezerwację|Odwołaj zajęcia|Rezerwacje zajęć|Miejsce zarezerwowane|Lista oczekujących|Obecność potwierdzona|Nieobecność|Brak uprawnień|Brak dostępnych zajęć.|Brak rezerwacji.|Wybierz pierwsze lub drugie wystąpienie tej powtórzonej godziny.|Pierwsze wystąpienie|Drugie wystąpienie|Sprawdź harmonogram, plany i limity zajęć.|Brak wolnych miejsc.|Twoje członkostwo lub plan nie pozwala na te zajęcia.|Termin rezerwacji lub anulowania minął.|Bez automatycznych opłat i kar.|Utwórz zajęcia',
 hu:'Órák|Új óra|Óra neve|Férőhelyek|Várólista férőhelyei|Lemondási előidő (perc)|Elfogadott díjcsomagok|Hely foglalása|Várólistára jelentkezés|Foglalás lemondása|Óra lemondása|Óra foglalásai|Hely lefoglalva|Várólista|Részvétel igazolva|Nem jelent meg|Nem jogosult|Nincs elérhető óra.|Nincs foglalás.|Válassza az ismétlődő időpont első vagy második előfordulását.|Első előfordulás|Második előfordulás|Ellenőrizze az óra időpontját, díjcsomagjait és korlátait.|Az óra betelt.|Tagsága vagy díjcsomagja nem jogosít erre az órára.|A foglalási vagy lemondási határidő lejárt.|Nincsenek automatikus díjak vagy büntetések.|Óra létrehozása',
 tr:'Dersler|Yeni ders|Ders adı|Kapasite|Bekleme listesi kapasitesi|İptal ön bildirimi (dakika)|Uygun planlar|Yer ayırt|Bekleme listesine katıl|Rezervasyonu iptal et|Dersi iptal et|Ders rezervasyonları|Yer ayrıldı|Bekleme listesi|Katılım doğrulandı|Gelmedi|Uygun değil|Kullanılabilir ders yok.|Rezervasyon yok.|Tekrarlanan bu saatin ilk veya ikinci oluşumunu seçin.|İlk oluşum|İkinci oluşum|Ders saatini, planlarını ve sınırlarını kontrol edin.|Bu ders dolu.|Üyeliğiniz veya planınız bu derse izin vermiyor.|Rezervasyon veya iptal süresi doldu.|Otomatik ücret veya ceza yok.|Ders oluştur',
 ru:'Занятия|Новое занятие|Название занятия|Вместимость|Мест в списке ожидания|Срок отмены (минуты)|Допустимые тарифы|Забронировать место|Встать в список ожидания|Отменить бронь|Отменить занятие|Записи на занятие|Место забронировано|Список ожидания|Присутствие подтверждено|Неявка|Нет допуска|Нет доступных занятий.|Нет записей.|Выберите первое или второе наступление повторяющегося времени.|Первое наступление|Второе наступление|Проверьте расписание, тарифы и ограничения занятия.|Все места заняты.|Ваш абонемент или тариф не допускает это занятие.|Срок записи или отмены истёк.|Без автоматических сборов и штрафов.|Создать занятие',
 uk:'Заняття|Нове заняття|Назва заняття|Місткість|Місць у списку очікування|Термін скасування (хвилини)|Дозволені тарифи|Забронювати місце|Стати в список очікування|Скасувати бронювання|Скасувати заняття|Записи на заняття|Місце заброньовано|Список очікування|Присутність підтверджено|Неявка|Немає допуску|Немає доступних занять.|Немає записів.|Виберіть перше або друге настання повторюваного часу.|Перше настання|Друге настання|Перевірте розклад, тарифи й обмеження заняття.|Усі місця зайняті.|Ваш абонемент або тариф не дозволяє це заняття.|Термін запису або скасування минув.|Без автоматичних зборів і штрафів.|Створити заняття',
 ar:'الحصص|حصة جديدة|اسم الحصة|السعة|سعة قائمة الانتظار|مهلة الإلغاء (دقائق)|الباقات المسموحة|حجز مكان|الانضمام لقائمة الانتظار|إلغاء الحجز|إلغاء الحصة|حجوزات الحصة|مكان محجوز|قائمة الانتظار|حضور مؤكد|غياب|غير مؤهل|لا توجد حصص متاحة.|لا توجد حجوزات.|اختر المرة الأولى أو الثانية لهذا الوقت المتكرر.|المرة الأولى|المرة الثانية|تحقق من الموعد والباقات وحدود الحصة.|الحصة مكتملة.|عضويتك أو باقتك لا تسمح بهذه الحصة.|انتهت مهلة الحجز أو الإلغاء.|لا رسوم أو غرامات تلقائية.|إنشاء حصة',
 hi:'कक्षाएँ|नई कक्षा|कक्षा का नाम|क्षमता|प्रतीक्षा सूची क्षमता|रद्द करने की पूर्व सूचना (मिनट)|पात्र योजनाएँ|स्थान आरक्षित करें|प्रतीक्षा सूची में जुड़ें|आरक्षण रद्द करें|कक्षा रद्द करें|कक्षा आरक्षण|स्थान आरक्षित|प्रतीक्षा सूची|उपस्थिति की पुष्टि|अनुपस्थित|पात्र नहीं|कोई कक्षा उपलब्ध नहीं है।|कोई आरक्षण उपलब्ध नहीं है।|इस दोहराए गए समय का पहला या दूसरा अवसर चुनें।|पहला अवसर|दूसरा अवसर|कक्षा का समय, योजनाएँ और सीमाएँ जाँचें।|यह कक्षा भरी हुई है।|आपकी सदस्यता या योजना इस कक्षा की अनुमति नहीं देती।|आरक्षण या रद्द करने की समय सीमा समाप्त है।|कोई स्वचालित शुल्क या जुर्माना नहीं।|कक्षा बनाएँ',
 bn:'ক্লাস|নতুন ক্লাস|ক্লাসের নাম|ধারণক্ষমতা|অপেক্ষমাণ তালিকার ধারণক্ষমতা|বাতিলের আগাম নোটিশ (মিনিট)|যোগ্য পরিকল্পনা|আসন সংরক্ষণ করুন|অপেক্ষমাণ তালিকায় যোগ দিন|সংরক্ষণ বাতিল করুন|ক্লাস বাতিল করুন|ক্লাসের সংরক্ষণ|আসন সংরক্ষিত|অপেক্ষমাণ তালিকা|উপস্থিতি নিশ্চিত|অনুপস্থিত|যোগ্য নয়|কোনো ক্লাস নেই।|কোনো সংরক্ষণ নেই।|এই পুনরাবৃত্ত সময়ের প্রথম বা দ্বিতীয় বার বেছে নিন।|প্রথম বার|দ্বিতীয় বার|ক্লাসের সময়, পরিকল্পনা ও সীমা পরীক্ষা করুন।|এই ক্লাস পূর্ণ।|আপনার সদস্যতা বা পরিকল্পনায় এই ক্লাস অনুমোদিত নয়।|সংরক্ষণ বা বাতিলের সময়সীমা শেষ।|কোনো স্বয়ংক্রিয় ফি বা জরিমানা নেই।|ক্লাস তৈরি করুন',
 th:'คลาส|คลาสใหม่|ชื่อคลาส|จำนวนที่นั่ง|จำนวนที่ในรายชื่อรอ|แจ้งยกเลิกล่วงหน้า (นาที)|แพ็กเกจที่ใช้ได้|จองที่นั่ง|เข้ารายชื่อรอ|ยกเลิกการจอง|ยกเลิกคลาส|การจองคลาส|จองแล้ว|รายชื่อรอ|ยืนยันการเข้าเรียน|ไม่มาเรียน|ไม่มีสิทธิ์|ไม่มีคลาสให้บริการ|ไม่มีการจอง|เลือกครั้งแรกหรือครั้งที่สองของเวลาที่เกิดซ้ำนี้|ครั้งแรก|ครั้งที่สอง|ตรวจสอบเวลา แพ็กเกจ และขีดจำกัดของคลาส|คลาสนี้เต็มแล้ว|สมาชิกภาพหรือแพ็กเกจของคุณใช้กับคลาสนี้ไม่ได้|หมดเวลาจองหรือยกเลิกแล้ว|ไม่มีค่าธรรมเนียมหรือค่าปรับอัตโนมัติ|สร้างคลาส',
 ko:'수업|새 수업|수업 이름|정원|대기 정원|취소 사전 통지 (분)|허용 요금제|자리 예약|대기 명단 등록|예약 취소|수업 취소|수업 예약 명단|예약됨|대기 명단|출석 확인|결석|참여 자격 없음|이용 가능한 수업이 없습니다.|예약이 없습니다.|반복되는 이 시각의 첫 번째 또는 두 번째를 선택하세요.|첫 번째|두 번째|수업 일정, 요금제와 제한을 확인하세요.|이 수업은 정원이 찼습니다.|회원 상태나 요금제로 이 수업에 참여할 수 없습니다.|예약 또는 취소 기한이 지났습니다.|자동 요금이나 위약금이 없습니다.|수업 생성',
 zh:'课程|新课程|课程名称|名额|候补名额|取消提前通知 (分钟)|允许的套餐|预订名额|加入候补名单|取消预订|取消课程|课程预订名单|已预订|候补名单|已确认出席|缺席|不符合资格|暂无课程。|暂无预订。|请选择此重复时间的第一次或第二次。|第一次|第二次|请检查课程时间、套餐及限制。|本课程已满。|您的会员状态或套餐不允许参加本课程。|预订或取消期限已过。|不自动收取费用或罚款。|创建课程',
 'zh-TW':'課程|新課程|課程名稱|名額|候補名額|取消提前通知 (分鐘)|允許的方案|預訂名額|加入候補名單|取消預訂|取消課程|課程預訂名單|已預訂|候補名單|已確認出席|缺席|不符合資格|暫無課程。|暫無預訂。|請選擇此重複時間的第一次或第二次。|第一次|第二次|請檢查課程時間、方案及限制。|本課程已滿。|您的會員狀態或方案不允許參加本課程。|預訂或取消期限已過。|不自動收取費用或罰款。|建立課程',
}
keys.push('Class room','Class room (optional)','This room already has a class at that time.')
const roomWords={
  "es": "Sala|Sala de la clase (opcional)|La sala ya tiene una clase en ese horario.",
  "de": "Raum|Kursraum (optional)|Dieser Raum ist zu dieser Zeit bereits belegt.",
  "fr": "Salle|Salle du cours (facultatif)|Cette salle accueille déjà un cours à cet horaire.",
  "it": "Sala|Sala del corso (facoltativa)|Questa sala ospita già un corso a quell’ora.",
  "pt": "Sala|Sala da aula (opcional)|Esta sala já tem uma aula nesse horário.",
  "pt-BR": "Sala|Sala da aula (opcional)|Esta sala já tem uma aula nesse horário.",
  "pl": "Sala|Sala zajęć (opcjonalnie)|W tej sali są już zajęcia w tym terminie.",
  "hu": "Terem|Óraterem (opcionális)|Ebben a teremben már van óra ebben az időpontban.",
  "tr": "Salon|Ders salonu (isteğe bağlı)|Bu salonda o saatte zaten bir ders var.",
  "ru": "Зал|Зал занятия (необязательно)|В этом зале уже есть занятие в это время.",
  "uk": "Зала|Зала заняття (необов’язково)|У цій залі вже є заняття в цей час.",
  "ar": "القاعة|قاعة الحصة (اختياري)|توجد حصة بالفعل في هذه القاعة في هذا الوقت.",
  "hi": "कक्ष|कक्षा कक्ष (वैकल्पिक)|इस समय इस कक्ष में पहले से एक कक्षा है।",
  "bn": "কক্ষ|ক্লাসের কক্ষ (ঐচ্ছিক)|এই সময়ে এই কক্ষে ইতিমধ্যে একটি ক্লাস আছে।",
  "th": "ห้อง|ห้องเรียน (ไม่บังคับ)|ห้องนี้มีคลาสอยู่แล้วในเวลานี้",
  "ko": "강의실|수업 강의실 (선택 사항)|해당 시간에 이 강의실에는 이미 수업이 있습니다.",
  "zh": "教室|课程教室（可选）|该教室在此时间已有课程。",
  "zh-TW": "教室|課程教室（選填）|該教室在此時間已有課程。"
}
for(const [lang,value] of Object.entries(roomWords))words[lang]+='|'+value
keys.push('Class instructor (optional)','No eligible instructors.','The instructor assignment does not cover this class.','This instructor already has a class at that time.')
const instructorWords={
  "es": "Profesor de la clase (opcional)|No hay profesores disponibles.|La asignación del profesor no cubre esta clase.|El profesor ya tiene una clase en ese horario.",
  "de": "Kursleitung (optional)|Keine Kursleitung verfügbar.|Die Zuweisung deckt diesen Kurs nicht ab.|Die Kursleitung hat zu dieser Zeit bereits einen Kurs.",
  "fr": "Professeur du cours (facultatif)|Aucun professeur disponible.|L’affectation ne couvre pas ce cours.|Ce professeur a déjà un cours à cet horaire.",
  "it": "Istruttore del corso (facoltativo)|Nessun istruttore disponibile.|L’assegnazione non copre questo corso.|Questo istruttore ha già un corso a quell’ora.",
  "pt": "Professor da aula (opcional)|Não há professores disponíveis.|A atribuição do professor não cobre esta aula.|O professor já tem uma aula nesse horário.",
  "pt-BR": "Professor da aula (opcional)|Não há professores disponíveis.|A atribuição do professor não cobre esta aula.|O professor já tem uma aula nesse horário.",
  "pl": "Instruktor zajęć (opcjonalnie)|Brak dostępnych instruktorów.|Przypisanie instruktora nie obejmuje tych zajęć.|Ten instruktor ma już zajęcia w tym terminie.",
  "hu": "Óra oktatója (opcionális)|Nincs elérhető oktató.|Az oktatói megbízás nem fedi le ezt az órát.|Az oktatónak már van órája ebben az időpontban.",
  "tr": "Ders eğitmeni (isteğe bağlı)|Uygun eğitmen yok.|Eğitmen ataması bu dersi kapsamıyor.|Bu eğitmenin o saatte zaten bir dersi var.",
  "ru": "Преподаватель занятия (необязательно)|Нет доступных преподавателей.|Назначение не охватывает это занятие.|У преподавателя уже есть занятие в это время.",
  "uk": "Викладач заняття (необов’язково)|Немає доступних викладачів.|Призначення не охоплює це заняття.|Викладач уже має заняття в цей час.",
  "ar": "مدرب الحصة (اختياري)|لا يوجد مدربون متاحون.|تعيين المدرب لا يغطي هذه الحصة.|لدى هذا المدرب حصة بالفعل في هذا الوقت.",
  "hi": "कक्षा प्रशिक्षक (वैकल्पिक)|कोई योग्य प्रशिक्षक उपलब्ध नहीं है।|प्रशिक्षक की नियुक्ति इस कक्षा को कवर नहीं करती।|इस समय इस प्रशिक्षक की पहले से एक कक्षा है।",
  "bn": "ক্লাসের প্রশিক্ষক (ঐচ্ছিক)|কোনো যোগ্য প্রশিক্ষক উপলব্ধ নেই।|প্রশিক্ষকের নিয়োগ এই ক্লাসের জন্য প্রযোজ্য নয়।|এই সময়ে এই প্রশিক্ষকের ইতিমধ্যে একটি ক্লাস আছে।",
  "th": "ผู้สอนของคลาส (ไม่บังคับ)|ไม่มีผู้สอนที่พร้อมใช้งาน|การมอบหมายผู้สอนไม่ครอบคลุมคลาสนี้|ผู้สอนคนนี้มีคลาสอยู่แล้วในเวลานี้",
  "ko": "수업 강사 (선택 사항)|선택 가능한 강사가 없습니다.|강사 배정이 이 수업을 포함하지 않습니다.|해당 시간에 이 강사는 이미 수업이 있습니다.",
  "zh": "课程教练（可选）|没有可用的教练。|教练的任职期限不覆盖此课程。|该教练在此时间已有课程。",
  "zh-TW": "課程教練（選填）|沒有可用的教練。|教練的任職期限不涵蓋此課程。|該教練在此時間已有課程。"
}
for(const [lang,value] of Object.entries(instructorWords))words[lang]+='|'+value
keys.push('Correct attendance','Attendance history','Original attendance','Current attendance','Attendance already has that state.')
const attendanceWords={
  "es": "Rectificar asistencia|Historial de asistencia|Asistencia original|Asistencia actual|La asistencia ya tiene ese estado.",
  "de": "Teilnahme korrigieren|Teilnahmeverlauf|Ursprüngliche Teilnahme|Aktuelle Teilnahme|Die Teilnahme hat bereits diesen Status.",
  "fr": "Rectifier la présence|Historique de présence|Présence initiale|Présence actuelle|La présence a déjà cet état.",
  "it": "Correggi presenza|Storico presenze|Presenza originale|Presenza attuale|La presenza ha già questo stato.",
  "pt": "Retificar presença|Histórico de presença|Presença original|Presença atual|A presença já tem esse estado.",
  "pt-BR": "Retificar presença|Histórico de presença|Presença original|Presença atual|A presença já tem esse estado.",
  "pl": "Skoryguj obecność|Historia obecności|Pierwotna obecność|Aktualna obecność|Obecność ma już ten stan.",
  "hu": "Jelenlét javítása|Jelenléti előzmények|Eredeti jelenlét|Aktuális jelenlét|A jelenlét már ebben az állapotban van.",
  "tr": "Katılımı düzelt|Katılım geçmişi|İlk katılım kaydı|Güncel katılım|Katılım zaten bu durumda.",
  "ru": "Исправить посещение|История посещений|Исходное посещение|Текущее посещение|Посещение уже имеет этот статус.",
  "uk": "Виправити відвідування|Історія відвідувань|Початкове відвідування|Поточне відвідування|Відвідування вже має цей стан.",
  "ar": "تصحيح الحضور|سجل الحضور|الحضور الأصلي|الحضور الحالي|الحضور بالفعل بهذه الحالة.",
  "hi": "उपस्थिति सुधारें|उपस्थिति इतिहास|मूल उपस्थिति|वर्तमान उपस्थिति|उपस्थिति की स्थिति पहले से यही है।",
  "bn": "উপস্থিতি সংশোধন|উপস্থিতির ইতিহাস|মূল উপস্থিতি|বর্তমান উপস্থিতি|উপস্থিতির অবস্থা ইতিমধ্যে এটিই।",
  "th": "แก้ไขการเข้าร่วม|ประวัติการเข้าร่วม|การเข้าร่วมเดิม|การเข้าร่วมปัจจุบัน|การเข้าร่วมอยู่ในสถานะนี้แล้ว",
  "ko": "출석 정정|출석 내역|원래 출석|현재 출석|출석이 이미 이 상태입니다.",
  "zh": "更正出勤|出勤历史|原始出勤|当前出勤|出勤已处于此状态。",
  "zh-TW": "更正出勤|出勤歷史|原始出勤|目前出勤|出勤已處於此狀態。"
}
for(const [lang,value] of Object.entries(attendanceWords))words[lang]+='|'+value
export function classStrings(lang){const values=words[lang]?.split('|');if(values?.length!==keys.length)throw new Error('incomplete class translations: '+lang);return Object.fromEntries(keys.map((key,index)=>[key,values[index]]))}

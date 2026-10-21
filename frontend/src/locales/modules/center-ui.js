const keys=['Hour','Minute','Choose time','Selected','No accounts found.','Retry','Disabled','Discard changes?','Your unsaved changes will be lost.']
const words={
 es:'Hora|Minuto|Elegir hora|Seleccionado|No se han encontrado cuentas.|Reintentar|Deshabilitado|¿Descartar los cambios?|Se perderán los cambios sin guardar.',
 de:'Stunde|Minute|Uhrzeit wählen|Ausgewählt|Keine Konten gefunden.|Erneut versuchen|Deaktiviert|Änderungen verwerfen?|Nicht gespeicherte Änderungen gehen verloren.',
 fr:'Heure|Minute|Choisir l’heure|Sélectionné|Aucun compte trouvé.|Réessayer|Désactivé|Abandonner les modifications ?|Les modifications non enregistrées seront perdues.',
 it:'Ora|Minuto|Scegli ora|Selezionato|Nessun account trovato.|Riprova|Disabilitato|Scartare le modifiche?|Le modifiche non salvate andranno perse.',
 pt:'Hora|Minuto|Escolher hora|Selecionado|Nenhuma conta encontrada.|Tentar novamente|Desativado|Descartar alterações?|As alterações não guardadas serão perdidas.',
 'pt-BR':'Hora|Minuto|Escolher horário|Selecionado|Nenhuma conta encontrada.|Tentar novamente|Desativado|Descartar alterações?|As alterações não salvas serão perdidas.',
 pl:'Godzina|Minuta|Wybierz godzinę|Wybrano|Nie znaleziono kont.|Spróbuj ponownie|Wyłączone|Odrzucić zmiany?|Niezapisane zmiany zostaną utracone.',
 hu:'Óra|Perc|Időpont kiválasztása|Kiválasztva|Nem található fiók.|Újra|Letiltva|Elveti a módosításokat?|A nem mentett módosítások elvesznek.',
 tr:'Saat|Dakika|Saat seç|Seçildi|Hesap bulunamadı.|Yeniden dene|Devre dışı|Değişiklikler silinsin mi?|Kaydedilmemiş değişiklikler kaybolacak.',
 ru:'Час|Минута|Выбрать время|Выбрано|Аккаунты не найдены.|Повторить|Отключено|Отменить изменения?|Несохранённые изменения будут потеряны.',
 uk:'Година|Хвилина|Вибрати час|Вибрано|Облікових записів не знайдено.|Повторити|Вимкнено|Відхилити зміни?|Незбережені зміни буде втрачено.',
 ar:'الساعة|الدقيقة|اختيار الوقت|محدد|لم يتم العثور على حسابات.|إعادة المحاولة|معطل|تجاهل التغييرات؟|ستفقد التغييرات غير المحفوظة.',
 hi:'घंटा|मिनट|समय चुनें|चुना गया|कोई खाता नहीं मिला।|फिर कोशिश करें|अक्षम|बदलाव छोड़ें?|बिना सहेजे बदलाव खो जाएंगे।',
 bn:'ঘণ্টা|মিনিট|সময় বেছে নিন|নির্বাচিত|কোনো অ্যাকাউন্ট পাওয়া যায়নি।|আবার চেষ্টা করুন|নিষ্ক্রিয়|পরিবর্তন বাতিল করবেন?|সংরক্ষণ না করা পরিবর্তন হারিয়ে যাবে।',
 th:'ชั่วโมง|นาที|เลือกเวลา|เลือกแล้ว|ไม่พบบัญชี|ลองอีกครั้ง|ปิดใช้งาน|ละทิ้งการเปลี่ยนแปลงหรือไม่|การเปลี่ยนแปลงที่ยังไม่บันทึกจะสูญหาย',
 ko:'시|분|시간 선택|선택됨|계정을 찾을 수 없습니다.|다시 시도|비활성화됨|변경 사항을 버릴까요?|저장하지 않은 변경 사항이 사라집니다.',
 zh:'小时|分钟|选择时间|已选择|未找到账户。|重试|已禁用|放弃更改？|未保存的更改将丢失。',
 'zh-TW':'小時|分鐘|選擇時間|已選取|找不到帳戶。|重試|已停用|捨棄變更？|未儲存的變更將遺失。'
}
export function centerUiStrings(lang){const values=words[lang]?.split('|');if(!values||values.length!==keys.length)throw new Error('incomplete center UI translations: '+lang);return Object.fromEntries(keys.map((key,i)=>[key,values[i]]))}

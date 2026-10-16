const keys=["Unsaved changes","Each form is saved separately.","Save form"]
const words={
  "es": [
    "Cambios sin guardar",
    "Cada formulario se guarda por separado.",
    "Guardar formulario"
  ],
  "fr": [
    "Modifications non enregistrées",
    "Chaque formulaire est enregistré séparément.",
    "Enregistrer le formulaire"
  ],
  "de": [
    "Ungespeicherte Änderungen",
    "Jedes Formular wird separat gespeichert.",
    "Formular speichern"
  ],
  "it": [
    "Modifiche non salvate",
    "Ogni modulo viene salvato separatamente.",
    "Salva modulo"
  ],
  "pt": [
    "Alterações por guardar",
    "Cada formulário é guardado separadamente.",
    "Guardar formulário"
  ],
  "pt-BR": [
    "Alterações não salvas",
    "Cada formulário é salvo separadamente.",
    "Salvar formulário"
  ],
  "pl": [
    "Niezapisane zmiany",
    "Każdy formularz zapisuje się osobno.",
    "Zapisz formularz"
  ],
  "hu": [
    "Nem mentett módosítások",
    "Minden űrlap külön kerül mentésre.",
    "Űrlap mentése"
  ],
  "tr": [
    "Kaydedilmemiş değişiklikler",
    "Her form ayrı kaydedilir.",
    "Formu kaydet"
  ],
  "ru": [
    "Несохранённые изменения",
    "Каждая форма сохраняется отдельно.",
    "Сохранить форму"
  ],
  "uk": [
    "Незбережені зміни",
    "Кожна форма зберігається окремо.",
    "Зберегти форму"
  ],
  "ar": [
    "تغييرات غير محفوظة",
    "يتم حفظ كل نموذج على حدة.",
    "حفظ النموذج"
  ],
  "hi": [
    "बिना सहेजे बदलाव",
    "हर फ़ॉर्म अलग सहेजा जाता है।",
    "फ़ॉर्म सहेजें"
  ],
  "bn": [
    "সংরক্ষণ না করা পরিবর্তন",
    "প্রতিটি ফর্ম আলাদাভাবে সংরক্ষিত হয়।",
    "ফর্ম সংরক্ষণ করুন"
  ],
  "th": [
    "การเปลี่ยนแปลงที่ยังไม่บันทึก",
    "บันทึกแต่ละแบบฟอร์มแยกกัน",
    "บันทึกแบบฟอร์ม"
  ],
  "ko": [
    "저장하지 않은 변경 사항",
    "각 양식은 별도로 저장됩니다.",
    "양식 저장"
  ],
  "zh": [
    "未保存的更改",
    "每个表单单独保存。",
    "保存表单"
  ],
  "zh-TW": [
    "未儲存的變更",
    "每個表單分別儲存。",
    "儲存表單"
  ]
}
export function formSavingStrings(lang){const values=words[lang];if(values?.length!==keys.length)throw new Error('incomplete form saving translations: '+lang);return Object.fromEntries(keys.map((key,i)=>[key,values[i]]))}

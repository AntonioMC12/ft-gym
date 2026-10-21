const keys=["Member overview","Member sections","Back to members","Fees and payments","Access and membership","Edit contact details","No linked account"]
const words={
  "es": "Resumen del socio|Apartados del socio|Volver a socios|Cuotas y cobros|Acceso y afiliación|Editar datos de contacto|Sin cuenta vinculada",
  "fr": "Résumé du membre|Rubriques du membre|Retour aux membres|Cotisations et paiements|Accès et adhésion|Modifier les coordonnées|Aucun compte lié",
  "de": "Mitgliederübersicht|Mitgliederbereiche|Zurück zu Mitgliedern|Beiträge und Zahlungen|Zugang und Mitgliedschaft|Kontaktdaten bearbeiten|Kein verknüpftes Konto",
  "it": "Riepilogo socio|Sezioni del socio|Torna ai soci|Quote e pagamenti|Accesso e iscrizione|Modifica recapiti|Nessun account collegato",
  "pt": "Resumo do sócio|Secções do sócio|Voltar aos sócios|Quotas e pagamentos|Acesso e inscrição|Editar contactos|Sem conta associada",
  "pt-BR": "Resumo do membro|Seções do membro|Voltar aos membros|Mensalidades e pagamentos|Acesso e associação|Editar contatos|Sem conta vinculada",
  "pl": "Podsumowanie członka|Sekcje członka|Powrót do członków|Składki i płatności|Dostęp i członkostwo|Edytuj dane kontaktowe|Brak powiązanego konta",
  "hu": "Tag áttekintése|Tag szakaszai|Vissza a tagokhoz|Tagdíjak és befizetések|Hozzáférés és tagság|Elérhetőségek szerkesztése|Nincs kapcsolt fiók",
  "tr": "Üye özeti|Üye bölümleri|Üyelere dön|Aidatlar ve ödemeler|Erişim ve üyelik|İletişim bilgilerini düzenle|Bağlı hesap yok",
  "ru": "Обзор участника|Разделы участника|К списку участников|Взносы и платежи|Доступ и членство|Изменить контактные данные|Нет связанного аккаунта",
  "uk": "Огляд учасника|Розділи учасника|До списку учасників|Внески та платежі|Доступ і членство|Змінити контактні дані|Немає пов’язаного облікового запису",
  "ar": "ملخص العضو|أقسام العضو|العودة إلى الأعضاء|الرسوم والمدفوعات|الدخول والعضوية|تعديل بيانات الاتصال|لا يوجد حساب مرتبط",
  "hi": "सदस्य का सारांश|सदस्य के अनुभाग|सदस्यों पर वापस जाएँ|शुल्क और भुगतान|प्रवेश और सदस्यता|संपर्क विवरण संपादित करें|कोई जुड़ा खाता नहीं",
  "bn": "সদস্যের সারসংক্ষেপ|সদস্যের বিভাগ|সদস্যদের তালিকায় ফিরুন|ফি ও পেমেন্ট|প্রবেশ ও সদস্যপদ|যোগাযোগের তথ্য সম্পাদনা|কোনো সংযুক্ত অ্যাকাউন্ট নেই",
  "th": "สรุปสมาชิก|ส่วนข้อมูลสมาชิก|กลับไปยังสมาชิก|ค่าธรรมเนียมและการชำระเงิน|การเข้าใช้และสมาชิกภาพ|แก้ไขข้อมูลติดต่อ|ไม่มีบัญชีที่เชื่อมโยง",
  "ko": "회원 요약|회원 메뉴|회원 목록으로|회비 및 결제|출입 및 회원 상태|연락처 수정|연결된 계정 없음",
  "zh": "会员概览|会员栏目|返回会员列表|会费与收款|出入与会员状态|编辑联系信息|未关联账号",
  "zh-TW": "會員概覽|會員欄目|返回會員列表|會費與收款|出入與會員狀態|編輯聯絡資訊|未連結帳號"
}
export function memberWorkspaceStrings(lang){const values=words[lang]?.split('|');if(values?.length!==keys.length)throw new Error('incomplete member workspace translations: '+lang);return Object.fromEntries(keys.map((key,i)=>[key,values[i]]))}

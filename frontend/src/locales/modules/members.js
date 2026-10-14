const keys=['Members','New member','Member name','Member number','National document','Search members','No members available','Member details','Pending activation','Active member','Frozen member','Ended member','Check the member details.','Duplicate member in this center.']
import { lifecycleStrings } from './lifecycle.js'
import { invitationStrings } from './invitations.js'
import { membershipPlanStrings } from './membership-plans.js'
import { subscriptionStrings } from './subscriptions.js'
import { billingStrings } from './billing.js'
import { receiptStrings } from './receipts.js'
import { paymentStrings } from './payments.js'
import { debtStrings } from './debt.js'
import { memberPortalStrings } from './member-portal.js'
const words={
 es:['Socios','Nuevo socio','Nombre del socio','Número de socio','Documento de identidad','Buscar socios','No hay socios disponibles','Ficha del socio','Pendiente de activación','Socio activo','Socio en pausa','Socio de baja','Revisa los datos del socio.','Ya existe un socio con estos datos en este centro.'],
 de:['Mitglieder','Neues Mitglied','Mitgliedsname','Mitgliedsnummer','Ausweisdokument','Mitglieder suchen','Keine Mitglieder verfügbar','Mitgliedsprofil','Aktivierung ausstehend','Aktives Mitglied','Pausiertes Mitglied','Beendete Mitgliedschaft','Prüfe die Mitgliedsdaten.','Ein Mitglied mit diesen Daten existiert bereits in diesem Zentrum.'],
 fr:['Adhérents','Nouvel adhérent',"Nom de l’adhérent","Numéro d’adhérent","Pièce d’identité","Rechercher des adhérents","Aucun adhérent disponible","Fiche de l’adhérent","Activation en attente","Adhérent actif","Adhésion suspendue","Adhésion terminée","Vérifiez les données de l’adhérent.","Un adhérent avec ces données existe déjà dans ce centre."],
 it:['Soci','Nuovo socio','Nome del socio','Numero del socio','Documento di identità','Cerca soci','Nessun socio disponibile','Scheda del socio','In attesa di attivazione','Socio attivo','Socio in pausa','Iscrizione terminata','Controlla i dati del socio.','Un socio con questi dati esiste già in questo centro.'],
 pt:['Sócios','Novo sócio','Nome do sócio','Número de sócio','Documento de identidade','Pesquisar sócios','Nenhum sócio disponível','Ficha do sócio','Ativação pendente','Sócio ativo','Sócio em pausa','Inscrição terminada','Verifica os dados do sócio.','Já existe um sócio com estes dados neste centro.'],
 pl:['Członkowie','Nowy członek','Imię i nazwisko członka','Numer członka','Dokument tożsamości','Szukaj członków','Brak członków','Profil członka','Oczekiwanie na aktywację','Aktywny członek','Wstrzymane członkostwo','Zakończone członkostwo','Sprawdź dane członka.','Członek z tymi danymi już istnieje w tym centrum.'],
 tr:['Üyeler','Yeni üye','Üye adı','Üye numarası','Kimlik belgesi','Üye ara','Üye bulunamadı','Üye profili','Etkinleştirme bekleniyor','Aktif üye','Dondurulmuş üyelik','Sona eren üyelik','Üye bilgilerini kontrol edin.','Bu merkezde bu bilgilerle bir üye zaten var.'],
 ru:['Участники','Новый участник','Имя участника','Номер участника','Документ удостоверения личности','Поиск участников','Участников нет','Карточка участника','Ожидает активации','Активный участник','Приостановленное членство','Завершённое членство','Проверьте данные участника.','Участник с такими данными уже есть в этом центре.'],
 uk:['Учасники','Новий учасник',"Ім’я учасника",'Номер учасника','Документ посвідчення особи','Пошук учасників','Учасників немає','Картка учасника','Очікує активації','Активний учасник','Призупинене членство','Завершене членство','Перевірте дані учасника.','Учасник із такими даними вже є в цьому центрі.'],
 zh:['会员','新增会员','会员姓名','会员编号','身份证明文件','搜索会员','暂无会员','会员资料','等待激活','有效会员','暂停会员','已结束会员','请检查会员资料。','此中心已有使用这些资料的会员。'],
 'zh-TW':['會員','新增會員','會員姓名','會員編號','身分證明文件','搜尋會員','暫無會員','會員資料','等待啟用','有效會員','暫停會員','已結束會員','請檢查會員資料。','此中心已有使用這些資料的會員。'],
 ko:['회원','새 회원','회원 이름','회원 번호','신분 증명서','회원 검색','회원이 없습니다','회원 정보','활성화 대기','활성 회원','일시 중지된 회원','종료된 회원','회원 정보를 확인하세요.','이 센터에 같은 정보의 회원이 이미 있습니다.'],
 hi:['सदस्य','नया सदस्य','सदस्य का नाम','सदस्य संख्या','पहचान दस्तावेज़','सदस्य खोजें','कोई सदस्य उपलब्ध नहीं','सदस्य विवरण','सक्रियण लंबित','सक्रिय सदस्य','विरामित सदस्यता','समाप्त सदस्यता','सदस्य विवरण जाँचें।','इस केंद्र में इन विवरणों वाला सदस्य पहले से मौजूद है।'],
 bn:['সদস্য','নতুন সদস্য','সদস্যের নাম','সদস্য নম্বর','পরিচয়পত্র','সদস্য খুঁজুন','কোনো সদস্য নেই','সদস্যের বিবরণ','সক্রিয়করণ বাকি','সক্রিয় সদস্য','স্থগিত সদস্যপদ','সমাপ্ত সদস্যপদ','সদস্যের বিবরণ পরীক্ষা করুন।','এই কেন্দ্রে এই তথ্যের একজন সদস্য আগে থেকেই আছেন।'],
 th:['สมาชิก','สมาชิกใหม่','ชื่อสมาชิก','หมายเลขสมาชิก','เอกสารระบุตัวตน','ค้นหาสมาชิก','ไม่มีสมาชิก','ข้อมูลสมาชิก','รอเปิดใช้งาน','สมาชิกที่ใช้งานอยู่','สมาชิกที่พักไว้','สมาชิกที่สิ้นสุดแล้ว','ตรวจสอบข้อมูลสมาชิก','ศูนย์นี้มีสมาชิกที่ใช้ข้อมูลนี้อยู่แล้ว'],
 hu:['Tagok','Új tag','Tag neve','Tagsági szám','Személyazonosító okmány','Tagok keresése','Nincsenek tagok','Tag adatlapja','Aktiválásra vár','Aktív tag','Szüneteltetett tagság','Lezárt tagság','Ellenőrizd a tag adatait.','Ebben a központban már létezik tag ezekkel az adatokkal.'],
 ar:['الأعضاء','عضو جديد','اسم العضو','رقم العضو','وثيقة الهوية','البحث عن أعضاء','لا يوجد أعضاء','بيانات العضو','بانتظار التفعيل','عضو نشط','عضوية معلّقة','عضوية منتهية','تحقق من بيانات العضو.','يوجد بالفعل عضو بهذه البيانات في هذا المركز.'],
}
export function memberStrings(lang){const values=words[lang];if(!values||values.length!==keys.length)throw new Error('incomplete member translations: '+lang);return {...Object.fromEntries(keys.map((key,i)=>[key,values[i]])),...lifecycleStrings(lang),...invitationStrings(lang),...membershipPlanStrings(lang),...subscriptionStrings(lang),...billingStrings(lang),...receiptStrings(lang),...paymentStrings(lang),...debtStrings(lang),...memberPortalStrings(lang)}}

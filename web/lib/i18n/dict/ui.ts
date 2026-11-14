// «ui» bo'limi lug'ati — umumiy UI komponentlar (components/ui/*). Kalitlar uz va ru'da bir xil bo'lishi shart (typeof uz tekshiradi).
import type { ToastType } from '../../toast';

export const uz = {
  /** BarcodeInputField */
  barcode: {
    placeholder: "Skaner yoki qo'lda",
    scanActive: 'Pistalet faol',
  },
  /** CameraScanButton — shtrix/QR skaner modali */
  scan: {
    button: 'Kamera',
    title: 'Kamera bilan skanerlash',
    frameHint: 'Shtrix/QR kodni ramkaga tuting',
    autoHint: "Kod avtomatik o'qiladi. Ishlamasa — “Rasmga olib o‘qish”.",
    liveFailed: 'Jonli kamera ochilmadi — pastdagi “Rasmga olib o‘qish” tugmasidan foydalaning.',
    notFound: 'Kod topilmadi — yorug‘ joyda, kodni to‘ldirib qayta suratga oling.',
    reading: 'O‘qilmoqda…',
    photoRead: 'Kamera bilan suratga olib o‘qish',
  },
  /** CameraCaptureModal — rasmga olish */
  capture: {
    title: 'Rasmga oling',
    noAccess: 'Kameraga ruxsat berilmadi yoki kamera topilmadi.',
    failed: 'Suratga olishda xatolik.',
    taking: 'Olinmoqda...',
    take: 'Suratga olish',
  },
  /** ImageUploadField */
  upload: {
    uploadedAlt: 'Yuklangan rasm',
    empty: 'Rasm yuklanmagan',
    camera: 'Kamera',
    gallery: 'Rasm',
    error: 'Yuklash xatosi',
  },
  /** Toaster sarlavhalari va SearchParamToast (?created=1 ...) xabarlari */
  toast: {
    titles: { success: 'Muvaffaqiyatli', error: 'Xatolik', info: 'Eslatma', warn: 'Diqqat' } as Record<ToastType, string>,
    params: {
      created: 'Muvaffaqiyatli qo‘shildi.',
      updated: 'Muvaffaqiyatli saqlandi.',
      deleted: 'Muvaffaqiyatli o‘chirildi.',
      branch: 'Filial qo‘shildi.',
      welcome: 'Xush kelibsiz! Do‘koningiz tayyor.',
      sold: 'Mahsulot sotildi.',
      transferred: 'Boshqa filialga berildi.',
      saved: 'Saqlandi.',
      denied: 'Bu amal uchun huquqingiz yo‘q.',
    },
  },
  /** MoreMenu (⋯) standart aria-label */
  moreMenu: {
    label: "Ko'proq amallar",
  },
  /** SelectAdd — tanlov maydoni ichida «+» (yangisini qo'shish), tanlanganini tahrirlash/o'chirish */
  selectAdd: {
    empty: "Hali yo'q — «+» bilan qo'shing",
    add: "Qo'shish",
    addNew: "Yangisini qo'shish",
    newName: 'Yangi nom',
    edit: 'Tahrirlash',
    editName: 'Yangi nomi',
    remove: "O'chirish",
    removeConfirm: "«{name}» o'chirilsinmi?",
    save: 'Saqlash',
    cancel: 'Bekor qilish',
    saving: 'Saqlanmoqda…',
    hiddenUsed: "«{name}» bo'yicha {n} ta yozuv bor — ro'yxatdan yashirildi, yozuvlar va hisob saqlandi.",
    systemLocked: "Tizim toifasini o'zgartirib bo'lmaydi.",
  },
};

export const ru: typeof uz = {
  barcode: {
    placeholder: 'Сканер или вручную',
    scanActive: 'Сканер-пистолет активен',
  },
  scan: {
    button: 'Камера',
    title: 'Сканировать камерой',
    frameHint: 'Наведите рамку на штрих-код или QR-код',
    autoHint: 'Код считывается автоматически. Если не сработало — «Снять фото и считать».',
    liveFailed: 'Не удалось открыть камеру — воспользуйтесь кнопкой «Снять фото и считать» ниже.',
    notFound: 'Код не найден — снимите ещё раз при хорошем освещении, чтобы код попал в кадр целиком.',
    reading: 'Считывание…',
    photoRead: 'Снять фото и считать',
  },
  capture: {
    title: 'Сделайте фото',
    noAccess: 'Нет доступа к камере или камера не найдена.',
    failed: 'Ошибка при съёмке.',
    taking: 'Съёмка...',
    take: 'Сделать фото',
  },
  upload: {
    uploadedAlt: 'Загруженное фото',
    empty: 'Фото не загружено',
    camera: 'Камера',
    gallery: 'Фото',
    error: 'Ошибка загрузки',
  },
  toast: {
    titles: { success: 'Успешно', error: 'Ошибка', info: 'Напоминание', warn: 'Внимание' },
    params: {
      created: 'Успешно добавлено.',
      updated: 'Успешно сохранено.',
      deleted: 'Успешно удалено.',
      branch: 'Филиал добавлен.',
      welcome: 'Добро пожаловать! Ваш магазин готов.',
      sold: 'Товар продан.',
      transferred: 'Передано в другой филиал.',
      saved: 'Сохранено.',
      denied: 'У вас нет прав на это действие.',
    },
  },
  moreMenu: {
    label: 'Другие действия',
  },
  selectAdd: {
    empty: 'Пока нет — добавьте кнопкой «+»',
    add: 'Добавить',
    addNew: 'Добавить новый',
    newName: 'Новое название',
    edit: 'Изменить',
    editName: 'Новое название',
    remove: 'Удалить',
    removeConfirm: 'Удалить «{name}»?',
    save: 'Сохранить',
    cancel: 'Отмена',
    saving: 'Сохранение…',
    hiddenUsed: 'По «{name}» есть записи ({n}) — категория скрыта из списка, записи и расчёты сохранены.',
    systemLocked: 'Системную категорию изменить нельзя.',
  },
};

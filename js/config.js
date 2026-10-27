/* =========================================================
   BINE CRM — настройки
   ========================================================= */
export const SHOP = {
  name: "Bine Store",
  url: "https://enzorockfort-afk.github.io/BineStores/", // сайт магазина
  currency: "лей",
};

/* =========================================================
   FIREBASE — ТОТ ЖЕ проект, что и у сайта магазина.
   Конфиг вставляется одинаковый в оба репозитория.
   Пока apiKey пустой — CRM работает в ДЕМО-режиме:
   данные хранятся только в этом браузере.
   ========================================================= */
export const FIREBASE = {
  apiKey: "AIzaSyBeT-5IXv4cynmLtECavfDY0okViKD6wLM",
  authDomain: "binecrm.firebaseapp.com",
  projectId: "binecrm",
  storageBucket: "binecrm.firebasestorage.app",
  messagingSenderId: "103777865626",
  appId: "1:103777865626:web:00a247429751b92383f423",
};

/* Вход в CRM: вводится только пароль.
   - Режим Firebase: вход в аккаунт администратора CRM_EMAIL с этим паролем
     (аккаунт создаётся в Firebase Console → Authentication → Add user).
   - Демо-режим: пароль сверяется с хэшем ниже (сам пароль в коде не хранится).
   Сменить пароль для демо: node -e "console.log(require('crypto').createHash('sha256').update('bine-crm:НОВЫЙ').digest('hex'))" */
export const CRM_EMAIL = "babaevdavid88@gmail.com";
export const CRM_PASS_HASH = "7283574ebbbe30f3e0dfa35ca40a4d24fef97282de8a349aa450442b6514ab52";

/* Демо-бэкенд создаёт локального администратора (в режиме Firebase не используется) */
export const DEMO_ADMIN = { email: "admin@binestore.md", password: "demo-local-only", name: "Администратор" };

export const CATEGORIES = ["Обувь", "Одежда", "Аксессуары", "Сумки"];
export const REQUEST_STATUSES = {
  new: "Новая",
  progress: "Ищем",
  offered: "Предложение",
  prepaid: "Предоплата",
  ordered: "Выкуплено",
  transit: "В пути",
  arrived: "Приехало",
  done: "Выдано",
  cancelled: "Отменена",
};
export const SOURCES = { site: "Сайт", instagram: "Instagram", telegram: "Telegram", whatsapp: "WhatsApp", viber: "Viber", offline: "Лично", other: "Другое" };
export const ORDER_STATUSES = {
  new: "Новый",
  confirmed: "Подтверждён",
  ordered: "Заказан в Китае",
  shipping: "В пути",
  ready: "Готов к выдаче",
  done: "Выполнен",
  cancelled: "Отменён",
};

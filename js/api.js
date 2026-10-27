import { FIREBASE } from "./config.js";

/* Выбирает бэкенд: Firebase, если заполнен конфиг, иначе демо в браузере. */
export const api = await (FIREBASE.apiKey
  ? import("./backend/firebase.js").then((m) => m.createFirebase(FIREBASE))
  : import("./backend/local.js").then((m) => m.createLocal()));

const AUTH_ERRORS = {
  "auth/email-already-in-use": "Этот email уже зарегистрирован",
  "auth/invalid-credential": "Неверный email или пароль",
  "auth/wrong-password": "Неверный email или пароль",
  "auth/user-not-found": "Неверный email или пароль",
  "auth/invalid-email": "Проверьте email",
  "auth/weak-password": "Пароль — минимум 6 символов",
  "auth/too-many-requests": "Слишком много попыток. Попробуйте позже",
  "auth/network-request-failed": "Нет соединения с интернетом",
  "permission-denied": "Недостаточно прав",
};
export const errorText = (e) => AUTH_ERRORS[e?.code] || e?.message || "Что-то пошло не так. Попробуйте ещё раз";

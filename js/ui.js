/* Небольшой набор помощников интерфейса для CRM */
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = new Intl.NumberFormat("ru-RU");
export const money = (n) => nf.format(n || 0) + " лей";

export const icon = {
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  arrow: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20.5c1.2-3.8 4-5.5 7.5-5.5s6.3 1.7 7.5 5.5"/></svg>',
  box: '<svg viewBox="0 0 24 24"><path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9Z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V4.5h6V7M7 7l1 13h8l1-13"/></svg>',
  upload: '<svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3.5h16V16"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
  sparkle: '<svg viewBox="0 0 24 24" class="fill"><path d="M12 1.5c.6 5.5 2 8.3 10.5 10.5C14 14.2 12.6 17 12 22.5 11.4 17 10 14.2 1.5 12 10 9.8 11.4 7 12 1.5Z"/></svg>',
};

function hue(s) {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
export function art(p, cls = "") {
  return `<div class="art ${cls}" style="--h:${hue(p.brand)}" role="img" aria-label="${esc(p.brand + " " + p.name)}">
    <span class="art-word">${esc(p.brand)}</span><i class="art-spark">${icon.sparkle}</i></div>`;
}

let toastWrap;
export function toast(msg, type = "") {
  toastWrap ||= document.body.appendChild(Object.assign(document.createElement("div"), { className: "toasts", role: "status" }));
  const t = document.createElement("div");
  t.className = "toast " + type;
  t.innerHTML = `<i>${type === "error" ? "!" : icon.check}</i><span>${esc(msg)}</span>`;
  toastWrap.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 400);
  }, 2600);
}

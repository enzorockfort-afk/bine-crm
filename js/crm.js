import { $, $$, esc, art, icon, toast } from "./ui.js";
import { api, errorText } from "./api.js";
import { ORDER_STATUSES, REQUEST_STATUSES, SOURCES, SHOP, CRM_EMAIL, CRM_PASS_HASH } from "./config.js";

/* =========================================================
   Bine CRM — отдельный сайт. Работает на тех же коллекциях Firebase, что и магазин:
   orders / requests — сделки (сайт создаёт, CRM ведёт),
   products — склад, clients и tasks — только CRM.
   ========================================================= */

const view = $("#view");
const nf = new Intl.NumberFormat("ru-RU");
const lei = (n) => nf.format(Math.round(n || 0));
const day = 864e5;
const startOfDay = (t = Date.now()) => new Date(new Date(t).toDateString()).getTime();
const fmtD = (t) => new Date(t).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
const fmtDT = (t) => new Date(t).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/* Телефон → ключ клиента: 8 последних значимых цифр (+373 / 0 отбрасываются) */
export function phoneKey(p) {
  let d = String(p || "").replace(/\D/g, "");
  if (d.startsWith("373")) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  return d;
}
const digitsIntl = (p) => {
  const k = phoneKey(p);
  return k.length === 8 ? "373" + k : String(p || "").replace(/\D/g, "");
};

/* ---------------- pipelines ---------------- */
const PIPES = {
  request: {
    label: "Под заказ",
    stages: ["new", "progress", "offered", "prepaid", "ordered", "transit", "arrived", "done"],
    names: REQUEST_STATUSES,
  },
  order: {
    label: "Наличие",
    stages: ["new", "confirmed", "ready", "shipping", "done"],
    names: { ...ORDER_STATUSES, ready: "Встреча назначена", shipping: "Отправлен", done: "Выдан" },
  },
};
const ACTIVE_ORDER = ["confirmed", "ordered", "shipping", "ready", "done"];

/* ---------------- state ---------------- */
const D = { orders: [], requests: [], products: [], clients: [], tasks: [] };
const S = { view: "today", pipe: "request", showClosed: false, q: "" };

async function load() {
  const [orders, requests, products, clients, tasks] = await Promise.all([
    api.orders.all().catch(() => []),
    api.requests.all().catch(() => []),
    api.products.list({ all: true }).catch(() => []),
    api.crm.list("clients").catch(() => []),
    api.crm.list("tasks").catch(() => []),
  ]);
  Object.assign(D, { orders, requests, products, clients, tasks });
}

function deals() {
  const fromOrder = (o) => ({
    kind: "order",
    id: o.id,
    raw: o,
    number: o.number,
    status: o.status,
    title: (o.items || []).map((i) => `${i.brand} ${i.name}, ${i.size}${i.qty > 1 ? ` ×${i.qty}` : ""}`).join("; "),
    name: o.contact?.name || "",
    phone: o.contact?.phone || "",
    sale: +o.total || 0,
    cost: +o.cost || 0,
    ship: +o.shipCost || 0,
    prepaid: +o.prepaid || 0,
    createdAt: o.createdAt,
    doneAt: o.doneAt,
    due: o.due,
    source: o.source || "site",
  });
  const fromReq = (r) => ({
    kind: "request",
    id: r.id,
    raw: r,
    number: r.number,
    status: r.status,
    title: `${r.title}${r.size ? `, ${r.size}` : ""}${r.qty > 1 ? ` ×${r.qty}` : ""}`,
    name: r.contact?.name || "",
    phone: r.contact?.phone || "",
    sale: +r.price || 0,
    cost: +r.cost || 0,
    ship: +r.shipCost || 0,
    prepaid: +r.prepaid || 0,
    createdAt: r.createdAt,
    doneAt: r.doneAt,
    due: r.due,
    source: r.source || "site",
  });
  return [...D.orders.map(fromOrder), ...D.requests.map(fromReq)].sort((a, b) => b.createdAt - a.createdAt);
}
const profitOf = (d) => (d.cost || d.ship ? d.sale - d.cost - d.ship : null);
const isOpen = (d) => d.status !== "done" && d.status !== "cancelled";
const findDeal = (kind, id) => deals().find((d) => d.kind === kind && d.id === id);

/* клиенты = сохранённые карточки + все контакты из сделок, склеенные по телефону */
function clients() {
  const map = new Map();
  for (const c of D.clients) map.set(phoneKey(c.phone) || c.id, { ...c, deals: [] });
  for (const d of deals()) {
    const k = phoneKey(d.phone);
    if (!k) continue;
    if (!map.has(k)) map.set(k, { id: "c" + k, name: d.name, phone: d.phone, source: d.source, tags: [], deals: [], derived: true });
    const c = map.get(k);
    c.deals.push(d);
    c.name ||= d.name;
  }
  return [...map.values()].map((c) => {
    const done = c.deals.filter((d) => d.status === "done");
    return {
      ...c,
      key: phoneKey(c.phone),
      spent: done.reduce((s, d) => s + d.sale, 0),
      profit: done.reduce((s, d) => s + (profitOf(d) || 0), 0),
      last: Math.max(c.updatedAt || 0, c.createdAt || 0, ...c.deals.map((d) => d.createdAt)),
    };
  });
}
const clientByPhone = (p) => clients().find((c) => c.key && c.key === phoneKey(p));

/* ---------------- shell ---------------- */
const TITLES = { today: "Сегодня", deals: "Сделки", clients: "Клиенты", stock: "Склад", tasks: "Задачи", data: "Данные" };
function route() {
  S.view = TITLES[location.hash.slice(1)] ? location.hash.slice(1) : "today";
  $$("#nav a").forEach((a) => a.setAttribute("aria-current", a.dataset.v === S.view ? "page" : "false"));
  $("#title").textContent = TITLES[S.view];
  render();
}
function badges() {
  $("#nNew").textContent = deals().filter((d) => d.status === "new").length || "";
  const end = startOfDay() + day;
  $("#nTasks").textContent = D.tasks.filter((t) => !t.done && t.due && t.due < end).length || "";
}
function render() {
  badges();
  view.innerHTML = { today, deals: dealsView, clients: clientsView, stock: stockView, tasks: tasksView, data: dataView }[S.view]();
  afterRender[S.view]?.();
}
const afterRender = {};

/* ---------------- Сегодня ---------------- */
function today() {
  const all = deals();
  const m0 = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const doneM = all.filter((d) => d.status === "done" && (d.doneAt || d.createdAt) >= m0);
  const open = all.filter(isOpen);
  const revenue = doneM.reduce((s, d) => s + d.sale, 0);
  const profit = doneM.reduce((s, d) => s + (profitOf(d) || 0), 0);
  const owed = open.reduce((s, d) => s + Math.max(0, d.sale - d.prepaid), 0);
  const end = startOfDay() + day;
  const tasks = D.tasks.filter((t) => !t.done && t.due && t.due < end).sort((a, b) => a.due - b.due);
  const fresh = all.filter((d) => d.status === "new").slice(0, 8);
  const low = [];
  for (const p of D.products) for (const [s, q] of Object.entries(p.stockQty || {})) if (q <= 1) low.push({ p, s, q });
  const month = new Date().toLocaleDateString("ru-RU", { month: "long" });

  return `
  <div class="kpis">
    <div class="kpi"><small>Выручка, ${month}</small><b>${lei(revenue)}</b><em>${doneM.length} выдано</em></div>
    <div class="kpi good"><small>Прибыль, ${month}</small><b>${lei(profit)}</b><em>где указана закупка</em></div>
    <div class="kpi"><small>Сделок в работе</small><b>${open.length}</b><em>на ${lei(open.reduce((s, d) => s + d.sale, 0))} лей</em></div>
    <div class="kpi"><small>Ждём оплату, лей</small><b>${lei(owed)}</b><em>остаток после предоплат</em></div>
  </div>
  <div class="cols2">
    <div>
      <div class="box">
        <div class="box-h"><h2>Задачи и встречи на сегодня</h2><a href="#tasks">Все задачи</a></div>
        ${tasks.length ? `<div>${tasks.map(taskRow).join("")}</div>` : `<p class="empty-mini">На сегодня всё сделано</p>`}
      </div>
      <div class="box">
        <div class="box-h"><h2>Новые сделки</h2><a href="#deals">Воронка</a></div>
        ${fresh.length ? `<div class="rows">${fresh.map(dealRow).join("")}</div>` : `<p class="empty-mini">Новых нет</p>`}
      </div>
    </div>
    <div>
      <div class="box">
        <div class="box-h"><h2>Заканчивается на складе</h2><a href="#stock">Склад</a></div>
        ${
          low.length
            ? `<div class="rows">${low
                .slice(0, 10)
                .map((l) => `<div class="row"><span class="ava">${esc(l.s)}</span><span><b>${esc(l.p.brand)} ${esc(l.p.name)}</b><small>размер ${esc(l.s)}</small></span><span class="pill ${l.q ? "warn" : "bad"}">${l.q ? "1 шт." : "нет"}</span></div>`)
                .join("")}</div>`
            : `<p class="empty-mini">${D.products.some((p) => p.stockQty) ? "Всего хватает" : "Укажите остатки по размерам в разделе «Склад»"}</p>`
        }
      </div>
      <div class="box">
        <div class="box-h"><h2>Ждут оплату</h2></div>
        ${(() => {
          const l = open.filter((d) => d.sale > d.prepaid && d.prepaid > 0).slice(0, 6);
          return l.length ? `<div class="rows">${l.map(dealRow).join("")}</div>` : `<p class="empty-mini">Нет сделок с частичной оплатой</p>`;
        })()}
      </div>
    </div>
  </div>`;
}
function dealRow(d) {
  const st = PIPES[d.kind].names[d.status] || d.status;
  return `<button class="row" data-deal="${d.kind}:${esc(d.id)}">
    <span class="ava">${esc((d.name || "?")[0].toUpperCase())}</span>
    <span><b>${esc(d.name || "Без имени")} · ${esc(d.title)}</b><small>${esc(d.number || "")} · ${PIPES[d.kind].label} · ${st}</small></span>
    <span class="r">${d.sale ? lei(d.sale) + " лей" : "—"}</span></button>`;
}

/* ---------------- Сделки (канбан) ---------------- */
function dealsView() {
  const P = PIPES[S.pipe];
  const q = S.q.toLowerCase();
  const list = deals().filter((d) => d.kind === S.pipe && (!q || `${d.name} ${d.phone} ${d.title} ${d.number}`.toLowerCase().includes(q)));
  const closed = list.filter((d) => d.status === "cancelled");
  const stages = [...P.stages, ...(S.showClosed ? ["cancelled"] : [])];
  return `
  <div class="pipe-bar">
    ${Object.entries(PIPES).map(([k, p]) => `<button class="chip" data-pipe="${k}" aria-pressed="${S.pipe === k}">${p.label} ${deals().filter((d) => d.kind === k && isOpen(d)).length}</button>`).join("")}
    <button class="chip" data-closed aria-pressed="${S.showClosed}" style="margin-left:auto">Отменённые ${closed.length}</button>
  </div>
  <div class="board">${stages
    .map((st) => {
      const items = list.filter((d) => d.status === st);
      const sum = items.reduce((s, d) => s + d.sale, 0);
      return `<section class="lane" data-lane="${st}" aria-label="${esc(P.names[st] || st)}">
        <div class="lane-h"><b>${esc(P.names[st] || st)} · ${items.length}</b><small>${sum ? lei(sum) + " лей" : ""}</small></div>
        <div class="lane-b">${items.map(dcard).join("")}</div>
      </section>`;
    })
    .join("")}</div>`;
}
function dcard(d) {
  const pr = profitOf(d);
  const late = d.due && d.due < Date.now() && isOpen(d);
  return `<button class="dcard" draggable="true" data-deal="${d.kind}:${esc(d.id)}">
    <span class="dcard-top"><span>${esc(d.number || "")}</span><span>${fmtD(d.createdAt)}</span></span>
    <span class="dcard-t">${esc(d.title)}</span>
    <span class="dcard-c">${esc(d.name || "Без имени")}${d.source && d.source !== "site" ? ` · ${SOURCES[d.source] || d.source}` : ""}</span>
    <span class="dcard-f"><b>${d.sale ? lei(d.sale) + " лей" : "цена не указана"}</b>
      ${late ? `<span class="pill bad">срок ${fmtD(d.due)}</span>` : pr != null ? `<span class="pill ${pr >= 0 ? "ok" : "bad"}">${pr >= 0 ? "+" : ""}${lei(pr)}</span>` : d.prepaid ? `<span class="pill warn">пред. ${lei(d.prepaid)}</span>` : ""}
    </span></button>`;
}
afterRender.deals = () => {
  let drag = null;
  view.addEventListener("dragstart", (e) => {
    const c = e.target.closest(".dcard");
    if (!c) return;
    drag = c.dataset.deal;
    c.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  });
  view.addEventListener("dragend", () => {
    $$(".dragging,.over", view).forEach((x) => x.classList.remove("dragging", "over"));
    drag = null;
  });
  view.addEventListener("dragover", (e) => {
    const l = e.target.closest(".lane");
    if (!l || !drag) return;
    e.preventDefault();
    $$(".lane", view).forEach((x) => x.classList.toggle("over", x === l));
  });
  view.addEventListener("drop", async (e) => {
    const l = e.target.closest(".lane");
    if (!l || !drag) return;
    e.preventDefault();
    const [kind, id] = drag.split(":");
    await setStatus(kind, id, l.dataset.lane);
    render();
  });
};

/* смена статуса + учёт склада для сделок из наличия */
async function setStatus(kind, id, status) {
  const raw = (kind === "order" ? D.orders : D.requests).find((x) => x.id === id);
  if (!raw || raw.status === status) return;
  const patch = { status };
  if (status === "done") patch.doneAt = Date.now();
  if (kind === "order") {
    if (ACTIVE_ORDER.includes(status) && !raw.stockApplied) {
      await moveStock(raw.items, -1);
      patch.stockApplied = true;
    }
    if (status === "cancelled" && raw.stockApplied) {
      await moveStock(raw.items, +1);
      patch.stockApplied = false;
    }
  }
  try {
    await (kind === "order" ? api.orders : api.requests).update(id, patch);
    Object.assign(raw, patch);
    toast(`${raw.number}: ${PIPES[kind].names[status] || status}`);
  } catch (err) {
    toast(errorText(err), "error");
  }
}
async function moveStock(items = [], dir) {
  for (const it of items) {
    const p = D.products.find((x) => x.id === it.id);
    if (!p?.stockQty || p.stockQty[it.size] == null) continue;
    p.stockQty = { ...p.stockQty, [it.size]: Math.max(0, (+p.stockQty[it.size] || 0) + dir * (it.qty || 1)) };
    await api.products.save(p).catch(() => {});
  }
}

/* ---------------- Клиенты ---------------- */
function clientsView() {
  const q = S.q.toLowerCase();
  const list = clients()
    .filter((c) => !q || `${c.name} ${c.phone} ${c.instagram || ""} ${c.telegram || ""} ${(c.tags || []).join(" ")}`.toLowerCase().includes(q))
    .sort((a, b) => b.last - a.last);
  return `
  <div class="pipe-bar"><span class="muted">${list.length} клиентов · всего куплено на ${lei(list.reduce((s, c) => s + c.spent, 0))} лей</span>
    <button class="btn btn-ghost btn-sm" data-newclient style="margin-left:auto">${icon.plus} Клиент</button></div>
  ${
    list.length
      ? `<div class="box" style="padding:6px 8px;overflow-x:auto"><table class="tbl">
    <thead><tr><th>Клиент</th><th class="hide-m">Метки</th><th class="num">Сделок</th><th class="num">Купил на</th><th class="num hide-m">Последний раз</th></tr></thead>
    <tbody>${list
      .map(
        (c) => `<tr class="click" data-client="${esc(c.key || c.id)}" tabindex="0">
        <td><div style="display:flex;gap:10px;align-items:center"><span class="ava ${c.spent ? "c" : ""}">${esc((c.name || "?")[0].toUpperCase())}</span><span><b style="font-size:14px">${esc(c.name || "Без имени")}</b><br><small class="muted">${esc(c.phone || "")}</small></span></div></td>
        <td class="hide-m">${(c.tags || []).map((t) => `<span class="tag-chip">${esc(t)}</span>`).join("")}</td>
        <td class="num">${c.deals.length}</td>
        <td class="num">${c.spent ? lei(c.spent) + " лей" : "—"}</td>
        <td class="num hide-m">${c.last ? fmtD(c.last) : ""}</td></tr>`
      )
      .join("")}</tbody></table></div>`
      : `<div class="empty-state"><div class="empty-orb">${icon.user}</div><p>Клиенты появятся из сделок или добавьте вручную</p></div>`
  }`;
}

/* ---------------- Склад ---------------- */
function stockView() {
  const q = S.q.toLowerCase();
  const list = D.products.filter((p) => !q || `${p.brand} ${p.name}`.toLowerCase().includes(q));
  let units = 0, value = 0, costV = 0;
  for (const p of D.products)
    for (const n of Object.values(p.stockQty || {})) {
      units += +n || 0;
      value += (+n || 0) * p.price;
      costV += (+n || 0) * (+p.cost || 0);
    }
  return `
  <div class="kpis">
    <div class="kpi"><small>Единиц на складе</small><b>${units}</b></div>
    <div class="kpi"><small>Стоимость по цене продажи</small><b>${lei(value)}</b></div>
    <div class="kpi"><small>Вложено (по закупке)</small><b>${lei(costV)}</b></div>
    <div class="kpi"><small>Товаров в каталоге</small><b>${D.products.length}</b></div>
  </div>
  <p class="muted" style="margin:0 0 14px">Количество сохраняется сразу. Пустое поле — размер не учитывается. Когда сделка из наличия подтверждается, остаток уменьшается сам; при отмене — возвращается. На сайте закончившийся размер станет недоступен.</p>
  ${
    list
      .map(
        (p) => `<div class="stock-card" data-pid="${esc(p.id)}">
      <span class="line-pic">${p.thumbs?.[0] ? `<img src="${p.thumbs[0]}" alt="${esc(p.brand + " " + p.name)}">` : art(p, "art-sm")}</span>
      <div>
        <div class="stock-h"><span><b>${esc(p.brand)} ${esc(p.name)}</b> <small class="muted">${lei(p.price)} лей${p.published ? "" : " · черновик"}</small></span>
          <label class="cost-in">Закупка <input type="number" inputmode="numeric" min="0" data-cost value="${p.cost ?? ""}" aria-label="Закупочная цена"></label></div>
        <div class="stock-sizes">${(p.sizes || [])
          .map((s) => {
            const v = p.stockQty?.[s];
            return `<label class="sz ${v === 0 ? "zero" : v === 1 ? "low" : ""}"><span>${esc(s)}</span><input type="number" inputmode="numeric" min="0" data-size="${esc(s)}" value="${v ?? ""}" aria-label="Размер ${esc(s)}, штук"></label>`;
          })
          .join("")}</div>
      </div></div>`
      )
      .join("") || `<div class="empty-state"><div class="empty-orb">${icon.box}</div><p>Товаров нет — добавьте их в админке сайта</p><a class="btn btn-ghost" href="${SHOP.url}admin.html#products" target="_blank" rel="noopener">Открыть админку магазина</a></div>`
  }`;
}
afterRender.stock = () => {
  const timers = {};
  view.addEventListener("input", (e) => {
    const card = e.target.closest("[data-pid]");
    if (!card) return;
    const p = D.products.find((x) => x.id === card.dataset.pid);
    if (e.target.dataset.size != null) {
      const v = e.target.value === "" ? null : Math.max(0, Math.round(+e.target.value));
      const q = { ...(p.stockQty || {}) };
      v == null ? delete q[e.target.dataset.size] : (q[e.target.dataset.size] = v);
      p.stockQty = Object.keys(q).length ? q : null;
      e.target.parentElement.className = `sz ${v === 0 ? "zero" : v === 1 ? "low" : ""}`;
    }
    if (e.target.dataset.cost != null) p.cost = e.target.value === "" ? null : Math.max(0, Math.round(+e.target.value));
    clearTimeout(timers[p.id]);
    timers[p.id] = setTimeout(() => api.products.save(p).then(() => toast("Склад сохранён")).catch((err) => toast(errorText(err), "error")), 600);
  });
};

/* ---------------- Задачи ---------------- */
const TT = {
  meet: ["Встреча", '<svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/></svg>'],
  call: ["Позвонить", '<svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1Z"/></svg>'],
  task: ["Задача", '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>'],
};
function taskRow(t) {
  const late = !t.done && t.due && t.due < Date.now();
  const c = t.phone ? clientByPhone(t.phone) : null;
  return `<div class="task ${t.done ? "done" : ""}">
    <label class="check"><input type="checkbox" data-tdone="${esc(t.id)}" ${t.done ? "checked" : ""} aria-label="Готово"></label>
    <span><b>${TT[t.type]?.[0] || ""}: ${esc(t.title)}</b>
      <small class="${late ? "late" : ""}">${t.due ? fmtDT(t.due) : "без срока"}${t.place ? ` · ${esc(t.place)}` : ""}${c ? ` · ${esc(c.name)}` : ""}</small></span>
    <button class="ic-btn" data-tdel="${esc(t.id)}" aria-label="Удалить задачу">${icon.trash}</button></div>`;
}
function tasksView() {
  const q = S.q.toLowerCase();
  const list = D.tasks.filter((t) => !q || `${t.title} ${t.place || ""}`.toLowerCase().includes(q));
  const t0 = startOfDay();
  const groups = [
    ["Просрочено", (t) => !t.done && t.due && t.due < t0],
    ["Сегодня", (t) => !t.done && t.due >= t0 && t.due < t0 + day],
    ["Завтра", (t) => !t.done && t.due >= t0 + day && t.due < t0 + 2 * day],
    ["Позже", (t) => !t.done && (!t.due || t.due >= t0 + 2 * day)],
    ["Сделано", (t) => t.done],
  ];
  const nowLocal = new Date(Date.now() + 36e5 - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
  return `
  <form class="task-form" id="taskForm">
    <select class="select" name="type" aria-label="Тип">${Object.entries(TT).map(([k, [t]]) => `<option value="${k}">${t}</option>`).join("")}</select>
    <input class="input" name="title" placeholder="Что сделать" aria-label="Задача" required>
    <input class="input" name="due" type="datetime-local" value="${nowLocal}" aria-label="Когда">
    <button class="btn btn-chrome btn-sm" style="height:44px">Добавить</button>
    <input class="input" name="place" placeholder="Место встречи (необязательно)" aria-label="Место" style="grid-column:1/3">
    <input class="input" name="phone" list="clientPhones" placeholder="Телефон клиента (необязательно)" aria-label="Клиент" style="grid-column:3/5">
    <datalist id="clientPhones">${clients().map((c) => `<option value="${esc(c.phone)}">${esc(c.name)}</option>`).join("")}</datalist>
  </form>
  ${groups
    .map(([name, fn]) => {
      const l = list.filter(fn).sort((a, b) => (a.due || 9e15) - (b.due || 9e15));
      return l.length ? `<div class="tgroup box"><h3>${name} · ${l.length}</h3>${l.map(taskRow).join("")}</div>` : "";
    })
    .join("") || `<div class="empty-state"><div class="empty-orb">${icon.check}</div><p>Задач нет</p></div>`}`;
}
afterRender.tasks = () => {
  $("#taskForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const F = e.target.elements;
    if (!F.title.value.trim()) return F.title.focus();
    await saveTask({ type: F.type.value, title: F.title.value.trim(), due: F.due.value ? new Date(F.due.value).getTime() : null, place: F.place.value.trim(), phone: F.phone.value.trim() });
    render();
  });
};
async function saveTask(t) {
  try {
    const saved = await api.crm.save("tasks", { done: false, ...t });
    const i = D.tasks.findIndex((x) => x.id === saved.id);
    i >= 0 ? (D.tasks[i] = saved) : D.tasks.unshift(saved);
    toast(t.id ? "Задача обновлена" : "Задача добавлена");
  } catch (err) {
    toast(errorText(err), "error");
  }
}

/* ---------------- Данные ---------------- */
function dataView() {
  return `
  <div class="cols2">
    <div class="box">
      <div class="box-h"><h2>Где хранятся данные</h2></div>
      <p class="muted">${
        api.mode === "demo"
          ? "Сейчас — демо-режим: всё лежит только в этом браузере. Если очистить браузер или зайти с телефона, данных там не будет. Подключите Firebase по README, затем импортируйте сюда файл выгрузки."
          : "Подключён Firebase: данные общие для всех устройств администратора и для сайта."
      }</p>
      <p class="muted">CRM и сайт используют одни и те же заказы, заявки и товары. Когда сайт откроется, его заказы и заявки сами появятся в воронке и в карточках клиентов.</p>
    </div>
    <div class="box">
      <div class="box-h"><h2>Резервная копия</h2></div>
      <p class="muted">Файл с товарами (вместе с фото), заказами, заявками, клиентами и задачами.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-chrome btn-sm" id="exportBtn">${icon.upload} Скачать копию</button>
        <label class="btn btn-ghost btn-sm" style="cursor:pointer">Загрузить копию<input type="file" id="importFile" accept="application/json,.json" hidden></label>
      </div>
      <p class="form-err" id="dataErr"></p>
    </div>
  </div>`;
}
afterRender.data = () => {
  $("#exportBtn").addEventListener("click", async (e) => {
    const b = e.currentTarget;
    b.classList.add("loading");
    const images = {};
    for (const p of D.products) if (p.imgCount) images[p.id] = await api.products.images(p.id).catch(() => []);
    const dump = { app: "bine-crm", version: 1, exportedAt: new Date().toISOString(), products: D.products, images, orders: D.orders, requests: D.requests, clients: D.clients, tasks: D.tasks };
    const url = URL.createObjectURL(new Blob([JSON.stringify(dump)], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `bine-crm-${new Date().toISOString().slice(0, 10)}.json` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    b.classList.remove("loading");
  });
  $("#importFile").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const dump = JSON.parse(await f.text());
      if (dump.app !== "bine-crm") throw new Error("Это не файл копии Bine CRM");
      toast("Загружаю копию…");
      for (const p of dump.products || []) {
        const imgs = dump.images?.[p.id];
        await api.products.save(p, imgs?.length ? await Promise.all(imgs.map(async (full, i) => ({ full, thumb: p.thumbs?.[i] || (i < 2 ? full : null) }))) : undefined);
      }
      for (const col of ["orders", "requests", "clients", "tasks"]) for (const x of dump[col] || []) await api.crm.save(col, x);
      await load();
      toast("Копия загружена");
      render();
    } catch (err) {
      $("#dataErr").textContent = errorText(err);
    }
    e.target.value = "";
  });
};

/* ---------------- side panel ---------------- */
const panel = $("#panel");
function openPanel(title, body, foot = "") {
  $("#pTitle").textContent = title;
  $("#pBody").innerHTML = body;
  $("#pFoot").innerHTML = foot;
  panel.classList.add("open");
  panel.setAttribute("aria-hidden", "false");
  $("#pScrim").hidden = false;
  $("#pClose").focus();
}
function closePanel() {
  panel.classList.remove("open");
  panel.setAttribute("aria-hidden", "true");
  $("#pScrim").hidden = true;
}
$("#pClose").addEventListener("click", closePanel);
$("#pScrim").addEventListener("click", closePanel);
addEventListener("keydown", (e) => e.key === "Escape" && panel.classList.contains("open") && closePanel());

function contactBtns(phone, extra = {}) {
  const d = digitsIntl(phone);
  if (!d) return "";
  return `<div class="contact-btns">
    <a class="btn btn-ghost" href="tel:+${d}">Позвонить</a>
    <a class="btn btn-ghost" href="https://wa.me/${d}" target="_blank" rel="noopener">WhatsApp</a>
    <a class="btn btn-ghost" href="viber://chat?number=%2B${d}">Viber</a>
    ${extra.telegram ? `<a class="btn btn-ghost" href="https://t.me/${esc(extra.telegram.replace(/^@/, ""))}" target="_blank" rel="noopener">Telegram</a>` : ""}
    ${extra.instagram ? `<a class="btn btn-ghost" href="https://instagram.com/${esc(extra.instagram.replace(/^@/, ""))}" target="_blank" rel="noopener">Instagram</a>` : ""}
  </div>`;
}

function openDeal(kind, id) {
  const d = findDeal(kind, id);
  if (!d) return;
  const r = d.raw;
  const P = PIPES[kind];
  const c = clientByPhone(d.phone);
  const dueVal = r.due ? new Date(r.due - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10) : "";
  openPanel(
    `${d.number || "Сделка"}`,
    `<div class="ps-sec"><span class="tag tag-${kind === "order" ? "stock" : "china"}" style="background:transparent">${P.label}</span>
      <span class="muted" style="margin-left:8px">${fmtDT(d.createdAt)} · ${SOURCES[d.source] || d.source}</span></div>
    <div class="ps-sec"><h3>Клиент</h3>
      <button class="row" data-client="${esc(phoneKey(d.phone))}" style="padding:6px 0"><span class="ava c">${esc((d.name || "?")[0].toUpperCase())}</span><span><b>${esc(d.name || "Без имени")}</b><small>${esc(d.phone)}${c ? ` · ${c.deals.length} сделок` : ""}</small></span><span class="r">${icon.arrow}</span></button>
      ${contactBtns(d.phone, c || {})}</div>
    <div class="ps-sec"><h3>Что</h3>
      ${kind === "order" ? `<ul class="ps-items">${(r.items || []).map((i) => `<li>${esc(i.brand)} ${esc(i.name)} — р. ${esc(i.size)} × ${i.qty} · ${lei(i.price)} лей</li>`).join("")}</ul>` : `<p class="ps-items" style="margin:0">${esc(d.title)}${r.color ? `, ${esc(r.color)}` : ""}${r.budget ? ` · бюджет до ${lei(r.budget)} лей` : ""}</p>${r.link ? `<p class="ps-items" style="margin:4px 0 0;word-break:break-all"><a href="${/^https?:/i.test(r.link) ? esc(r.link) : "#"}" target="_blank" rel="noopener noreferrer" style="text-decoration:underline">${esc(r.link)}</a></p>` : ""}`}
      ${r.photos?.length ? `<div class="mini-photos" style="margin-top:8px">${r.photos.map((p, k) => `<button type="button" data-zoom="${k}" aria-label="Фото ${k + 1}"><img src="${p}" alt="Фото ${k + 1}"></button>`).join("")}</div>` : ""}
      ${r.comment ? `<p class="muted" style="margin:8px 0 0">«${esc(r.comment)}»</p>` : ""}
      ${kind === "order" && r.delivery ? `<p class="muted" style="margin:8px 0 0">${r.delivery.type === "ship" ? `Доставка: ${esc(r.delivery.city)}, ${esc(r.delivery.address)}` : "Встреча в Кишинёве"}</p>` : ""}</div>
    <form id="dealEdit" class="stack" novalidate>
      <label class="field"><span>Этап</span><select class="select" name="status">${[...P.stages, "cancelled"].map((s) => `<option value="${s}"${s === d.status ? " selected" : ""}>${esc(P.names[s] || s)}</option>`).join("")}</select></label>
      <div class="money">
        <label class="field"><span>Продажа, лей</span><input class="input" name="sale" type="number" inputmode="numeric" min="0" value="${d.sale || ""}"></label>
        <label class="field"><span>Закупка, лей</span><input class="input" name="cost" type="number" inputmode="numeric" min="0" value="${d.cost || ""}"></label>
        <label class="field"><span>Доставка из Китая, лей</span><input class="input" name="ship" type="number" inputmode="numeric" min="0" value="${d.ship || ""}"></label>
        <label class="field"><span>Получено (предоплата), лей</span><input class="input" name="prepaid" type="number" inputmode="numeric" min="0" value="${d.prepaid || ""}"></label>
      </div>
      <div class="calc" id="calc"></div>
      <div class="money">
        <label class="field"><span>Поставщик</span><input class="input" name="supplier" value="${esc(r.supplier || "")}"></label>
        <label class="field"><span>Трек-номер</span><input class="input" name="tracking" value="${esc(r.tracking || "")}"></label>
        <label class="field"><span>Срок</span><input class="input" name="due" type="date" value="${dueVal}"></label>
        <label class="field"><span>Источник</span><select class="select" name="source">${Object.entries(SOURCES).map(([k, t]) => `<option value="${k}"${k === d.source ? " selected" : ""}>${t}</option>`).join("")}</select></label>
      </div>
      <label class="field"><span>Заметки</span><textarea class="textarea" name="notes" rows="3">${esc(r.notes || "")}</textarea></label>
    </form>`,
    `<button class="btn btn-ghost" data-addtask="${esc(d.phone)}|${esc(d.number || "")}">Задача</button><button class="btn btn-chrome" id="dealSave">Сохранить</button>`
  );
  const F = $("#dealEdit").elements;
  const calc = () => {
    const sale = +F.sale.value || 0, cost = (+F.cost.value || 0) + (+F.ship.value || 0), pre = +F.prepaid.value || 0;
    const pr = sale - cost;
    $("#calc").innerHTML = `<div class="${cost ? (pr >= 0 ? "pos" : "neg") : ""}"><small>Прибыль</small><b>${cost ? lei(pr) : "—"}</b></div><div><small>Осталось получить</small><b>${lei(Math.max(0, sale - pre))}</b></div>`;
  };
  $("#dealEdit").addEventListener("input", calc);
  calc();
  $("#dealSave").addEventListener("click", async () => {
    const num = (n) => (F[n].value === "" ? 0 : Math.max(0, Math.round(+F[n].value)));
    const patch = {
      cost: num("cost"),
      shipCost: num("ship"),
      prepaid: num("prepaid"),
      supplier: F.supplier.value.trim(),
      tracking: F.tracking.value.trim(),
      due: F.due.value ? new Date(F.due.value + "T12:00").getTime() : null,
      source: F.source.value,
      notes: F.notes.value.trim(),
    };
    patch[kind === "order" ? "total" : "price"] = num("sale");
    try {
      await (kind === "order" ? api.orders : api.requests).update(id, patch);
      Object.assign(r, patch);
      if (F.status.value !== d.status) await setStatus(kind, id, F.status.value);
      toast("Сделка сохранена");
      closePanel();
      render();
    } catch (err) {
      toast(errorText(err), "error");
    }
  });
}

function openClient(key) {
  const c = clients().find((x) => (x.key || x.id) === key) || { key, name: "", phone: "", tags: [], deals: [], derived: true };
  const done = c.deals.filter((d) => d.status === "done");
  openPanel(
    c.name || "Новый клиент",
    `${c.deals.length ? `<div class="calc"><div><small>Купил на</small><b>${lei(c.spent)}</b></div><div class="pos"><small>Прибыль с клиента</small><b>${lei(c.profit)}</b></div></div>` : ""}
    ${c.phone ? contactBtns(c.phone, c) : ""}
    <form id="clientEdit" class="stack" novalidate>
      <div class="row2">
        <label class="field"><span>Имя *</span><input class="input" name="cname" value="${esc(c.name || "")}"></label>
        <label class="field"><span>Телефон *</span><input class="input" name="phone" type="tel" value="${esc(c.phone || "")}"></label>
        <label class="field"><span>Telegram</span><input class="input" name="telegram" value="${esc(c.telegram || "")}" placeholder="@username"></label>
        <label class="field"><span>Instagram</span><input class="input" name="instagram" value="${esc(c.instagram || "")}" placeholder="@username"></label>
        <label class="field"><span>Размер обуви</span><input class="input" name="shoe" value="${esc(c.sizes?.shoe || "")}"></label>
        <label class="field"><span>Размер одежды</span><input class="input" name="cloth" value="${esc(c.sizes?.cloth || "")}"></label>
      </div>
      <label class="field"><span>Любимые бренды</span><input class="input" name="brands" value="${esc(c.brands || "")}"></label>
      <label class="field"><span>Метки через запятую</span><input class="input" name="tags" value="${esc((c.tags || []).join(", "))}" placeholder="постоянный, перекуп, VIP"></label>
      <label class="field"><span>Откуда</span><select class="select" name="source">${Object.entries(SOURCES).map(([k, t]) => `<option value="${k}"${k === (c.source || "instagram") ? " selected" : ""}>${t}</option>`).join("")}</select></label>
      <label class="field"><span>Заметки</span><textarea class="textarea" name="notes" rows="3">${esc(c.notes || "")}</textarea></label>
    </form>
    ${c.deals.length ? `<div class="ps-sec"><h3>Сделки · ${c.deals.length} (выдано ${done.length})</h3><div class="rows">${c.deals.map(dealRow).join("")}</div></div>` : ""}`,
    `${c.phone ? `<button class="btn btn-ghost" data-dealfor="${esc(c.phone)}|${esc(c.name || "")}">Сделка</button>` : ""}<button class="btn btn-chrome" id="clientSave">Сохранить</button>`
  );
  $("#clientSave").addEventListener("click", async () => {
    const F = $("#clientEdit").elements;
    const name = F.cname.value.trim(), phone = F.phone.value.trim();
    if (!name || phoneKey(phone).length < 6) return toast("Укажите имя и телефон", "error");
    const k = phoneKey(phone);
    const data = {
      id: "c" + k,
      name,
      phone,
      telegram: F.telegram.value.trim(),
      instagram: F.instagram.value.trim(),
      sizes: { shoe: F.shoe.value.trim(), cloth: F.cloth.value.trim() },
      brands: F.brands.value.trim(),
      tags: F.tags.value.split(",").map((t) => t.trim()).filter(Boolean),
      source: F.source.value,
      notes: F.notes.value.trim(),
      createdAt: c.createdAt || Date.now(),
    };
    try {
      const saved = await api.crm.save("clients", data);
      const i = D.clients.findIndex((x) => x.id === saved.id);
      i >= 0 ? (D.clients[i] = saved) : D.clients.unshift(saved);
      toast("Клиент сохранён");
      closePanel();
      render();
    } catch (err) {
      toast(errorText(err), "error");
    }
  });
}

/* ---------------- new deal ---------------- */
const dm = $("#dealModal");
const DF = $("#dealForm").elements;
$("#srcSel").innerHTML = Object.entries(SOURCES).filter(([k]) => k !== "site").map(([k, t]) => `<option value="${k}">${t}</option>`).join("");
function openNewDeal(prefill = {}) {
  $("#dealForm").reset();
  $("#dmErr").textContent = "";
  $("#clientList").innerHTML = clients().map((c) => `<option value="${esc(c.name)}">${esc(c.phone)}</option>`).join("");
  $("#prodSel").innerHTML = D.products.map((p) => `<option value="${esc(p.id)}">${esc(p.brand)} ${esc(p.name)} — ${lei(p.price)} лей</option>`).join("") || `<option value="">Сначала добавьте товары в админке</option>`;
  DF.cname.value = prefill.name || "";
  DF.cphone.value = prefill.phone || "";
  syncKind();
  syncProduct();
  dm.showModal();
}
function syncKind() {
  const k = DF.kind.value;
  $$("[data-k]", dm).forEach((x) => (x.hidden = x.dataset.k !== k));
}
function syncProduct() {
  const p = D.products.find((x) => x.id === DF.product.value);
  $("#sizeSel").innerHTML = (p?.sizes || [])
    .map((s) => {
      const q = p.stockQty?.[s];
      return `<option value="${esc(s)}"${q === 0 ? " disabled" : ""}>${esc(s)}${q != null ? ` — ${q} шт.` : ""}</option>`;
    })
    .join("");
  DF.pprice.value = p?.price || "";
}
DF.cname.addEventListener("change", () => {
  const c = clients().find((x) => x.name === DF.cname.value);
  if (c && !DF.cphone.value) DF.cphone.value = c.phone;
});
$("#dealForm").addEventListener("change", (e) => {
  if (e.target.name === "kind") syncKind();
  if (e.target.name === "product") syncProduct();
});
dm.addEventListener("click", (e) => (e.target === dm || e.target.closest("[data-close]")) && dm.close());
$("#dealForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const kind = DF.kind.value;
  const name = DF.cname.value.trim(), phone = DF.cphone.value.trim();
  const err = (t) => ($("#dmErr").textContent = t);
  if (!name || phoneKey(phone).length < 6) return err("Укажите имя и телефон клиента");
  const btn = $("#dmSave");
  btn.classList.add("loading");
  try {
    const base = { contact: { name, phone, via: DF.source.value }, comment: DF.comment.value.trim(), source: DF.source.value, consentAt: null };
    if (kind === "request") {
      if (DF.title.value.trim().length < 2) throw new Error("Опишите, что ищет клиент");
      const r = await api.requests.create({ ...base, number: "Z-" + Date.now().toString(36).slice(-5).toUpperCase(), title: DF.title.value.trim(), size: DF.size.value.trim(), qty: 1, price: Math.round(+DF.price.value) || 0, photos: [], link: "" }, { manual: true });
      D.requests.unshift(r);
    } else {
      const p = D.products.find((x) => x.id === DF.product.value);
      if (!p || !DF.psize.value) throw new Error("Выберите товар и размер");
      const price = Math.round(+DF.pprice.value) || p.price;
      const o = await api.orders.create(
        { ...base, number: "BS-" + Date.now().toString(36).slice(-6).toUpperCase(), items: [{ id: p.id, brand: p.brand, name: p.name, size: DF.psize.value, qty: 1, price, stock: "stock", thumb: p.thumbs?.[0] || "" }], total: price, delivery: { type: "meet", city: "", address: "" }, messenger: DF.source.value },
        { manual: true }
      );
      D.orders.unshift(o);
    }
    dm.close();
    toast("Сделка создана");
    if (S.view !== "deals") location.hash = "deals";
    S.pipe = kind;
    render();
  } catch (ex) {
    err(errorText(ex));
  }
  btn.classList.remove("loading");
});

/* ---------------- global events ---------------- */
document.addEventListener("click", async (e) => {
  const t = e.target;
  const deal = t.closest("[data-deal]");
  if (deal && !deal.classList.contains("dragging")) {
    const [k, id] = deal.dataset.deal.split(":");
    return openDeal(k, id);
  }
  const cl = t.closest("[data-client]");
  if (cl) return openClient(cl.dataset.client);
  if (t.closest("[data-newclient]")) return openClient("");
  if (t.closest("#newDeal")) return openNewDeal();
  const df = t.closest("[data-dealfor]");
  if (df) {
    const [phone, name] = df.dataset.dealfor.split("|");
    closePanel();
    return openNewDeal({ phone, name });
  }
  const at = t.closest("[data-addtask]");
  if (at) {
    const [phone, num] = at.dataset.addtask.split("|");
    await saveTask({ type: "call", title: `Связаться по ${num}`, due: Date.now() + 36e5, phone });
    return badges();
  }
  const pp = t.closest("[data-pipe]");
  if (pp) return (S.pipe = pp.dataset.pipe), render();
  if (t.closest("[data-closed]")) return (S.showClosed = !S.showClosed), render();
  const del = t.closest("[data-tdel]");
  if (del) {
    await api.crm.remove("tasks", del.dataset.tdel).catch((err) => toast(errorText(err), "error"));
    D.tasks = D.tasks.filter((x) => x.id !== del.dataset.tdel);
    return render();
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.matches("tr[data-client]")) openClient(e.target.dataset.client);
});
document.addEventListener("change", async (e) => {
  const id = e.target.dataset?.tdone;
  if (!id) return;
  const t = D.tasks.find((x) => x.id === id);
  await saveTask({ ...t, done: e.target.checked });
  render();
});
let qt;
$("#q").addEventListener("input", (e) => {
  clearTimeout(qt);
  qt = setTimeout(() => {
    S.q = e.target.value.trim();
    if (S.view === "today" && S.q) location.hash = "clients";
    else render();
  }, 200);
});
addEventListener("hashchange", route);

/* ---------------- guard & start ---------------- */
// photo viewer (same as site)
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-zoom]");
  if (!b) return;
  const d = document.createElement("dialog");
  d.className = "lightbox";
  d.innerHTML = `<img src="${b.querySelector("img").src}" alt=""><button class="ic-btn" aria-label="Закрыть">${icon.close}</button>`;
  document.body.appendChild(d);
  d.addEventListener("click", () => d.close());
  d.addEventListener("close", () => d.remove());
  d.showModal();
});

/* ---------------- вход по паролю ---------------- */
const PASS_KEY = "bine-crm-ok";
async function sha(text) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("bine-crm:" + text));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
const demoUnlocked = () => {
  try {
    return localStorage.getItem(PASS_KEY) === CRM_PASS_HASH;
  } catch {
    return false;
  }
};

function showGate(msg = "") {
  started = false;
  const guard = $("#guard");
  guard.hidden = false;
  guard.innerHTML = `<form class="box" id="gate" novalidate>
      <img src="assets/logo.jpg" alt="" width="72" height="72">
      <h1>Bine CRM</h1>
      <p class="muted">Введите пароль</p>
      <span class="pass-wrap" style="display:block;margin-top:18px"><input class="input" id="gatePass" type="password" autocomplete="current-password" aria-label="Пароль" required>
        <button type="button" class="ic-btn" id="gateEye" aria-label="Показать пароль">${icon.eye}</button></span>
      <p class="form-err" id="gateErr" role="alert" style="margin:10px 0">${esc(msg)}</p>
      <button class="btn btn-chrome btn-block" id="gateBtn">Войти</button>
    </form>`;
  const inp = $("#gatePass");
  setTimeout(() => inp.focus(), 50);
  $("#gateEye").addEventListener("click", () => (inp.type = inp.type === "password" ? "text" : "password"));
  $("#gate").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pass = inp.value;
    if (!pass) return inp.focus();
    const btn = $("#gateBtn");
    btn.classList.add("loading");
    try {
      if (api.mode === "demo") {
        if ((await sha(pass)) !== CRM_PASS_HASH) throw Object.assign(new Error(), { code: "auth/invalid-credential" });
        localStorage.setItem(PASS_KEY, CRM_PASS_HASH);
        start();
      } else {
        await api.auth.signIn(CRM_EMAIL, pass); // дальше сработает onChange
      }
    } catch (err) {
      btn.classList.remove("loading");
      $("#gateErr").textContent = err?.code === "auth/invalid-credential" || err?.code === "auth/wrong-password" ? "Неверный пароль" : errorText(err);
      inp.select();
    }
  });
}

let started = false;
async function start() {
  $("#guard").hidden = true;
  if (started) return;
  started = true;
  $("#demoNote").hidden = api.mode !== "demo";
  view.innerHTML = `<div class="kpis">${'<div class="kpi sk" style="height:96px"></div>'.repeat(4)}</div>`;
  await load();
  route();
}

$("#shopLink").href = SHOP.url;
$("#logout").addEventListener("click", async () => {
  try {
    localStorage.removeItem(PASS_KEY);
  } catch {}
  if (api.mode !== "demo") await api.auth.signOut();
  showGate();
});

if (api.mode === "demo") {
  demoUnlocked() ? start() : showGate();
} else {
  api.auth.onChange((u) => {
    if (u?.isAdmin) return start();
    if (u) {
      api.auth.signOut();
      return showGate("У этого аккаунта нет прав администратора. Проверьте документ admins/{uid} в Firestore.");
    }
    showGate();
  });
}

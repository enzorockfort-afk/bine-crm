/* Демо-бэкенд: всё хранится в IndexedDB этого браузера. */
import { DEMO_ADMIN } from "../config.js";
import { SEED } from "../seed.js";

const DB = "binestore-demo";
let dbp;
function open() {
  dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function get(key, fallback) {
  const db = await open();
  return new Promise((res) => {
    const r = db.transaction("kv").objectStore("kv").get(key);
    r.onsuccess = () => res(r.result ?? fallback);
    r.onerror = () => res(fallback);
  });
}
async function set(key, val) {
  const db = await open();
  return new Promise((res, rej) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").put(val, key);
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
  });
}
async function del(key) {
  const db = await open();
  return new Promise((res) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").delete(key);
    tx.oncomplete = res;
  });
}

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
async function hash(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("bine:" + s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
const err = (code, message) => Object.assign(new Error(message), { code });
async function patchIn(key, id, patch) {
  const list = await get(key, []);
  const x = list.find((o) => o.id === id);
  if (x) Object.assign(x, patch);
  await set(key, list);
  return x;
}

async function boot() {
  if (await get("booted")) return;
  await set("products", SEED.map((p) => ({ ...p, id: uid() })));
  await set("users", [
    { uid: "admin", email: DEMO_ADMIN.email, pass: await hash(DEMO_ADMIN.password), isAdmin: true, profile: { name: DEMO_ADMIN.name } },
  ]);
  await set("orders", []);
  await set("booted", true);
}

const listeners = new Set();
let current = null;
const SESSION = "binestore-session";
const pub = (u) => (u ? { uid: u.uid, email: u.email, name: u.profile?.name || "", isAdmin: !!u.isAdmin } : null);
function emit() {
  listeners.forEach((cb) => cb(current));
}

export async function createLocal() {
  await boot();
  const sid = localStorage.getItem(SESSION);
  if (sid) current = pub((await get("users", [])).find((u) => u.uid === sid));

  return {
    mode: "demo",
    auth: {
      current: () => current,
      onChange(cb) {
        listeners.add(cb);
        cb(current);
        return () => listeners.delete(cb);
      },
      async signUp(email, password, name) {
        email = email.trim().toLowerCase();
        const users = await get("users", []);
        if (users.some((u) => u.email === email)) throw err("auth/email-already-in-use");
        const u = { uid: uid(), email, pass: await hash(password), isAdmin: false, profile: { name } };
        users.push(u);
        await set("users", users);
        localStorage.setItem(SESSION, u.uid);
        current = pub(u);
        emit();
        return current;
      },
      async signIn(email, password) {
        email = email.trim().toLowerCase();
        const u = (await get("users", [])).find((x) => x.email === email);
        if (!u || u.pass !== (await hash(password))) throw err("auth/invalid-credential");
        localStorage.setItem(SESSION, u.uid);
        current = pub(u);
        emit();
        return current;
      },
      async signOut() {
        localStorage.removeItem(SESSION);
        current = null;
        emit();
      },
      async deleteAccount() {
        if (!current) return;
        if (current.isAdmin) throw err("demo", "Демо-администратора удалить нельзя");
        await set("users", (await get("users", [])).filter((u) => u.uid !== current.uid));
        localStorage.removeItem(SESSION);
        current = null;
        emit();
      },
      async resetPassword() {
        throw err("demo", "В демо-режиме восстановление пароля недоступно");
      },
    },

    profile: {
      async get() {
        if (!current) return null;
        return (await get("users", [])).find((u) => u.uid === current.uid)?.profile || {};
      },
      async save(data) {
        const users = await get("users", []);
        const u = users.find((x) => x.uid === current.uid);
        const nameChanged = data.name !== undefined && data.name !== u.profile?.name;
        u.profile = { ...u.profile, ...data };
        await set("users", users);
        current = pub(u);
        if (nameChanged) emit();
      },
    },

    products: {
      async list({ all = false } = {}) {
        const list = await get("products", []);
        return all ? list : list.filter((p) => p.published);
      },
      async get(id) {
        const p = (await get("products", [])).find((x) => x.id === id);
        if (!p || (!p.published && !current?.isAdmin)) return null;
        return p;
      },
      async images(id) {
        return get("images:" + id, []);
      },
      async save(product, images) {
        const list = await get("products", []);
        const id = product.id || uid();
        const data = { ...product, id, updatedAt: Date.now(), createdAt: product.createdAt || Date.now() };
        if (images) {
          data.thumbs = images.slice(0, 2).map((i) => i.thumb);
          data.imgCount = images.length;
          await set("images:" + id, images.map((i) => i.full));
        }
        const i = list.findIndex((x) => x.id === id);
        i >= 0 ? (list[i] = data) : list.unshift(data);
        await set("products", list);
        return id;
      },
      async remove(id) {
        await set("products", (await get("products", [])).filter((p) => p.id !== id));
        await del("images:" + id);
      },
    },

    requests: {
      async create(req, { manual = false } = {}) {
        const list = await get("requests", []);
        const r = { ...req, id: uid(), uid: manual ? null : current?.uid || null, status: "new", createdAt: Date.now() };
        list.unshift(r);
        await set("requests", list);
        return r;
      },
      async mine() {
        if (!current) return [];
        return (await get("requests", [])).filter((r) => r.uid === current.uid);
      },
      async all() {
        return get("requests", []);
      },
      async setStatus(id, status) {
        const list = await get("requests", []);
        const r = list.find((x) => x.id === id);
        if (r) r.status = status;
        await set("requests", list);
      },
      update: (id, patch) => patchIn("requests", id, patch),
    },

    orders: {
      async create(order, { manual = false } = {}) {
        const orders = await get("orders", []);
        const o = { ...order, id: uid(), uid: manual ? null : current?.uid || null, status: "new", createdAt: Date.now() };
        orders.unshift(o);
        await set("orders", orders);
        return o;
      },
      async mine() {
        if (!current) return [];
        return (await get("orders", [])).filter((o) => o.uid === current.uid);
      },
      async all() {
        return get("orders", []);
      },
      async setStatus(id, status) {
        const orders = await get("orders", []);
        const o = orders.find((x) => x.id === id);
        if (o) o.status = status;
        await set("orders", orders);
      },
      update: (id, patch) => patchIn("orders", id, patch),
    },

    /* CRM-коллекции: clients, tasks */
    crm: {
      list: (col) => get(col, []),
      async save(col, data) {
        const list = await get(col, []);
        const doc = { ...data, id: data.id || uid(), updatedAt: Date.now() };
        doc.createdAt ||= Date.now();
        const i = list.findIndex((x) => x.id === doc.id);
        i >= 0 ? (list[i] = doc) : list.unshift(doc);
        await set(col, list);
        return doc;
      },
      async remove(col, id) {
        await set(col, (await get(col, [])).filter((x) => x.id !== id));
      },
    },
  };
}

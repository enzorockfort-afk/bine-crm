/* Боевой бэкенд: Firebase Auth + Firestore (бесплатный тариф Spark).
   Фото хранятся в Firestore в сжатом виде — Cloud Storage не нужен. */
const V = "10.12.2";
const CDN = `https://www.gstatic.com/firebasejs/${V}`;

export async function createFirebase(config) {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(`${CDN}/firebase-app.js`),
    import(`${CDN}/firebase-auth.js`),
    import(`${CDN}/firebase-firestore.js`),
  ]);
  const app = initializeApp(config);
  const auth = A.getAuth(app);
  const db = F.getFirestore(app);
  const { doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, query, where, serverTimestamp } = F;

  const ms = (t) => (t?.toMillis ? t.toMillis() : t || Date.now());
  const withId = (s) => ({ ...s.data(), id: s.id });

  let current = null;
  const listeners = new Set();
  async function toUser(fu) {
    if (!fu) return null;
    const [adm, prof] = await Promise.all([
      getDoc(doc(db, "admins", fu.uid)).catch(() => null),
      getDoc(doc(db, "users", fu.uid)).catch(() => null),
    ]);
    return {
      uid: fu.uid,
      email: fu.email,
      name: prof?.data()?.name || fu.displayName || "",
      isAdmin: !!adm?.exists(),
    };
  }
  await new Promise((resolve) => {
    let first = true;
    A.onAuthStateChanged(auth, async (fu) => {
      current = await toUser(fu);
      listeners.forEach((cb) => cb(current));
      if (first) (first = false), resolve();
    });
  });

  return {
    mode: "firebase",
    auth: {
      current: () => current,
      onChange(cb) {
        listeners.add(cb);
        cb(current);
        return () => listeners.delete(cb);
      },
      async signUp(email, password, name) {
        const c = await A.createUserWithEmailAndPassword(auth, email.trim(), password);
        await A.updateProfile(c.user, { displayName: name });
        await setDoc(doc(db, "users", c.user.uid), { name, email: c.user.email, createdAt: serverTimestamp() }, { merge: true });
        current = await toUser(c.user);
        listeners.forEach((cb) => cb(current));
        return current;
      },
      async signIn(email, password) {
        const c = await A.signInWithEmailAndPassword(auth, email.trim(), password);
        return toUser(c.user);
      },
      signOut: () => A.signOut(auth),
      resetPassword: (email) => A.sendPasswordResetEmail(auth, email.trim()),
      async deleteAccount() {
        const u = auth.currentUser;
        if (!u) return;
        const ref = doc(db, "users", u.uid);
        const backup = (await getDoc(ref)).data();
        await deleteDoc(ref);
        try {
          await A.deleteUser(u);
        } catch (e) {
          if (backup) await setDoc(ref, backup); // e.g. auth/requires-recent-login
          throw e;
        }
      },
    },

    profile: {
      async get() {
        if (!current) return null;
        const s = await getDoc(doc(db, "users", current.uid));
        return s.exists() ? s.data() : {};
      },
      async save(data) {
        await setDoc(doc(db, "users", current.uid), data, { merge: true });
        if (data.name && data.name !== current.name) {
          current = { ...current, name: data.name };
          listeners.forEach((cb) => cb(current));
        }
      },
    },

    products: {
      async list({ all = false } = {}) {
        const col = collection(db, "products");
        const snap = await getDocs(all ? col : query(col, where("published", "==", true)));
        return snap.docs.map(withId).map((p) => ({ ...p, createdAt: ms(p.createdAt) }));
      },
      async get(id) {
        try {
          const s = await getDoc(doc(db, "products", id));
          return s.exists() ? { ...withId(s), createdAt: ms(s.data().createdAt) } : null;
        } catch {
          return null;
        }
      },
      async images(id) {
        const snap = await getDocs(collection(db, "products", id, "images"));
        return snap.docs.map((d) => d.data()).sort((a, b) => a.i - b.i).map((d) => d.data);
      },
      async save(product, images) {
        const { id, ...data } = product;
        const ref = id ? doc(db, "products", id) : doc(collection(db, "products"));
        data.updatedAt = Date.now();
        data.createdAt = data.createdAt || Date.now();
        if (images) {
          data.thumbs = images.slice(0, 2).map((i) => i.thumb);
          data.imgCount = images.length;
        }
        await setDoc(ref, data);
        if (images) {
          const old = await getDocs(collection(db, "products", ref.id, "images"));
          await Promise.all(old.docs.filter((d) => +d.id >= images.length).map((d) => deleteDoc(d.ref)));
          for (let i = 0; i < images.length; i++) {
            await setDoc(doc(db, "products", ref.id, "images", String(i)), { i, data: images[i].full });
          }
        }
        return ref.id;
      },
      async remove(id) {
        const imgs = await getDocs(collection(db, "products", id, "images"));
        await Promise.all(imgs.docs.map((d) => deleteDoc(d.ref)));
        await deleteDoc(doc(db, "products", id));
      },
    },

    requests: {
      async create(req, { manual = false } = {}) {
        const data = { ...req, uid: manual ? null : current?.uid || null, status: "new", createdAt: Date.now() };
        const ref = await addDoc(collection(db, "requests"), data);
        return { ...data, id: ref.id };
      },
      async mine() {
        if (!current) return [];
        const snap = await getDocs(query(collection(db, "requests"), where("uid", "==", current.uid)));
        return snap.docs.map(withId).sort((a, b) => b.createdAt - a.createdAt);
      },
      async all() {
        const snap = await getDocs(collection(db, "requests"));
        return snap.docs.map(withId).sort((a, b) => b.createdAt - a.createdAt);
      },
      async setStatus(id, status) {
        await updateDoc(doc(db, "requests", id), { status });
      },
      update: (id, patch) => updateDoc(doc(db, "requests", id), patch),
    },

    orders: {
      async create(order, { manual = false } = {}) {
        const data = { ...order, uid: manual ? null : current?.uid || null, status: "new", createdAt: Date.now() };
        const ref = await addDoc(collection(db, "orders"), data);
        return { ...data, id: ref.id };
      },
      async mine() {
        if (!current) return [];
        const snap = await getDocs(query(collection(db, "orders"), where("uid", "==", current.uid)));
        return snap.docs.map(withId).sort((a, b) => b.createdAt - a.createdAt);
      },
      async all() {
        const snap = await getDocs(collection(db, "orders"));
        return snap.docs.map(withId).sort((a, b) => b.createdAt - a.createdAt);
      },
      async setStatus(id, status) {
        await updateDoc(doc(db, "orders", id), { status });
      },
      update: (id, patch) => updateDoc(doc(db, "orders", id), patch),
    },

    /* CRM-коллекции: clients, tasks (только для админа) */
    crm: {
      async list(col) {
        const snap = await getDocs(collection(db, col));
        return snap.docs.map(withId);
      },
      async save(col, data) {
        const { id, ...rest } = data;
        rest.updatedAt = Date.now();
        rest.createdAt ||= Date.now();
        const ref = id ? doc(db, col, id) : doc(collection(db, col));
        await setDoc(ref, rest);
        return { ...rest, id: ref.id };
      },
      remove: (col, id) => deleteDoc(doc(db, col, id)),
    },
  };
}

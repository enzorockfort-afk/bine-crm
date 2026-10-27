/* Демо-товары. В админке их можно импортировать одной кнопкой. */
const d = (n) => Date.now() - n * 864e5;

export const SEED = [
  { brand: "Nike", name: "Air Force 1 '07 White", cat: "Обувь", price: 1890, oldPrice: 2300, stock: "stock", sizes: ["40", "41", "42", "43", "44"], featured: true, createdAt: d(1) },
  { brand: "Jordan", name: "Air Jordan 4 Retro Military Black", cat: "Обувь", price: 3490, stock: "stock", sizes: ["40", "41", "42", "43", "44", "45"], featured: true, createdAt: d(2) },
  { brand: "New Balance", name: "550 White Green", cat: "Обувь", price: 2190, stock: "stock", sizes: ["38", "39", "40", "41", "42"], createdAt: d(3) },
  { brand: "Adidas", name: "Samba OG Cloud White", cat: "Обувь", price: 1990, stock: "stock", sizes: ["37", "38", "39", "40", "41", "42", "43"], createdAt: d(4) },
  { brand: "Stone Island", name: "Худи с компас-патчем", cat: "Одежда", price: 2790, stock: "stock", sizes: ["S", "M", "L", "XL"], featured: true, createdAt: d(5) },
  { brand: "Essentials", name: "Fear of God Hoodie", cat: "Одежда", price: 1690, stock: "stock", sizes: ["XS", "S", "M", "L", "XL"], createdAt: d(6) },
  { brand: "The North Face", name: "Nuptse 1996 Puffer", cat: "Одежда", price: 3990, oldPrice: 4500, stock: "stock", sizes: ["S", "M", "L", "XL"], createdAt: d(7) },
  { brand: "Moncler", name: "Maya Down Jacket", cat: "Одежда", price: 6490, stock: "stock", sizes: ["S", "M", "L", "XL", "XXL"], createdAt: d(8) },
  { brand: "Louis Vuitton", name: "Avenue Sling Bag", cat: "Сумки", price: 2990, stock: "stock", sizes: ["One size"], createdAt: d(9) },
  { brand: "Prada", name: "Re-Nylon Shoulder Bag", cat: "Сумки", price: 2490, stock: "stock", sizes: ["One size"], createdAt: d(10) },
  { brand: "Balenciaga", name: "Logo Cap", cat: "Аксессуары", price: 1190, stock: "stock", sizes: ["One size"], createdAt: d(11) },
  { brand: "Chrome Hearts", name: "Cross Ring Silver", cat: "Аксессуары", price: 1590, stock: "stock", sizes: ["16", "17", "18", "19"], createdAt: d(12) },
].map((p) => ({ desc: "", published: true, featured: false, oldPrice: 0, thumbs: [], imgCount: 0, ...p }));

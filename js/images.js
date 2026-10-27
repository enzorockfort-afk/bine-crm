/* Сжатие фото в браузере: WebP (или JPEG, если WebP не поддерживается). */
function loadImg(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("Не удалось прочитать изображение"));
    img.src = src;
  });
}

export async function compress(src, max, q) {
  const img = await loadImg(src);
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * k);
  c.height = Math.round(img.naturalHeight * k);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  let out = c.toDataURL("image/webp", q);
  if (!out.startsWith("data:image/webp")) out = c.toDataURL("image/jpeg", q);
  return out;
}

export async function compressFile(file, max, q) {
  const url = URL.createObjectURL(file);
  try {
    return await compress(url, max, q);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const isImageFile = (f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name);

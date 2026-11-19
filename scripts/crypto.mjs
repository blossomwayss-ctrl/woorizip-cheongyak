// 앱 데이터 암호화 (AES-256-GCM, 비밀번호 → PBKDF2-SHA256 600,000회)
// 브라우저(site/app.js)의 복호화 코드와 같은 방식이어야 함.
const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
export const ITER = 600000;

const b64 = (buf) => Buffer.from(buf).toString('base64');
const unb64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));

export async function saltFor(appSalt = '') {
  const h = await subtle.digest('SHA-256', enc.encode(`woorizip-cheongyak|${appSalt}`));
  return new Uint8Array(h).slice(0, 16);
}

async function keyFrom(password, salt) {
  const base = await subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptJSON(obj, password, appSalt = '') {
  const salt = await saltFor(appSalt);
  const key = await keyFrom(password, salt);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { v: 1, kdf: 'PBKDF2-SHA256', iter: ITER, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
}

export async function decryptJSON(box, password) {
  const key = await keyFrom(password, unb64(box.salt));
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}

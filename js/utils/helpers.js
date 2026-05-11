import { APP } from "../core/config.js";

export function normName(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

export function isIgnoredIngredient(name) {
  const n = normName(name);
  return APP.IGNORE_INGREDIENTS.some(x => normName(x) === n);
}

export function placeholderDataUri(label) {
  const safe = String(label || "")
    .slice(0, 28)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;");

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100">
      <defs>
        <linearGradient id="g" x1="0" x2="1">
          <stop offset="0" stop-color="#111827"/>
          <stop offset="1" stop-color="#374151"/>
        </linearGradient>
      </defs>
      <rect width="160" height="100" rx="16" fill="url(#g)"/>
      <text x="80" y="56" font-family="system-ui, -apple-system, Segoe UI, Roboto"
            font-size="14" fill="#fff" text-anchor="middle">${safe}</text>
    </svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

export function imgPathById(id) {
  return `img/${encodeURIComponent(id)}.${APP.IMG_EXT}`;
}

export async function compressStringToBase64(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(String(str || ""));

  // Wenn CompressionStream verfügbar ist, gzip nutzen
  if (typeof CompressionStream !== 'undefined') {
    try {
      const cs = new CompressionStream('gzip');
      const writer = cs.writable.getWriter();
      await writer.write(data);
      await writer.close();
      const compressed = await new Response(cs.readable).arrayBuffer();
      const uint8 = new Uint8Array(compressed);
      // base64
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < uint8.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, uint8.subarray(i, i + chunkSize));
      }
      return btoa(binary);
    } catch (e) {
      console.warn('compressStringToBase64: Compression failed, falling back to plain base64', e);
    }
  }

  // Fallback: base64 of UTF-8
  const utf8 = unescape(encodeURIComponent(String(str || "")));
  return btoa(utf8);
}

export async function decompressBase64ToString(b64) {
  if (!b64) return "";

  // base64 -> Uint8Array
  const binary = atob(String(b64));
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);

  // Wenn DecompressionStream verfügbar ist, versuchen zu entpacken
  if (typeof DecompressionStream !== 'undefined') {
    try {
      const ds = new DecompressionStream('gzip');
      const stream = new Response(bytes).body.pipeThrough(ds);
      const ab = await new Response(stream).arrayBuffer();
      const decoder = new TextDecoder();
      return decoder.decode(ab);
    } catch (e) {
      // Falls Entpacken fehlschlägt, versuchen wir, die Bytes als UTF-8 direkt zu decodieren
      console.warn('decompressBase64ToString: Decompression failed, trying direct UTF-8 decode', e);
    }
  }

  // Fallback: interpret as UTF-8 plain
  try {
    const utf8 = binary;
    return decodeURIComponent(escape(utf8));
  } catch (e) {
    console.warn('decompressBase64ToString: UTF-8 decode failed', e);
    return "";
  }
}

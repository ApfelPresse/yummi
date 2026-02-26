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

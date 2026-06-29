export function toDateKey(date) {
  return date.toISOString().slice(0, 10);
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function formatDate(key, locales = undefined) {
  return new Date(`${key}T12:00:00`).toLocaleDateString(locales, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function upsertEntry(entries, date, note = "") {
  const trimmedNote = String(note).trim();
  return entries.filter((entry) => entry.date !== date).concat({ date, note: trimmedNote });
}

export function toggleEntry(entries, date) {
  const existing = entries.find((entry) => entry.date === date);
  return existing ? entries.filter((entry) => entry.date !== date) : upsertEntry(entries, date);
}

export function sortEntries(entries) {
  return [...entries].sort((a, b) => a.date.localeCompare(b.date));
}

export function pack(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function unpack(text) {
  const normalized = text.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(text.length / 4) * 4, "=");
  return Uint8Array.from(atob(normalized), (char) => char.charCodeAt(0));
}

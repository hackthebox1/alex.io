const STORAGE_KEY = "alex-dan-climbing-calendar";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

let password = "";
let entries = [];
let visibleMonth = new Date();

const $ = (selector) => document.querySelector(selector);
const unlockCard = $("#unlock-card");
const app = $("#app");
const unlockStatus = $("#unlock-status");
const saveStatus = $("#save-status");

function toDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(key) {
  return new Date(`${key}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

async function deriveKey(secret, salt) {
  const baseKey = await crypto.subtle.importKey("raw", encoder.encode(secret), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 210000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function pack(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function unpack(text) {
  const normalized = text.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(text.length / 4) * 4, "=");
  return Uint8Array.from(atob(normalized), (char) => char.charCodeAt(0));
}

async function encryptData(data, secret) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(secret, salt);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(JSON.stringify(data)));
  return pack(encoder.encode(JSON.stringify({ v: 1, salt: pack(salt), iv: pack(iv), cipher: pack(cipher) })));
}

async function decryptData(payload, secret) {
  const envelope = JSON.parse(decoder.decode(unpack(payload)));
  const key = await deriveKey(secret, unpack(envelope.salt));
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unpack(envelope.iv) }, key, unpack(envelope.cipher));
  return JSON.parse(decoder.decode(plain));
}

function getLinkedPayload() {
  return new URLSearchParams(location.hash.slice(1)).get("data");
}

async function loadEntries(secret) {
  const payload = getLinkedPayload() || localStorage.getItem(STORAGE_KEY);
  if (!payload) return [];
  const data = await decryptData(payload, secret);
  return Array.isArray(data.entries) ? data.entries : [];
}

function render() {
  const monthLabel = $("#month-label");
  const grid = $("#calendar-grid");
  const list = $("#date-list");
  const monthStart = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const start = new Date(monthStart);
  start.setDate(start.getDate() - start.getDay());
  monthLabel.textContent = monthStart.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  grid.innerHTML = "";

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = toDateKey(date);
    const entry = entries.find((item) => item.date === key);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `day${date.getMonth() !== visibleMonth.getMonth() ? " is-outside" : ""}${entry ? " is-selected" : ""}`;
    button.innerHTML = `<span class="day-number">${date.getDate()}</span>${entry?.note ? `<span class="day-note">${escapeHtml(entry.note)}</span>` : ""}`;
    button.addEventListener("click", () => toggleDate(key));
    grid.append(button);
  }

  list.innerHTML = "";
  [...entries].sort((a, b) => a.date.localeCompare(b.date)).forEach((entry) => {
    const item = document.createElement("li");
    item.innerHTML = `<span><strong>${formatDate(entry.date)}</strong>${entry.note ? ` — ${escapeHtml(entry.note)}` : ""}</span>`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => toggleDate(entry.date));
    item.append(remove);
    list.append(item);
  });
  if (!entries.length) list.innerHTML = "<li>No dates yet. Add one above or tap a day.</li>";
}

function toggleDate(date) {
  const existing = entries.find((entry) => entry.date === date);
  entries = existing ? entries.filter((entry) => entry.date !== date) : [...entries, { date, note: "" }];
  render();
}

$("#unlock-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  password = new FormData(event.currentTarget).get("password");
  try {
    entries = await loadEntries(password);
    unlockCard.classList.add("is-hidden");
    app.classList.remove("is-hidden");
    unlockStatus.textContent = "";
    render();
  } catch {
    unlockStatus.textContent = "That password could not decrypt the saved calendar.";
  }
});

$("#date-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const date = form.get("climbDate");
  const note = form.get("climbNote").trim();
  entries = entries.filter((entry) => entry.date !== date).concat({ date, note });
  event.currentTarget.reset();
  visibleMonth = new Date(`${date}T12:00:00`);
  render();
});

$("#prev-month").addEventListener("click", () => { visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1); render(); });
$("#next-month").addEventListener("click", () => { visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1); render(); });
$("#lock-button").addEventListener("click", () => location.reload());
$("#save-button").addEventListener("click", async () => {
  localStorage.setItem(STORAGE_KEY, await encryptData({ entries }, password));
  saveStatus.textContent = "Saved encrypted calendar in this browser.";
});
$("#share-button").addEventListener("click", async () => {
  const payload = await encryptData({ entries }, password);
  const url = `${location.origin}${location.pathname}#data=${payload}`;
  $("#share-url").value = url;
  await navigator.clipboard?.writeText(url).catch(() => {});
  saveStatus.textContent = "Encrypted link created. Share the password through a different channel.";
});

$("#climb-date").value = toDateKey(new Date());

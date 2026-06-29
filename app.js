import { escapeHtml, formatDate, pack, sortEntries, toDateKey, toggleEntry, unpack, upsertEntry } from "./calendar-utils.js";

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
const debugLog = $("#debug-log");

function describeError(error) {
  if (!error) return "Unknown error";
  return `${error.name || "Error"}: ${error.message || String(error)}`;
}

function writeDebug(message, details = {}) {
  const timestamp = new Date().toISOString();
  const detailText = Object.entries(details)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
  debugLog.value += `[${timestamp}] ${message}${detailText ? ` ${detailText}` : ""}\n`;
  debugLog.scrollTop = debugLog.scrollHeight;
}

function logCapabilities() {
  writeDebug("capabilities", {
    userAgent: navigator.userAgent,
    secureContext: window.isSecureContext,
    cryptoSubtle: Boolean(crypto?.subtle),
    clipboard: Boolean(navigator.clipboard?.writeText),
    execCommand: Boolean(document.execCommand),
    localStorage: (() => {
      try {
        const key = `${STORAGE_KEY}-probe`;
        localStorage.setItem(key, "1");
        localStorage.removeItem(key);
        return true;
      } catch {
        return false;
      }
    })(),
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
  sortEntries(entries).forEach((entry) => {
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
  entries = toggleEntry(entries, date);
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
  } catch (error) {
    writeDebug("unlock failed", { error: describeError(error) });
    unlockStatus.textContent = "That password could not decrypt the saved calendar.";
  }
});

$("#date-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const date = form.get("climbDate");
  const note = form.get("climbNote").trim();
  entries = upsertEntry(entries, date, note);
  event.currentTarget.reset();
  visibleMonth = new Date(`${date}T12:00:00`);
  render();
});

$("#prev-month").addEventListener("click", () => { visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1); render(); });
$("#next-month").addEventListener("click", () => { visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1); render(); });
$("#lock-button").addEventListener("click", () => location.reload());
async function saveLocalCalendar() {
  try {
    localStorage.setItem(STORAGE_KEY, await encryptData({ entries }, password));
    saveStatus.textContent = "Saved encrypted calendar in this browser.";
  } catch (error) {
    writeDebug("local save failed", { error: describeError(error) });
    saveStatus.textContent = "This browser blocked local saving. Create an encrypted link instead.";
  }
}

async function copyShareUrl(url) {
  writeDebug("copy start", { urlLength: url.length });
  const shareField = $("#share-url");
  shareField.value = url;
  shareField.removeAttribute("hidden");
  shareField.focus();
  shareField.select();
  shareField.setSelectionRange(0, shareField.value.length);

  if (!url.includes("#data=") || url.endsWith("#data=")) {
    throw new Error("Generated share URL is missing encrypted data");
  }

  try {
    await navigator.clipboard.writeText(url);
    writeDebug("clipboard write succeeded");
    return true;
  } catch (clipboardError) {
    writeDebug("clipboard write failed", { error: describeError(clipboardError) });
    try {
      const copied = document.execCommand?.("copy") ?? false;
      writeDebug("execCommand fallback finished", { copied });
      return copied;
    } catch (fallbackError) {
      writeDebug("execCommand fallback failed", { error: describeError(fallbackError) });
      return false;
    }
  }
}

$("#copy-debug-button").addEventListener("click", async () => {
  debugLog.focus();
  debugLog.select();
  debugLog.setSelectionRange(0, debugLog.value.length);
  try {
    await navigator.clipboard.writeText(debugLog.value);
    writeDebug("debug log copied");
  } catch (error) {
    writeDebug("debug log clipboard copy failed", { error: describeError(error) });
    document.execCommand?.("copy");
  }
});

$("#save-button").addEventListener("click", saveLocalCalendar);
$("#share-button").addEventListener("click", async () => {
  try {
    const payload = await encryptData({ entries }, password);
    if (!payload) throw new Error("Encryption returned an empty payload");
    const url = `${location.origin}${location.pathname}#data=${payload}`;
    writeDebug("share url generated", { payloadLength: payload.length, urlLength: url.length, entryCount: entries.length });
    const copied = await copyShareUrl(url);
    saveStatus.textContent = copied
      ? "Encrypted link copied. Share the password through a different channel."
      : "Encrypted link created. Copy it from the text box and send the password separately.";
  } catch (error) {
    writeDebug("share link creation failed", { error: describeError(error) });
    saveStatus.textContent = "Could not create an encrypted link in this browser.";
  }
});

$("#climb-date").value = toDateKey(new Date());
logCapabilities();

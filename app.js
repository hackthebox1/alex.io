import {
  STATUS,
  acceptProposal,
  declineProposal,
  escapeHtml,
  formatDate,
  mergeEntries,
  otherUser,
  pack,
  proposalsBy,
  pruneOldAcceptedEntries,
  sortEntries,
  toDateKey,
  unpack,
  upcomingAccepted,
  upsertProposal,
} from "./calendar-utils.js";

const STORAGE_KEY = "alex-dan-climbing-calendar";
const MAX_SHARE_URL_LENGTH = 8000;
const LOGIN_TIMEOUT_MS = 15 * 60 * 1000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

let password = "";
let currentUser = "Alex";
let entries = [];
let visibleMonth = new Date();
let timeoutId;

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

function lockSession(reason = "manual") {
  writeDebug("session locked", { reason });
  password = "";
  entries = [];
  clearTimeout(timeoutId);
  app.classList.add("is-hidden");
  unlockCard.classList.remove("is-hidden");
}

function resetLoginTimeout() {
  clearTimeout(timeoutId);
  if (!app.classList.contains("is-hidden")) {
    timeoutId = setTimeout(() => lockSession("timeout"), LOGIN_TIMEOUT_MS);
  }
}

function updateMascot() {
  const mascot = $("#user-mascot");
  const isAlex = currentUser === "Alex";
  mascot.src = isAlex ? "assets/mascots/goose-512.webp" : "assets/mascots/rat-512.webp";
  mascot.alt = isAlex ? "Goose climbing mascot for Alex" : "Rat climbing mascot for Dan";
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

async function readPayload(payload, secret) {
  if (!payload) return [];
  const data = await decryptData(payload, secret);
  return Array.isArray(data.entries) ? data.entries : [];
}

async function loadEntries(secret, user) {
  const localEntries = await readPayload(localStorage.getItem(STORAGE_KEY), secret).catch((error) => {
    writeDebug("local load failed", { error: describeError(error) });
    return [];
  });
  const linkedEntries = await readPayload(getLinkedPayload(), secret).catch((error) => {
    writeDebug("linked load failed", { error: describeError(error) });
    throw error;
  });
  const merged = mergeEntries(localEntries, linkedEntries, user);
  writeDebug("entries merged", { local: localEntries.length, linked: linkedEntries.length, merged: merged.length, user });
  return merged;
}

function setEmptyList(list, message) {
  list.innerHTML = `<li>${message}</li>`;
}

function renderEntryList(list, items, emptyMessage, actions = () => []) {
  list.innerHTML = "";
  if (!items.length) {
    setEmptyList(list, emptyMessage);
    return;
  }
  for (const entry of items) {
    const item = document.createElement("li");
    item.innerHTML = `<span><strong>${formatDate(entry.date)}</strong>${entry.note ? ` — ${escapeHtml(entry.note)}` : ""}<br><small>${entry.status} by ${escapeHtml(entry.proposedBy)}${entry.acceptedBy ? `, accepted by ${escapeHtml(entry.acceptedBy)}` : ""}</small></span>`;
    for (const action of actions(entry)) item.append(action);
    list.append(item);
  }
}

function makeAction(label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function render() {
  const monthLabel = $("#month-label");
  const grid = $("#calendar-grid");
  const monthStart = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const start = new Date(monthStart);
  start.setDate(start.getDate() - start.getDay());
  monthLabel.textContent = monthStart.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  grid.innerHTML = "";
  updateMascot();
  $("#user-context").textContent = `${currentUser}, propose dates to climb with ${otherUser(currentUser)}. Accepted dates are shared wins for both of you.`;
  $("#incoming-title").textContent = `Proposals from ${otherUser(currentUser)}`;

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = toDateKey(date);
    const entry = entries.find((item) => item.date === key);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `day${date.getMonth() !== visibleMonth.getMonth() ? " is-outside" : ""}${entry ? ` is-selected is-${entry.status}` : ""}`;
    button.innerHTML = `<span class="day-number">${date.getDate()}</span>${entry ? `<span class="day-note">${entry.status === STATUS.ACCEPTED ? "Accepted" : `Proposed by ${escapeHtml(entry.proposedBy)}`}</span>` : ""}`;
    button.addEventListener("click", () => proposeDate(key));
    grid.append(button);
  }

  renderEntryList(
    $("#accepted-list"),
    upcomingAccepted(entries),
    "No upcoming accepted dates yet.",
  );
  renderEntryList(
    $("#your-proposals-list"),
    proposalsBy(entries, currentUser),
    "You have not proposed any dates yet.",
    (entry) => [makeAction("Remove", "remove", () => removeDate(entry.date))],
  );
  renderEntryList(
    $("#incoming-proposals-list"),
    proposalsBy(entries, otherUser(currentUser)),
    `No proposals from ${otherUser(currentUser)} right now.`,
    (entry) => [
      makeAction("Acceptable", "accept", () => acceptDate(entry.date)),
      makeAction("Not acceptable", "remove", () => removeDate(entry.date)),
    ],
  );
}

function proposeDate(date) {
  const existing = entries.find((entry) => entry.date === date);
  if (existing?.status === STATUS.ACCEPTED) return;
  entries = upsertProposal(entries, date, existing?.note || "", currentUser);
  render();
}

function removeDate(date) {
  entries = declineProposal(entries, date);
  render();
}

function acceptDate(date) {
  entries = acceptProposal(entries, date, currentUser);
  render();
}

async function createShareUrl() {
  let shareEntries = sortEntries(entries);
  let pruned = 0;
  while (true) {
    const payload = await encryptData({ entries: shareEntries }, password);
    if (!payload) throw new Error("Encryption returned an empty payload");
    const url = `${location.origin}${location.pathname}#data=${payload}`;
    if (url.length <= MAX_SHARE_URL_LENGTH) return { url, payload, pruned };
    const nextEntries = pruneOldAcceptedEntries(shareEntries);
    if (nextEntries.length === shareEntries.length) return { url, payload, pruned };
    shareEntries = nextEntries;
    pruned += 1;
  }
}

$("#unlock-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  password = form.get("password");
  currentUser = form.get("currentUser");
  try {
    entries = await loadEntries(password, currentUser);
    unlockCard.classList.add("is-hidden");
    app.classList.remove("is-hidden");
    unlockStatus.textContent = "";
    resetLoginTimeout();
    render();
  } catch (error) {
    writeDebug("unlock failed", { error: describeError(error) });
    unlockStatus.textContent = "That password could not decrypt the linked calendar.";
  }
});

$("#date-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const date = form.get("climbDate");
  const note = form.get("climbNote").trim();
  entries = upsertProposal(entries, date, note, currentUser);
  event.currentTarget.reset();
  visibleMonth = new Date(`${date}T12:00:00`);
  render();
});

$("#prev-month").addEventListener("click", () => { visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1); render(); });
$("#next-month").addEventListener("click", () => { visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1); render(); });
$("#lock-button").addEventListener("click", () => lockSession("manual"));
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

for (const eventName of ["click", "keydown", "touchstart"]) {
  document.addEventListener(eventName, resetLoginTimeout, { passive: true });
}
window.addEventListener("hashchange", () => lockSession("new-link"));

$("#save-button").addEventListener("click", saveLocalCalendar);
$("#share-button").addEventListener("click", async () => {
  try {
    const { url, payload, pruned } = await createShareUrl();
    writeDebug("share url generated", { payloadLength: payload.length, urlLength: url.length, entryCount: entries.length, pruned });
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

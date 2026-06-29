import {
  STATUS,
  acceptProposal,
  cancelAccepted,
  declineProposal,
  escapeHtml,
  formatDate,
  mergeEntries,
  otherUser,
  pack,
  proposalsBy,
  pruneOldAcceptedEntries,
  sortEntries,
  statusChanges,
  toDateKey,
  unpack,
  upcomingAccepted,
  upsertProposal,
} from "./calendar-utils.js";

const STORAGE_KEY = "alex-dan-climbing-calendar";
const MAX_SHARE_URL_LENGTH = 8000;
const LOGIN_TIMEOUT_MS = 15 * 60 * 1000;
const GOOSE_TAP_TARGET = 10;
const GOOSE_STILL_IMAGE = "assets/mascots/goose-512.webp";
const GOOSE_MOTION_IMAGE = "assets/mascots/goose-motion.webp";
const RAT_STILL_IMAGE = "assets/mascots/rat-512.webp";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

let password = "";
let currentUser = "Alex";
let entries = [];
let gooseSignal;
let visibleMonth = new Date();
let timeoutId;
let autoSaveId;
let gooseTapCount = 0;
let gooseMotionTimer;

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
  gooseSignal = undefined;
  gooseTapCount = 0;
  clearTimeout(timeoutId);
  clearTimeout(gooseMotionTimer);
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
  const mascotButton = $("#mascot-button");
  const isAlex = currentUser === "Alex";
  mascot.src = isAlex ? GOOSE_STILL_IMAGE : RAT_STILL_IMAGE;
  mascot.alt = isAlex ? "Goose climbing mascot for Alex" : "Rat climbing mascot for Dan";
  mascotButton.setAttribute("aria-label", isAlex ? "Goose mascot surprise" : "Rat climbing mascot");
  mascotButton.disabled = !isAlex;
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
  if (!payload) return { entries: [], gooseSignal: undefined };
  const data = await decryptData(payload, secret);
  return {
    entries: Array.isArray(data.entries) ? data.entries : [],
    gooseSignal: data.gooseSignal?.from === "Alex" ? data.gooseSignal : undefined,
  };
}

function newestGooseSignal(localSignal, linkedSignal) {
  if (!localSignal) return linkedSignal;
  if (!linkedSignal) return localSignal;
  return new Date(linkedSignal.sentAt) > new Date(localSignal.sentAt) ? linkedSignal : localSignal;
}

async function loadEntries(secret, user) {
  const localData = await readPayload(localStorage.getItem(STORAGE_KEY), secret).catch((error) => {
    writeDebug("local load failed", { error: describeError(error) });
    return { entries: [], gooseSignal: undefined };
  });
  const linkedData = await readPayload(getLinkedPayload(), secret).catch((error) => {
    writeDebug("linked load failed", { error: describeError(error) });
    throw error;
  });
  const localEntries = localData.entries;
  const linkedEntries = linkedData.entries;
  const merged = mergeEntries(localEntries, linkedEntries, user);
  gooseSignal = newestGooseSignal(localData.gooseSignal, linkedData.gooseSignal);
  writeDebug("entries merged", { local: localEntries.length, linked: linkedEntries.length, merged: merged.length, gooseSignal: Boolean(gooseSignal), user });
  return merged;
}

async function persistLocalCalendar(source = "manual") {
  try {
    localStorage.setItem(STORAGE_KEY, await encryptData({ entries, gooseSignal }, password));
    writeDebug("local autosave complete", { source, entryCount: entries.length });
    return true;
  } catch (error) {
    writeDebug("local autosave failed", { source, error: describeError(error) });
    return false;
  }
}

function queueAutoSave(source) {
  clearTimeout(autoSaveId);
  if (!password) return;
  autoSaveId = setTimeout(() => persistLocalCalendar(source), 150);
}

function updateEntries(nextEntries, source) {
  entries = nextEntries;
  render();
  queueAutoSave(source);
}

function updateGooseSignal(nextSignal) {
  gooseSignal = nextSignal;
  if (currentUser === "Dan") render();
  queueAutoSave("goose-signal");
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
    item.innerHTML = `<span><strong>${formatDate(entry.date)}</strong>${entry.note ? ` — ${escapeHtml(entry.note)}` : ""}<br><small>${entry.status} by ${escapeHtml(entry.proposedBy)}${entry.acceptedBy ? `, accepted by ${escapeHtml(entry.acceptedBy)}` : ""}${entry.canceledBy ? `, canceled by ${escapeHtml(entry.canceledBy)}` : ""}</small></span>`;
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
  $("#user-context").textContent = `${currentUser}, propose climbing dates with ${otherUser(currentUser)}. Dates move from proposals into the accepted list when both of you agree.`;
  $("#incoming-title").textContent = `Proposals from ${otherUser(currentUser)}`;
  const gooseReceivedCard = $("#goose-received-card");
  if (currentUser === "Dan" && gooseSignal?.from === "Alex") {
    const sentAt = new Date(gooseSignal.sentAt);
    $("#goose-received-text").textContent = `Alex sent Dan a goose at ${sentAt.toLocaleString()}.`;
    gooseReceivedCard.classList.remove("is-hidden");
  } else {
    gooseReceivedCard.classList.add("is-hidden");
    $("#goose-received-text").textContent = "";
  }

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = toDateKey(date);
    const entry = entries.find((item) => item.date === key);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `day${date.getMonth() !== visibleMonth.getMonth() ? " is-outside" : ""}${entry ? ` is-selected is-${entry.status}` : ""}`;
    button.innerHTML = `<span class="day-number">${date.getDate()}</span>${entry ? `<span class="day-note">${entry.status === STATUS.ACCEPTED ? "Accepted" : entry.status === STATUS.CANCELED ? "Canceled" : `Proposed by ${escapeHtml(entry.proposedBy)}`}</span>` : ""}`;
    button.setAttribute("aria-label", entry ? `${formatDate(key)}: ${entry.status === STATUS.ACCEPTED ? "Accepted" : entry.status === STATUS.CANCELED ? "Canceled" : `Proposed by ${entry.proposedBy}`}` : formatDate(key));
    button.addEventListener("click", () => proposeDate(key));
    grid.append(button);
  }

  renderEntryList(
    $("#accepted-list"),
    upcomingAccepted(entries),
    "No upcoming accepted dates yet.",
    (entry) => [makeAction("Cancel", "remove", () => cancelDate(entry.date))],
  );
  renderEntryList(
    $("#your-proposals-list"),
    proposalsBy(entries, currentUser),
    "You have not proposed any dates yet.",
    (entry) => [makeAction("Remove", "remove", () => removeDate(entry.date))],
  );
  renderEntryList(
    $("#status-changes-list"),
    statusChanges(entries),
    "No accepted or canceled dates yet.",
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
  updateEntries(upsertProposal(entries, date, existing?.note || "", currentUser), "proposal");
}

function removeDate(date) {
  updateEntries(declineProposal(entries, date), "decline");
}

function acceptDate(date) {
  updateEntries(acceptProposal(entries, date, currentUser), "accept");
}

function cancelDate(date) {
  updateEntries(cancelAccepted(entries, date, currentUser), "cancel");
}

async function createShareUrl() {
  let shareEntries = sortEntries(entries);
  let pruned = 0;
  while (true) {
    const payload = await encryptData({ entries: shareEntries, gooseSignal }, password);
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
    if (getLinkedPayload()) queueAutoSave("linked-import");
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
  updateEntries(entries, "proposal-form");
});

$("#prev-month").addEventListener("click", () => { visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1); render(); });
$("#next-month").addEventListener("click", () => { visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1); render(); });
$("#lock-button").addEventListener("click", () => lockSession("manual"));
$("#mascot-button").addEventListener("click", () => {
  if (currentUser !== "Alex") return;
  gooseTapCount += 1;
  writeDebug("goose tapped", { count: gooseTapCount });
  if (gooseTapCount < GOOSE_TAP_TARGET) return;
  gooseTapCount = 0;
  const mascot = $("#user-mascot");
  const cacheBust = `?played=${Date.now()}`;
  mascot.src = `${GOOSE_MOTION_IMAGE}${cacheBust}`;
  clearTimeout(gooseMotionTimer);
  gooseMotionTimer = setTimeout(() => {
    if (currentUser === "Alex") mascot.src = GOOSE_STILL_IMAGE;
  }, 4300);
  updateGooseSignal({ from: "Alex", to: "Dan", sentAt: new Date().toISOString() });
});
async function saveLocalCalendar() {
  try {
    const saved = await persistLocalCalendar("manual");
    if (!saved) throw new Error("Manual save failed");
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

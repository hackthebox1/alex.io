export const USERS = ["Alex", "Dan"];
export const STATUS = {
  PROPOSED: "proposed",
  ACCEPTED: "accepted",
  CANCELED: "canceled",
};

export function otherUser(user) {
  return user === "Alex" ? "Dan" : "Alex";
}

export function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

export function normalizeEntry(entry, fallbackUser = "Alex") {
  return {
    date: entry.date,
    note: String(entry.note || "").trim(),
    status: [STATUS.ACCEPTED, STATUS.CANCELED].includes(entry.status) ? entry.status : STATUS.PROPOSED,
    proposedBy: USERS.includes(entry.proposedBy) ? entry.proposedBy : fallbackUser,
    acceptedBy: USERS.includes(entry.acceptedBy) ? entry.acceptedBy : undefined,
    canceledBy: USERS.includes(entry.canceledBy) ? entry.canceledBy : undefined,
    updatedAt: entry.updatedAt || new Date().toISOString(),
  };
}

export function normalizeEntries(entries = [], fallbackUser = "Alex") {
  return entries.filter((entry) => entry?.date).map((entry) => normalizeEntry(entry, fallbackUser));
}

export function upsertProposal(entries, date, note = "", proposedBy = "Alex") {
  const proposal = normalizeEntry({ date, note, proposedBy, status: STATUS.PROPOSED }, proposedBy);
  return entries.filter((entry) => entry.date !== date).concat(proposal);
}

export function acceptProposal(entries, date, acceptedBy) {
  return entries.map((entry) => entry.date === date
    ? { ...entry, status: STATUS.ACCEPTED, acceptedBy, updatedAt: new Date().toISOString() }
    : entry);
}

export function declineProposal(entries, date) {
  return entries.filter((entry) => entry.date !== date);
}

export function cancelAccepted(entries, date, canceledBy) {
  return entries.map((entry) => entry.date === date
    ? { ...entry, status: STATUS.CANCELED, canceledBy, updatedAt: new Date().toISOString() }
    : entry);
}

export function mergeEntries(localEntries = [], linkedEntries = [], currentUser = "Alex") {
  const merged = new Map();
  for (const entry of normalizeEntries(localEntries, currentUser)) merged.set(entry.date, entry);
  for (const linked of normalizeEntries(linkedEntries, otherUser(currentUser))) {
    const existing = merged.get(linked.date);
    if ([STATUS.ACCEPTED, STATUS.CANCELED].includes(linked.status)) {
      merged.set(linked.date, linked);
    } else if (!existing) {
      merged.set(linked.date, linked);
    } else if (existing.status !== STATUS.ACCEPTED && existing.proposedBy !== currentUser) {
      merged.set(linked.date, linked);
    }
  }
  return sortEntries([...merged.values()]);
}

export function sortEntries(entries) {
  return [...entries].sort((a, b) => a.date.localeCompare(b.date));
}

export function upcomingAccepted(entries, today = toDateKey(new Date())) {
  return sortEntries(entries).filter((entry) => entry.status === STATUS.ACCEPTED && entry.date >= today);
}

export function statusChanges(entries) {
  return sortEntries(entries).filter((entry) => [STATUS.ACCEPTED, STATUS.CANCELED].includes(entry.status));
}

export function proposalsBy(entries, user) {
  return sortEntries(entries).filter((entry) => entry.status === STATUS.PROPOSED && entry.proposedBy === user);
}

export function pruneOldAcceptedEntries(entries, today = toDateKey(new Date())) {
  const oldAccepted = sortEntries(entries).find((entry) => [STATUS.ACCEPTED, STATUS.CANCELED].includes(entry.status) && entry.date < today);
  if (!oldAccepted) return entries;
  return entries.filter((entry) => entry !== oldAccepted);
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

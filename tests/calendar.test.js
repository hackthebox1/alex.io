import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
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
  unpack,
  upcomingAccepted,
  upsertProposal,
} from "../calendar-utils.js";

const html = readFileSync("index.html", "utf8");
const js = readFileSync("app.js", "utf8");
const css = readFileSync("styles.css", "utf8");

assert.match(html, /Alex, when do you want to climb with Dan\?/);
assert.match(html, /Who is using the calendar\?/);
assert.match(html, /user-mascot/);
assert.match(html, /goose-received-card/);
assert.match(html, /Upcoming accepted dates/);
assert.match(html, /Your proposed dates/);
assert.match(html, /Proposals from the other climber/);
assert.match(html, /Status changes/);
assert.match(js, /PBKDF2/);
assert.match(js, /AES-GCM/);
assert.match(js, /localStorage\.setItem/);
assert.match(js, /queueAutoSave/);
assert.match(js, /cancelAccepted/);
assert.match(js, /navigator\.clipboard\.writeText/);
assert.match(js, /execCommand\?\.\("copy"\)/);
assert.match(js, /#data=/);
assert.match(js, /MAX_SHARE_URL_LENGTH/);
assert.match(js, /LOGIN_TIMEOUT_MS/);
assert.match(js, /hashchange/);
assert.match(js, /assets\/mascots\/goose-512.webp/);
assert.match(js, /assets\/mascots\/goose-motion.webp/);
assert.match(js, /assets\/mascots\/rat-512.webp/);
assert.match(js, /GOOSE_TAP_TARGET = 10/);
assert.match(js, /gooseSignal/);
assert.match(js, /Encryption returned an empty payload/);
assert.match(js, /Generated share URL is missing encrypted data/);
assert.match(js, /writeDebug\("capabilities"/);
assert.match(html, /Debug log/);
assert.match(html, /Copy debug log/);
assert.match(html, /Report a Problem/);
assert.match(html, /<details class="problem-report">/);
assert.match(css, /debug-log/);
assert.match(css, /problem-report/);
assert.match(css, /calendar-grid/);
assert.match(css, /is-accepted/);
assert.match(css, /is-canceled/);
assert.match(css, new RegExp("aspect-ratio: 1 / 1"));
assert.match(css, /boulder-bg.svg/);
assert.ok(statSync("assets/mascots/goose-motion.webp").size > 1000);

assert.equal(otherUser("Alex"), "Dan");
assert.equal(escapeHtml("<b>Dan & Alex's</b>"), "&lt;b&gt;Dan &amp; Alex&#039;s&lt;/b&gt;");
assert.equal(formatDate("2026-07-01", "en-US"), "Wed, Jul 1, 2026");
assert.deepEqual(upsertProposal([], "2026-07-01", "  gym  ", "Alex").map(({ date, note, status, proposedBy }) => ({ date, note, status, proposedBy })), [
  { date: "2026-07-01", note: "gym", status: STATUS.PROPOSED, proposedBy: "Alex" },
]);
const accepted = acceptProposal([{ date: "2026-07-02", note: "", status: STATUS.PROPOSED, proposedBy: "Alex" }], "2026-07-02", "Dan");
assert.equal(accepted[0].status, STATUS.ACCEPTED);
assert.equal(accepted[0].acceptedBy, "Dan");
const canceled = cancelAccepted(accepted, "2026-07-02", "Alex");
assert.equal(canceled[0].status, STATUS.CANCELED);
assert.equal(canceled[0].canceledBy, "Alex");
assert.deepEqual(statusChanges(canceled).map((entry) => entry.date), ["2026-07-02"]);
assert.deepEqual(mergeEntries([], canceled, "Dan").map((entry) => entry.canceledBy), ["Alex"]);
assert.deepEqual(declineProposal(accepted, "2026-07-02"), []);
assert.deepEqual(sortEntries([{ date: "2026-08-01" }, { date: "2026-07-01" }]).map((entry) => entry.date), ["2026-07-01", "2026-08-01"]);
assert.deepEqual(proposalsBy([{ date: "2026-07-01", status: STATUS.PROPOSED, proposedBy: "Alex" }], "Alex").map((entry) => entry.date), ["2026-07-01"]);
assert.deepEqual(upcomingAccepted([{ date: "2026-07-01", status: STATUS.ACCEPTED }], "2026-01-01").map((entry) => entry.date), ["2026-07-01"]);

const merged = mergeEntries(
  [
    { date: "2026-07-01", status: STATUS.PROPOSED, proposedBy: "Alex" },
    { date: "2026-07-02", status: STATUS.PROPOSED, proposedBy: "Alex" },
  ],
  [
    { date: "2026-07-01", status: STATUS.CANCELED, proposedBy: "Dan", acceptedBy: "Alex", canceledBy: "Dan" },
    { date: "2026-07-03", status: STATUS.PROPOSED, proposedBy: "Dan" },
  ],
  "Alex",
);
assert.deepEqual(merged.map(({ date, status, proposedBy }) => ({ date, status, proposedBy })), [
  { date: "2026-07-01", status: STATUS.CANCELED, proposedBy: "Dan" },
  { date: "2026-07-02", status: STATUS.PROPOSED, proposedBy: "Alex" },
  { date: "2026-07-03", status: STATUS.PROPOSED, proposedBy: "Dan" },
]);
assert.deepEqual(pruneOldAcceptedEntries([
  { date: "2025-01-01", status: STATUS.ACCEPTED },
  { date: "2026-07-01", status: STATUS.PROPOSED },
], "2026-01-01").map((entry) => entry.date), ["2026-07-01"]);

const originalBytes = new TextEncoder().encode("mobile clipboard fallback test");
assert.deepEqual(unpack(pack(originalBytes)), originalBytes);

console.log("Static and unit calendar checks passed.");

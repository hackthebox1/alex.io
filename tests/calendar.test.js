import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { escapeHtml, formatDate, pack, sortEntries, toggleEntry, unpack, upsertEntry } from "../calendar-utils.js";

const html = readFileSync("index.html", "utf8");
const js = readFileSync("app.js", "utf8");
const css = readFileSync("styles.css", "utf8");

assert.match(html, /Alex, when do you want to climb with Dan\?/);
assert.match(html, /GitHub Pages cannot safely hide a hard-coded password/);
assert.match(js, /PBKDF2/);
assert.match(js, /AES-GCM/);
assert.match(js, /localStorage\.setItem/);
assert.match(js, /navigator\.clipboard\.writeText/);
assert.match(js, /execCommand\?\.\("copy"\)/);
assert.match(js, /#data=/);
assert.match(js, /writeDebug\("capabilities"/);
assert.match(html, /Debug log/);
assert.match(css, /debug-log/);
assert.match(css, /calendar-grid/);

assert.equal(escapeHtml("<b>Dan & Alex's</b>"), "&lt;b&gt;Dan &amp; Alex&#039;s&lt;/b&gt;");
assert.equal(formatDate("2026-07-01", "en-US"), "Wed, Jul 1, 2026");
assert.deepEqual(upsertEntry([], "2026-07-01", "  gym  "), [{ date: "2026-07-01", note: "gym" }]);
assert.deepEqual(upsertEntry([{ date: "2026-07-01", note: "old" }], "2026-07-01", "new"), [
  { date: "2026-07-01", note: "new" },
]);
assert.deepEqual(toggleEntry([], "2026-07-02"), [{ date: "2026-07-02", note: "" }]);
assert.deepEqual(toggleEntry([{ date: "2026-07-02", note: "" }], "2026-07-02"), []);
assert.deepEqual(sortEntries([{ date: "2026-08-01" }, { date: "2026-07-01" }]), [
  { date: "2026-07-01" },
  { date: "2026-08-01" },
]);

const originalBytes = new TextEncoder().encode("mobile clipboard fallback test");
assert.deepEqual(unpack(pack(originalBytes)), originalBytes);

console.log("Static and unit calendar checks passed.");

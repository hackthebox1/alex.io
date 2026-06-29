const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");

const html = readFileSync("index.html", "utf8");
const js = readFileSync("app.js", "utf8");
const css = readFileSync("styles.css", "utf8");

assert.match(html, /Alex, when do you want to climb with Dan\?/);
assert.match(html, /GitHub Pages cannot safely hide a hard-coded password/);
assert.match(js, /PBKDF2/);
assert.match(js, /AES-GCM/);
assert.match(js, /localStorage\.setItem/);
assert.match(js, /#data=/);
assert.match(css, /calendar-grid/);

console.log("Static climbing calendar checks passed.");

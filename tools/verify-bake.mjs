#!/usr/bin/env node
/* verify-bake.mjs — gate the edited index.html BEFORE it is committed/deployed.
 *
 * Reloads the (already baked) index.html in jsdom and asserts the result is sound. Any
 * failure exits non-zero so the workflow stops before committing. Maintainer/CI tooling
 * only — never shipped in the app.
 *
 * Usage: node tools/verify-bake.mjs [pathToIndexHtml]   (default ./index.html)
 */
import fs from "node:fs";
import path from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";

const htmlPath = path.resolve(process.argv[2] || "index.html");
const html = fs.readFileSync(htmlPath, "utf8");

let failures = 0;
const check = (cond, msg) => { console.log((cond ? "PASS  " : "FAIL  ") + msg); if (!cond) failures++; };

// 1. reload with no script/console errors (catches a malformed literal or broken <script>)
const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", e => errors.push("jsdomError: " + (e.detail || e.message || e)));
vc.on("error", (...a) => errors.push("console.error: " + a.join(" ")));
const dom = new JSDOM(html, { runScripts: "dangerously", virtualConsole: vc, url: "https://localhost/", pretendToBeVisual: true });
const { window } = dom;
const doc = window.document;
check(errors.length === 0, "edited index.html loads with no console/jsdom errors" + (errors.length ? "\n      " + errors.join("\n      ") : ""));

const ev = expr => window.eval(expr);

// 2. at least one community bank was baked
let names = [];
try { names = ev("Object.keys(COMMUNITY_BANKS)"); } catch (e) { /* handled by check below */ }
check(Array.isArray(names) && names.length >= 1, "COMMUNITY_BANKS contains >=1 baked bank (found " + (names ? names.length : "?") + ")");

// 3. every community bank: registered in BOTH seed maps + in the live picker, and normalizeBank-idempotent
for (const n of names) {
  const nn = JSON.stringify(n);
  check(ev(`(${nn} in DEFAULTS.banks) && (${nn} in ORIGINAL_BANKS)`), `"${n}" registered in both DEFAULTS.banks and ORIGINAL_BANKS`);
  check(ev(`${nn} in state.banks`), `"${n}" present in live state.banks (shows in picker)`);
  const idempotent = ev(`(function(){
    const a = JSON.stringify(DEFAULTS.banks[${nn}]);
    const b = JSON.stringify(normalizeBank(JSON.parse(JSON.stringify(DEFAULTS.banks[${nn}]))));
    return a === b;
  })()`);
  check(idempotent, `"${n}" is fully normalized (normalizeBank is a no-op ⇒ loads clean for users)`);
}

// 4. version bumped consistently; JSON schema version untouched
const sub = doc.getElementById("subline");
const m = sub && sub.textContent.match(/v(\d{4}\.\d{2}\.\d{2})/);
const ver = m ? m[1] : null;
check(!!ver, "a version date is present in #subline");
if (ver) {
  const help = doc.getElementById("aboutVersion") || null; // best-effort; fall back to raw text scan
  const versionCount = (html.match(new RegExp("Version " + ver.replace(/\./g, "\\."), "g")) || []).length;
  check(versionCount >= 2, `display version "Version ${ver}" appears in >=2 spots (Help + filename) (found ${versionCount})`);
  check(html.includes('"version": 3') || /version:\s*3/.test(html), "JSON schema `version: 3` is still present (untouched)");
}

console.log("\n" + (failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"));
process.exit(failures === 0 ? 0 : 1);

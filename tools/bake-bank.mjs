#!/usr/bin/env node
/* bake-bank.mjs — bake an APPROVED community bank submission into the seed of index.html.
 *
 * This is maintainer/CI tooling. It is NEVER shipped in index.html and is not required to
 * run the app. It takes a submission (the single-bank JSON a teacher pasted into a GitHub
 * issue), validates it through the APP'S OWN normalizeBank() (loaded via jsdom — no logic is
 * duplicated), and inserts it into the COMMUNITY_BANKS map so it ships as a built-in bank.
 *
 * Usage:
 *   ISSUE_BODY="<github issue body>" node tools/bake-bank.mjs [pathToIndexHtml]
 *   - ISSUE_BODY: the raw issue body containing one ```json fenced block (required).
 *   - pathToIndexHtml: defaults to ./index.html (CI runs from the repo root). Pass a path to
 *     bake into a throwaway copy when testing locally.
 *
 * On success: edits index.html in place, prints a summary, and (in CI) writes `name` to
 * $GITHUB_OUTPUT. On any failure: prints `REASON: <why>` and exits 1 (nothing is written).
 */
import fs from "node:fs";
import path from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";

const START_MARKER = "// @COMMUNITY_BANKS_START@";

function fail(reason) {
  console.error("REASON: " + reason);
  process.exit(1);
}

// ---- inputs ----
const issueBody = process.env.ISSUE_BODY;
if (!issueBody || !issueBody.trim()) fail("ISSUE_BODY env var is empty.");
const htmlPath = path.resolve(process.argv[2] || "index.html");
if (!fs.existsSync(htmlPath)) fail("index.html not found at " + htmlPath);

// ---- 1. extract exactly one ```json fenced block ----
const blocks = [...issueBody.matchAll(/```json\s*([\s\S]*?)```/g)].map(m => m[1].trim());
if (blocks.length === 0) fail("No ```json code block found in the issue. Paste the bank JSON between the ```json fences.");
if (blocks.length > 1) fail("Found " + blocks.length + " ```json blocks. Submit exactly one bank per issue.");

// ---- 2. parse + shape check ----
let parsed;
try { parsed = JSON.parse(blocks[0]); }
catch (e) { fail("The ```json block is not valid JSON: " + e.message); }
if (!parsed || typeof parsed !== "object") fail("Parsed JSON is not an object.");
if (parsed.emarkingBank !== true) fail('Missing `"emarkingBank": true` - this is not an E-Marking single-bank file.');
if (!parsed.bank || typeof parsed.bank !== "object") fail("Missing a `bank` object.");
const rawSubject = (typeof parsed.subject === "string" ? parsed.subject : "").trim();
if (!rawSubject) fail("Missing a non-empty `subject` name.");
// Sanitize the display name: it flows into a commit message, a workflow output, and the
// app's bank picker. Drop control chars / newlines and characters that could inject into a
// shell or JS context; keep ordinary subject punctuation (e.g. "CTF 8/9", "Art & Design").
const subject = rawSubject
  .replace(/[\u0000-\u001f]+/g, " ")   // control chars / newlines -> space
  .replace(/[`$\\"<>]/g, "")                 // shell/JS-injection-prone characters
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, 80);
if (!subject) fail("Subject name is empty after removing unsupported characters.");

// ---- 3. load the app in jsdom to reach the REAL normalizeBank() ----
const html = fs.readFileSync(htmlPath, "utf8");
if (!html.includes(START_MARKER)) fail("index.html is missing the " + START_MARKER + " marker (scaffolding not present).");
const loadErrors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", e => loadErrors.push(String(e.detail || e.message || e)));
const dom = new JSDOM(html, { runScripts: "dangerously", virtualConsole: vc, url: "https://localhost/" });
const { window } = dom;
if (loadErrors.length) fail("index.html threw while loading in jsdom: " + loadErrors.join(" | "));
if (typeof window.normalizeBank !== "function") fail("window.normalizeBank is not available after load.");

// ---- 4. normalize through the app's gate (it mutates in place; pass a deep copy) ----
const bank = window.normalizeBank(JSON.parse(JSON.stringify(parsed.bank)));

// ---- 5. post-normalize substance check ----
const nStems = (bank.stems || []).filter(s => s && (s.label || "").trim()).length;
const nTasks = (bank.tasks || []).filter(t => t && (t.text || "").trim()).length;
if (nStems < 1) fail("Bank has no usable stems after validation.");
if (nTasks < 1) fail("Bank has no usable evidence (tasks) after validation.");

// ---- 6. choose a unique display name (dedupe vs built-ins + already-baked) ----
const existing = window.eval("Object.keys(DEFAULTS.banks)");
let name = subject;
if (existing.includes(name)) {
  let i = 1;
  name = subject + " (community)";
  while (existing.includes(name)) { i++; name = subject + " (community " + i + ")"; }
}

// ---- 7. serialize as a JS object literal, guarded so it can't close the <script> ----
const literal = JSON.stringify(bank, null, 2).replace(/<\//g, "<\\/"); // same guard as bakeHTML()
const indented = literal.split("\n").map((l, i) => (i === 0 ? l : "  " + l)).join("\n");
const entry = "  " + JSON.stringify(name) + ": " + indented + ",";

// ---- 8. insert at the marker (pure text insertion; never re-parses JS) ----
if (html.indexOf(START_MARKER) !== html.lastIndexOf(START_MARKER)) fail("Found the start marker more than once.");
const out0 = html.replace(START_MARKER, START_MARKER + "\n" + entry);

// ---- 9. bump the human-facing version date (3 display spots) to today's UTC YYYY.MM.DD ----
const d = new Date();
const p = n => String(n).padStart(2, "0");
const today = d.getUTCFullYear() + "." + p(d.getUTCMonth() + 1) + "." + p(d.getUTCDate());
const m = out0.match(/Report Card Comments · v(\d{4}\.\d{2}\.\d{2})</);
if (!m) fail("Could not find the current version string to bump.");
const oldV = m[1];
let out = out0.split("v" + oldV).join("v" + today);             // #subline "v2026.06.17"
out = out.split("Version " + oldV).join("Version " + today);    // Help tab + download filename
// (the JSON schema `version: 3` has no date and is intentionally untouched)

// ---- 10. write ----
fs.writeFileSync(htmlPath, out, "utf8");

const summary = `Baked "${name}" (${nStems} stems, ${nTasks} tasks). Version ${oldV} -> ${today}.`;
console.log(summary);
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `name=${name}\n`);
}

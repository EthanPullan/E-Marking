# E-Marking Comment Builder

A free tool for writing structured report-card comments. Teachers pick small
building blocks — a proficiency level, a reporting stem, the evidence a student
produced, a next step — and the tool assembles them into grammatically correct,
consistent comments to copy into any report-card or gradebook system.

**Live app:** https://ethanpullan.github.io/E-Marking/

## A single static file

The whole app is one file — [`index.html`](index.html) — with all HTML, CSS, and
JavaScript inline. No build step, no dependencies, no frameworks, no CDNs, no web
fonts. Open it by double-clicking (works fully offline) or host it as a static
site such as GitHub Pages.

## Nothing leaves your browser

The page makes no network requests and uses no browser storage — nothing you type
ever leaves your browser. You own your data: all saving and loading is explicit,
through files you download and re-open (a baked copy of the page, or a `.json`
export). Only the built-in banks ship in this repository; class lists stay in your
own exported files and are never committed here.

## Using it

Three tabs: **Write comments** (class roster + comment builder), **Comment bank**
(edit the wording and options for the current subject), and **Help**. A **Bank**
picker switches subjects; nine subject banks ship by default. See the in-app
**Help** tab for a full walkthrough.

## Contributing a comment bank

In the app, open the **Comment bank** tab and click **Submit this bank to the project**.
Your bank's JSON is copied to your clipboard and a prefilled GitHub issue opens — sign in
if asked, paste it between the code fences, and submit. (Nothing is sent automatically; the
app only opens a link.) If the maintainer approves it, a GitHub Action validates the bank,
bakes it into the seed, and ships it as a built-in bank for everyone.

Maintainer notes live in [`tools/`](tools/) and [`.github/workflows/`](.github/workflows/):
approval is the `approved-bank` label on a submission issue, and Pages must be set to deploy
from **GitHub Actions** (Settings → Pages → Source). None of this tooling ships in
`index.html` — the app stays a single dependency-free file.

## Licence

[MIT](LICENSE) © 2026 Ethan Pullan

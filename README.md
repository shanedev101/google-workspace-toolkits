# Google Workspace Toolkits

<!-- markdownlint-disable MD033 -->
<p align="center">
  <img src="assets/icon.png" width="128" height="128" alt="Google Workspace Toolkits icon">
</p>
<!-- markdownlint-enable MD033 -->

A Chrome extension that adds Markdown, Mermaid diagram, and KaTeX math rendering to Google Drive, Docs, and Sheets.

![Manifest V3](https://img.shields.io/badge/manifest-v3-blue.svg?style=flat-square)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
![Vite](https://img.shields.io/badge/Bundler-Vite-646CFF.svg?style=flat-square)
![TypeScript](https://img.shields.io/badge/Language-TypeScript-3178C6.svg?style=flat-square)

---

## Features

**Google Drive** — Preview `.md`, `.markdown`, and `.txt` files with full Markdown rendering, and dark/light themes.

**Google Docs** — Select any Markdown text in a document and click the floating button to preview it in a side panel. Requires Screen Reader support to be enabled once in Docs (Tools → Accessibility settings).

**Google Sheets** — When a cell contains Markdown content, a preview button appears. Click it to render the cell in a modal overlay. Wrapping content in a ` ```markdown ``` ` block gives the best detection results.

All rendering runs locally — `markdown-it` for parsing, `highlight.js` for syntax, `katex` for math, and `mermaid` for diagrams. No network requests, no tracking.

---

## Local Setup

You need [Node.js](https://nodejs.org) v22 or later.

```bash
npm install
npm run dev      # watch mode, recompiles on save
```

Then in Chrome:

1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `dist/` folder

> The `dist/` folder is what Chrome loads — not the project root.

**Lint and format:**

```bash
npm run lint
npm run format
```

**Build for release** — normally handled by CI on tag push, but you can run locally:

```bash
npm run build
```

---

## License

[MIT](LICENSE)

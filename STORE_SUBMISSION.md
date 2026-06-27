# Workspace Toolkit for Google - Chrome Web Store Submission Kit

This kit contains all the exact copy, descriptions, and permission justifications you need to copy-paste directly into the [Chrome Web Store Developer Console](https://chrome.google.com/webstore/devconsole).

---

## 1. Basic Metadata

| Field                 | Copy to Paste                                                                                                           |
| :-------------------- | :---------------------------------------------------------------------------------------------------------------------- |
| **Product Name**      | `Workspace Toolkit for Google - Markdown Preview for Google`                                                            |
| **Short Description** | `Bring GitHub-style Markdown rendering, Mermaid diagrams, and KaTeX math formulas into Google Drive, Docs, and Sheets.` |
| **Category**          | `Productivity` (or `Developer Tools`)                                                                                   |
| **Official Homepage** | _(Your GitHub repository link)_                                                                                         |

---

## 2. Detailed Store Description

```text
Add Markdown, diagram, and math formula rendering to Google Workspace.

Workspace Toolkit for Google is a browser extension that renders GitHub-style Markdown, interactive Mermaid.js diagrams, KaTeX mathematical formulas, and syntax-highlighted code blocks directly inside Google Drive, Docs, and Sheets. All rendering runs locally for privacy and speed.

It helps you view documentation, technical notes, or equations directly within your Google Workspace workflow.

KEY FEATURES:

1. GOOGLE DRIVE MARKDOWN PREVIEWER
- One-click live markdown previews for .md, .markdown, and .txt files.
- Simple dark and light reading themes.

2. GOOGLE DOCS SELECTION PREVIEW
- Highlight any markdown text block inside Google Docs.
- Preview the formatted block in a side-by-side sidebar editor.

3. GOOGLE SHEETS MODAL
- Automatically detects cell markdown structures.
- Click to expand markdown tables, equations, and flowcharts in an overlay modal.

100% PRIVATE & SECURITY FIRST
- Runs entirely locally inside your browser sandbox.
- No external server connections.
- No data collection, tracking, or telemetry.
- Permissive open-source MIT licensed codebase.
```

---

## 4. Privacy & Permissions Justifications

When filling out the **Privacy Practices** tab in the console, copy and paste these exact explanations:

| Field                     | Copy to Paste                                                                                                                          |
| :------------------------ | :------------------------------------------------------------------------------------------------------------------------------------- |
| **Single Purpose**        | `To provide Markdown preview, math rendering, and diagram parsing tools directly inside Google Workspace tools (Drive, Docs, Sheets).` |
| **Permission: `storage`** | `Required to save, load, and persist user preferences for active theme modes and integration options locally.`                         |

---

## 5. Graphical Assets Checklist

Ensure your graphic design assets meet these exact requirements before uploading:

1. **Extension Icon**:
   - File: `icons/icon128.png` (You can create this PNG or Chrome will use a default extension puzzle icon).
   - Size: `128x128` pixels.
2. **Screenshots (Minimum 1, Recommended 2-4)**:
   - Size: `1280x800` or `640x400` pixels.
   - Format: PNG or JPEG.
   - Tip: Take a screenshot of a .md file inside Google Drive displaying the previewer sidebar.

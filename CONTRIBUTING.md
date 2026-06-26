# Contributing

Contributions are welcome. Here's how to get started.

## Workflow

### 1. Set up the environment

Follow the [README](README.md#local-setup) to install dependencies and run the project locally.

### 2. Pick or open an issue

Check existing issues and pull requests first. If you found a bug or have a feature idea, open an issue before starting work so we can discuss it.

### 3. Branch and commit

Use descriptive branch names:

- `fix/issue-description` for bug fixes
- `feat/feature-name` for new features
- `docs/what-changed` for documentation

Commit messages should be short and in English, e.g. `feat: add sheets equation support`.

## Code standards

- **TypeScript** — avoid `any` where a real type works.
- **Lint and format** — run `npm run lint` and `npm run format` before committing.
- **Chrome API guards** — check for runtime errors when using Chrome Storage; validate message payloads before acting on them.
- **Shadow DOM** — all overlays and sidebars must be rendered inside a Shadow DOM container so the extension styles don't leak into the host page.
- **Offline rendering** — keep all parsing local (`markdown-it`, `highlight.js`, `katex`). Don't add CDN fetches.
- **Stable selectors** — prefer `id` attributes and ARIA roles over generated class names, which Google Workspace updates frequently.

## Submitting a PR

1. Push your branch to your fork and open a PR against `main`.
2. Describe what changed and why.
3. Explain how you tested it (which Google Workspace product, what scenario).

Maintainers will review and get back to you.

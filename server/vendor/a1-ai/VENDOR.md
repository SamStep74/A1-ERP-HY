# Vendored: @a1/ai

This directory is a **vendored copy** of the shared `@a1/ai` package.

- Source: https://github.com/SamStep74/A1-AI-Core
- Commit: `01d1cb9` (initial extraction)
- Vendored: 2026-06-04

**Do not edit files here.** Fix bugs / add features in the `A1-AI-Core` repo, then
re-vendor (copy its `index.js` + `src/` over this directory) and bump the commit
above. It is vendored (not an npm dependency) to keep the local-first /
self-hostable deploy model and to avoid touching the shared worktree `node_modules`.

The Suite consumes it through thin adapters: `server/aiProvider.js`,
`server/settingsStore.js`, `server/openNotebook.js`, and the supplemental-source
import in `server/copilot.js`.

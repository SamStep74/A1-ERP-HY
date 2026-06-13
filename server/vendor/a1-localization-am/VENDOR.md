# Vendored: a1-localization-am

- **Source:** https://github.com/SamStep74/A1-Localization-AM
- **Pinned commit:** `12e3b3a00c468e936327ba52488a71c821df370a`

Verbatim copy of the package's `index.js` + `src/`. Vendored (not an npm
dependency) to keep the local-first / self-hostable deploy model and to avoid
touching the shared worktree node_modules — mirroring `server/vendor/a1-ai`.

**DO NOT EDIT files here.** Fix upstream in the A1-Localization-AM repo, then
re-vendor: copy `index.js` + `src/` into this directory and update the pinned
commit above.

The thin `server/<engine>.js` files (localization, armeniaPhone, armeniaRegions,
armeniaChartOfAccounts, einvoice, vatReturn, armeniaPayroll) re-export the matching
namespace from this package, so existing relative `require("./<engine>")` calls
keep working unchanged.

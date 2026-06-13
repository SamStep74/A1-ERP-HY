# Vendored: a1-localization-ru

- **Source:** https://github.com/SamStep74/A1-Localization-RU
- **Pinned commit:** `68131da6192e91e49964ab64e5360f5c95fc9064` (PR #1)

Verbatim copy of the package's `index.js` + `src/`. Vendored (not an npm
dependency) to keep the local-first / self-hostable deploy model and to avoid
touching the shared worktree node_modules — mirroring `server/vendor/a1-localization-am`.

**DO NOT EDIT files here.** Fix upstream in the A1-Localization-RU repo, then
re-vendor: copy `index.js` + `src/` into this directory and update the pinned
commit above.

This package provides the Russian-market (RF) fiscal engines: `inn` (ИНН/КПП/
ОГРН/ОГРНИП/СНИЛС), `money` (RUB/копейка), `vat` (НДС 2026), `payroll`
(НДФЛ + страховые взносы), `chartOfAccounts` (План счетов, Приказ Минфина 94н —
73 accounts), `regions` (субъекты РФ, ISO 3166-2:RU — 83 subjects), `phone`
(+7 / НСН), and `einvoice` (УПД / счёт-фактура, формат 5.03).

It is the RU counterpart to `a1-localization-am`. The Suite currently runs the
Armenian (RA) configuration via the `server/<engine>.js` shims; selecting the RU
package at runtime (an AM↔RU locale switch) is a separate follow-up. Until then
this vendored package is exercised by `test/localization-ru-vendor-wiring.test.js`
so it cannot silently rot.

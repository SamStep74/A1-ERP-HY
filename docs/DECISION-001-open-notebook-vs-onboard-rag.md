# DECISION-001 — Open Notebook vs. the onboard RAG module

_Status: **Accepted** · Date: 2026-06-04 · Scope: A1 Suite Armenian legal & accounting copilot grounding layer_

> **Decision in one line:** **Keep the sovereign in-process `server/rag.js` as the copilot's grounding layer; do NOT substitute it with [lfnovo/open-notebook](https://github.com/lfnovo/open-notebook). Borrow Open Notebook's best *patterns* (multi-format ingest, per-task model routing, source-grounded chat UX) natively instead.**

This memo records *why* a NotebookLM-class system was evaluated as a substitute and why the existing direction holds, so the choice survives staff turnover and the mandatory accountant/lawyer review gate. It is consistent with `docs/superpowers/plans/2026-06-01-armenian-legal-accounting-copilot.md`, which already commits to grounding the copilot on `server/rag.js`.

---

## 1. Context

The Armenian legal & accounting copilot (`server/copilot.js` + `POST /api/copilot/questions`) answers VAT, payroll, personal-data, e-signature, and month-close questions. Every legal/tax answer must carry `reviewRequired: true` and **at least one cited legal source** — so a retrieval/grounding layer over the RA-law knowledge base is load-bearing for correctness and liability.

The question raised: *should we replace the onboard RAG module with Open Notebook (Luis Novo / lfnovo), an open-source NotebookLM equivalent, as the grounding backend?*

---

## 2. What Open Notebook actually is

Source: [github.com/lfnovo/open-notebook](https://github.com/lfnovo/open-notebook) (MIT). Cross-checked against [KDnuggets](https://www.kdnuggets.com/open-notebook-a-true-open-source-private-notebooklm-alternative) and [The New Stack](https://thenewstack.io/how-to-deploy-an-open-source-version-of-notebooklm/).

- **Purpose:** privacy-focused NotebookLM alternative — multi-source notebooks, context-aware chat over your sources, transformations, and **podcast/audio generation**.
- **Stack:** Python / **FastAPI** backend + TypeScript / **Next.js** frontend + **SurrealDB** + **LangChain**.
- **Runtime:** **Docker Compose** — three long-running services: the app, SurrealDB (`:8000`), and Ollama (local model runner); frontend `:8502`, API `:5055`.
- **Providers:** 18+ (OpenAI, Anthropic, Google/Vertex, **Ollama**, Mistral, DeepSeek, xAI, OpenRouter, MiniMax, OpenAI-compatible …) for LLM, embeddings, STT, and TTS. Per-task model routing is a first-class feature.
- **Offline:** "100% local" *is* achievable with Ollama — but still as a multi-container deployment, not a single auditable process.

It is genuinely good software. The issue is not quality; it is **runtime philosophy fit**.

---

## 3. What we would be replacing

`server/rag.js` — **147 lines, zero npm dependencies**:

- Lexical **BM25 is always available** — no model, no network, ever. Pure `node:sqlite` over `law_chunks`.
- When the KB has embeddings, `searchHybrid` blends BM25 with cosine similarity; the query embedding is fetched from a **local** embedder via `config.safeFetch` (loopback is always permitted by the egress gate). **Any embed failure transparently falls back to BM25.**
- Runs **in-process**: `const rag = require("./rag")` then one function call inside the Fastify handler. No extra service, no extra port, no extra container.

The suite's defining constraint lives in `server/config.js`: `ARMOSPHERA_ONE_ALLOW_EGRESS` defaults to **off**, loopback is the *only* always-permitted host, and outbound hosts must be explicitly allowlisted. The product's entire value proposition for its target market — **Armenian organizations that cannot use foreign clouds (government, banks, healthcare, legal)** — is "a single Node + SQLite process you can audit and air-gap."

---

## 4. Comparison

| Dimension | `server/rag.js` (incumbent) | Open Notebook (candidate) |
|---|---|---|
| **Job** | Invisible grounding layer feeding `copilot.buildCopilotPacket` cited law excerpts | Destination research app (notebooks, chat, podcasts) |
| **Deps** | 0 (uses `node:sqlite`) | Python + LangChain + SurrealDB + provider SDKs |
| **Runtime** | In-process function call | Docker Compose: app + SurrealDB + Ollama |
| **Network at rest** | **None** — BM25 needs no model/network | SurrealDB + (for AI) Ollama services running |
| **Air-gap / single-binary audit** | ✅ yes | ❌ multi-service stack |
| **Retrieval** | BM25 always-on + optional hybrid cosine | Vector + full-text via SurrealDB |
| **Armenian (`hy-AM`)** | Already wired; KB is RA-law chunks; planned `Metric-AI/armenian-text-embeddings-2-*` | Depends entirely on chosen LLM/embedder |
| **Multi-format ingest (PDF/audio/video)** | ❌ not built | ✅ strong |
| **Per-task model routing** | partial (copilot model policy) | ✅ first-class |
| **Audio/podcast generation** | ❌ (out of scope for a legal copilot) | ✅ |
| **License** | in-house | MIT |

---

## 5. Decision & rationale

**Keep `server/rag.js`. Do not substitute.** Three hard mismatches make a wholesale swap a net regression *for this product*:

1. **Sovereignty regression (disqualifying).** Trading a single auditable process for a SurrealDB + FastAPI + Ollama Compose stack directly undercuts the one property that makes the suite sellable to ministries, banks, and law firms that legally cannot run foreign clouds. The incumbent degrades to BM25 with **zero** network; Open Notebook cannot.
2. **Dependency-surface explosion.** The server depends on only `fastify` + `@fastify/cookie` + `@fastify/static`. Adopting Open Notebook pulls in Python, LangChain, SurrealDB, and a provider SDK web — the opposite of this codebase's "the dependency list IS the spec" discipline.
3. **Category mismatch.** Open Notebook is a *place you go*; our RAG is an *invisible grounder*. Replacing a 147-line embedded retriever with a multi-container notebook app solves a problem we do not have, at the cost of one we do.

This is consistent with the copilot plan's existing commitment to `server/rag.js` and its Armenian-embeddings direction.

---

## 6. What to borrow (patterns, not the codebase)

Open Notebook is a good *source of ideas* to port natively into the sovereign architecture:

- **Multi-format ingestion → `law_chunks`.** A local, dependency-light pipeline that turns PDFs (and later DOCX) of RA legislation into chunked, embeddable rows. This is the single highest-value borrow: it widens the KB without changing the retrieval contract. Keep it offline (no cloud parsing).
- **Per-task model routing.** Generalize the copilot model policy (`COPILOT_PROVIDER/MODEL/LANGUAGE`) so indexing, query-embedding, and answer-shaping can each use a different local model — mirrors Open Notebook's independent per-transformation model config.
- **Source-grounded chat UX.** Their inline-citation, "answer cites the source span" UX is worth emulating in the Copilot panel (we already require `reviewRequired` + ≥1 cited source — make the citation *visible and clickable* like they do).
- **Egress-gated optional connector (deferred).** If a customer *already* runs Open Notebook, a future opt-in adapter could let the copilot call its API via the egress allowlist (same shape as the Ollama/embedder pattern) — sovereign by default, richer when explicitly opted in. Captured as a future option, **not** adopted now.

---

## 7. Consequences

- **Positive:** preserves air-gap + single-process + tiny-deps; no change to the copilot grounding contract; decision recorded for the accountant/lawyer review gate.
- **Negative / accepted:** we forgo Open Notebook's ready-made multi-format ingest and podcast features. The ingest gap is mitigated by the borrow-list item above; podcasts are out of scope for a legal/accounting copilot.
- **Revisit triggers:** (a) a customer mandates Open Notebook interop → build the §6 opt-in connector; (b) the sovereign single-process constraint is formally relaxed for a deployment tier → re-open full substitution as a scoped PoC.

---

## 8. References

- Open Notebook — [github.com/lfnovo/open-notebook](https://github.com/lfnovo/open-notebook) (MIT)
- [KDnuggets — "A True Open Source Private NotebookLM Alternative?"](https://www.kdnuggets.com/open-notebook-a-true-open-source-private-notebooklm-alternative)
- [The New Stack — deploy guide](https://thenewstack.io/how-to-deploy-an-open-source-version-of-notebooklm/)
- Incumbent: `server/rag.js`, `server/config.js` (egress gate), `server/copilot.js`
- Existing plan: `docs/superpowers/plans/2026-06-01-armenian-legal-accounting-copilot.md`

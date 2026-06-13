# A1 Suite — AI (Copilot, OpenRouter & Open Notebook)

The Suite's legal/accounting **Copilot** runs on **OpenRouter** as the single
cloud AI provider, selected from a **live model menu**, with **Open Notebook** as
an **opt-in** retrieval source beside the local RA-law RAG. The AI core is the
shared [`@a1/ai`](https://github.com/SamStep74/A1-AI-Core) package (vendored at
`server/vendor/a1-ai`).

Everything is **advisory** and **local-first / opt-in**: with no key configured
and egress disabled, the Copilot stays offline-deterministic.

## Configure (Owner)

In the onboarding page (Owner-only panel) or via env:

| Setting | UI | Env |
|---|---|---|
| OpenRouter API key | onboarding → "OpenRouter API key" | `OPENROUTER_API_KEY` |
| Model per aspect (default/copilot/transform/finance/crm/docs) | live dropdowns | `A1_MODEL_DEFAULT`, `A1_MODEL_COPILOT`, … |
| Open Notebook (opt-in) | enable + base URL + key | `OPEN_NOTEBOOK_ENABLED=1`, `OPEN_NOTEBOOK_BASE_URL`, … |

The key is stored locally (`ai-settings.json`, `0600`) and is **never returned to
the browser** — the client only sees `*Set` booleans.

## Egress (deny-until-listed)

Outbound AI is gated. The live model menu + external Copilot mode activate **only**
when egress is enabled **and** `openrouter.ai` is allowlisted:

```bash
ARMOSPHERA_ONE_ALLOW_EGRESS=1
ARMOSPHERA_ONE_EGRESS_ALLOWLIST=openrouter.ai            # (+ your Open Notebook host)
```

Loopback (local RAG + `bge-m3` embeddings) is always allowed. If egress is off, the
model menu falls back to a small bundled list and the Copilot stays offline.

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/ai/models` | Owner | Live OpenRouter model menu (+ offline fallback) |
| GET | `/api/ai/settings` | Owner | Current settings (key redacted to `*Set`) |
| PUT | `/api/ai/settings` | Owner | Save key / model policy / Open Notebook |
| POST | `/api/copilot/questions` | app-gated | Ask the Copilot |

## How the Copilot uses it

- Answers are grounded in the **curated Armenian legal registry** (`law-*`
  citations) — the source of record, gated on professional review.
- When Open Notebook is enabled, its hits appear as **supplemental sources**:
  clearly labelled, advisory, capped/deduped. They **never** satisfy the legal
  citation requirement and never change `status` / `confidence`.
- The model used per request follows the policy precedence
  **module → aspect → global default → auto**.

## Security

- Key never leaves the server raw; settings file is `0600`.
- Egress stays deny-until-listed; Open Notebook is opt-in.
- Copilot output is advisory — human review required before external use.

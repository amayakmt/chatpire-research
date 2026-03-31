# Chatpire Research — Application Description

**Chatpire Research** is a B2B lead workspace that feels like a spreadsheet but runs on a flexible database and **Google Gemini** for AI-generated columns. Import CSVs without a fixed schema, organize work in **boards**, and enrich thousands of rows with prompts, optional web search, and (optionally) **DropContact** for email discovery.

---

## Who it’s for

- **Sales & marketing ops** — Lists from exports, events, or scrapers in one place; add AI summaries, tags, or research without leaving the grid.
- **RevOps / data teams** — Repeatable enrichment flows via saved **prompt templates** instead of one-off scripts.
- **Anyone** who wants Clay-style “columns as workflows” without standing up a separate ETL stack for every campaign.

---

## What you can do

| Area | Capabilities |
|------|----------------|
| **Import** | Upload a CSV; pick columns to import. Data is sent in **200-row chunks** to stay within serverless-friendly payload limits. Each import creates a **board**. |
| **Grid** | Virtualized table (**10k+ rows**), resize/reorder/color columns, sort, double-click edit, row index, sticky headers. |
| **Row view** | Optional **start + limit** (persisted per board) to limit how many rows load in the browser for performance. Large **“run all”** AI jobs can **fetch the full slice from the API** when your selection exceeds what’s on screen. |
| **AI columns** | Multi-message prompts (system / user / assistant), `{{column}}` variables, temperature, optional **web search**, model choice (where not restricted). Run on 1 / 10 / 50 / 100 / **all** rows, with **exclude already processed** to skip filled cells. |
| **Templates** | Save, rename, delete prompt templates stored in Supabase. |
| **DropContact** | Optional column type: map name/company (and website) fields, run enrichment to find emails (requires `DROPCONTACT_API_KEY`). |
| **Export** | Download the board as CSV (fetches a large window from the API, not only the current row view). |
| **Demo deploy** | Set `NEXT_PUBLIC_DEMO_MODE=true` to cap the public demo (fixed model + row limits); see `lib/demoMode.ts` and `.env` examples. |

---

## How it works (conceptually)

1. **Browser** — Parses CSV with **Papa Parse**, shows preview and column selection, then calls Next.js API routes to create the board and insert leads.
2. **Supabase** — **Boards** and **column metadata** live in relational tables; each **lead** row is a JSON document (`data` JSONB) keyed by column UUIDs so renames don’t break storage.
3. **Enrichment** — The UI computes which row IDs to run (pending rows, limits, optional full-board fetch). The server calls **Gemini**, writes results back into `leads.data`, and the client **polls** `/api/leads` until cells show final values or a timeout.

Architecture in one line: **Next.js 14 (App Router) + TypeScript + Tailwind + TanStack Table/Virtual + Supabase + Gemini** (and optional DropContact).

---

## Notable product behaviors

- **Batched AI requests** — Rows are processed in small server batches to reduce serverless timeouts; the app sequences many requests for large runs.
- **Rate limits** — API routes apply per-IP limits so abuse is harder; limits are tuned so normal long runs are not cut off at trivial counts.
- **Column delete** — Removing a column cleans associated keys in lead JSON (RPC when available, with an app-side fallback).

---

## Tech stack (summary)

| Layer | Choices |
|-------|---------|
| Framework | Next.js 14, React 18, TypeScript |
| Data | Supabase (PostgreSQL, JSONB for row payloads) |
| AI | Google GenAI / Gemini |
| Table UI | TanStack Table, TanStack Virtual, dnd-kit |
| Styling | Tailwind CSS, shared UI primitives (shadcn-style) |

---

## Related docs

- **`README.md`** — Quick start, env vars, links.
- **`docs/TECHNICAL_REFERENCE.md`** — Schema, API inventory, deeper implementation notes.

---

## License

MIT (see repository `README.md` if otherwise stated).

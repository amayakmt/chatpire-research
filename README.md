# Chatpire Research

An AI-powered B2B lead enrichment platform — import CSVs, enrich rows with LLM-generated columns using reusable prompts, and work with large prospect datasets in a spreadsheet-style UI.

**Live demo:** coming soon.

## What it does

- **CSV import** — Upload any spreadsheet; columns are inferred with no fixed schema up front.
- **AI enrichment** — Add columns powered by prompts with `{{column}}` substitution from existing fields.
- **Rich prompting** — Multi-turn instructions plus optional **Google Search** grounding when you need live context.
- **Big grids** — Virtualized table for smooth interaction with **10,000+** rows.
- **Templates** — Save and reuse prompt templates for consistent enrichment workflows.

## Tech stack

| Area | Technologies |
|------|----------------|
| App | **Next.js 14** (App Router), **TypeScript** |
| Data | **Supabase** — PostgreSQL, **JSONB** for flexible row payloads |
| AI | **Google Gemini API** |
| UI | **TanStack Table**, **TanStack Virtual**, **Tailwind CSS**, **shadcn/ui**-style primitives |
| CSV | **PapaParse** (client-side parsing) |

## Architecture (high level)

The UI is a **Next.js** app with **serverless API routes** for boards, leads, columns, enrichment, and templates. **Supabase** is the system of record: relational tables for boards and column metadata, with each lead’s cell values stored in **JSONB** for schema-free CSV keys. Enrichment calls **Gemini** from the server; CSV files are parsed in the browser and sent to the API in **chunks** so payloads stay within typical serverless limits.

## Key technical decisions

- **JSONB + indexes** — Row data stays flexible per board; GIN indexes support efficient JSON queries as the dataset grows.
- **Virtual scrolling** — **TanStack Virtual** keeps DOM size bounded for very large boards.
- **Chunked import** — Inserts proceed in **200-row** batches to reduce request size and timeout risk on serverless hosts.
- **Prompt model** — Multi-shot templates and **per-column variables** make enrichment repeatable without one-off scripts.

## Getting started (local)

```bash
git clone <your-repo-url>
cd chatpire-research   # or your folder name
npm install
cp app/.env.example .env.local
# Edit .env.local with your keys (see below)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — **server only**; used by API routes |
| `GEMINI_API_KEY` | Google Gemini API key |
| `DROPCONTACT_API_KEY` | *(Optional)* Enables DropContact enrichment columns |

- Supabase keys: [Supabase Dashboard → Project Settings → API](https://supabase.com/dashboard/project/_/settings/api)  
- Gemini: [Google AI Studio](https://aistudio.google.com/apikey)

## Database setup

The app expects Supabase tables including **`boards`**, **`board_columns`**, **`leads`**, and **`prompt_templates`**, plus RPCs used for column lifecycle. **Full `CREATE TABLE` statements and API notes** are in [**docs/TECHNICAL_REFERENCE.md**](docs/TECHNICAL_REFERENCE.md). Two SQL helpers live at the repo root:

- **`SQL_BULK_REMOVE_COLUMN_KEYS.sql`** — RPC functions used by the column-delete endpoint to strip a deleted column's keys out of `leads.data`. Run once after creating the tables.
- **`MIGRATION_UUID_KEYS.sql`** — one-off migration of legacy name-based JSON keys to column UUIDs.

## Scope & limitations

This is a **portfolio / single-user demo**, not a hardened multi-tenant product. A few deliberate trade-offs worth knowing:

- **No authentication.** Server API routes use the Supabase **service-role key**, which **bypasses Row Level Security**. There is no user/tenant model, so all data is shared. Before any real deployment you'd add auth and per-user RLS policies (see [docs/TECHNICAL_REFERENCE.md](docs/TECHNICAL_REFERENCE.md) → *Row Level Security*).
- **In-memory rate limiting.** `lib/rateLimit.ts` is per-instance and resets on restart; a multi-instance deploy would need a shared store (e.g. Redis).
- **Demo mode.** Set `NEXT_PUBLIC_DEMO_MODE=true` to cap enrichment to Gemini 2.5 Flash Lite and 10 rows per run.

## License

MIT

---

*For exhaustive API routes, schema diagrams, and internal implementation notes, see [docs/TECHNICAL_REFERENCE.md](docs/TECHNICAL_REFERENCE.md).*

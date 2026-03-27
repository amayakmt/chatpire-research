# Chatpire Research

An AI-powered B2B lead enrichment platform — import CSVs, enrich rows with LLM-generated columns using reusable prompts, and work with large prospect datasets in a spreadsheet-style UI.

**Live demo:** `LIVE_DEMO_URL` — *coming soon; replace with your Vercel (or other) production URL after deploy.*

<!-- TODO: Add screenshot.png to repo root and verify image displays on GitHub -->

![Screenshot](screenshot.png)

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

The app expects Supabase tables including **`boards`**, **`board_columns`**, **`leads`**, and **`prompt_templates`**, plus RPCs used for column lifecycle (see the reference doc). **Full `CREATE TABLE` statements and API notes** are in [**docs/TECHNICAL_REFERENCE.md**](docs/TECHNICAL_REFERENCE.md). For migrating legacy name-based JSON keys to column UUIDs, see **`MIGRATION_UUID_KEYS.sql`** at the repo root.

## License

MIT

---

*For exhaustive API routes, schema diagrams, and internal implementation notes, see [docs/TECHNICAL_REFERENCE.md](docs/TECHNICAL_REFERENCE.md).*

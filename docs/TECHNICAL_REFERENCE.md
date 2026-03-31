# Chatpire Research

A **Clay-like** B2B Data Enrichment & Management Platform built with Next.js 14, TypeScript, Tailwind CSS, Shadcn UI, and Supabase. Import any CSV file, automatically generate dynamic data grids, and manage your leads with a powerful spreadsheet-like interface and AI enrichment.

For a high-level product and UX description, see [`APP_DESCRIPTION.md`](../APP_DESCRIPTION.md) at the repository root.

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Tech Stack & Packages](#tech-stack--packages)
4. [Getting Started](#getting-started)
5. [Architecture](#architecture)
6. [Database Schema](#database-schema)
7. [API Endpoints](#api-endpoints)
8. [Frontend Components](#frontend-components)
9. [Data Flow](#data-flow)
10. [Key Features Implementation](#key-features-implementation)
11. [Performance & Security](#performance--security)
12. [Future Enhancements](#future-enhancements)
13. [Troubleshooting](#troubleshooting)

---

## Overview

**Chatpire Research** is a high-performance spreadsheet interface for managing and enriching B2B lead data. It is designed as a "Clay-like" B2B data enrichment and management platform for handling large-scale lead data. The platform provides:

- **Zero-Configuration CSV Import**: Import any CSV structure without pre-configuration
- **Excel-like Interface**: Resizable columns, sorting, drag-and-drop reordering, color coding
- **Dynamic Column Generation**: Columns automatically generated from your data
- **AI-Powered Enrichment**: Generate new data columns using Google Gemini AI models
- **High Performance**: Virtual scrolling handles 10,000+ rows smoothly
- **Board System**: Organize data into separate projects/boards
- **Flexible Storage**: JSONB storage supports any CSV structure
- **Smart Column Management**: Persistent column configurations with type support

### Core Capabilities

- **Dynamic CSV Import**: Import any CSV structure without pre-configuration
- **Excel-like Interface**: Resizable columns, sorting, drag-and-drop reordering
- **Column Management**: Rename, reorder, delete, resize, and color-code columns
- **AI Enrichment**: Create AI-powered columns with multi-shot prompts using Gemini models
- **Prompt Templates**: Save and reuse AI prompts for consistent enrichment
- **Row View Controller**: Manage RAM usage with pagination controls
- **Cell Editing**: Double-click cells to edit with auto-save
- **High Performance**: Virtual scrolling handles 10,000+ rows smoothly
- **Board System**: Organize data into separate projects/boards
- **Flexible Storage**: JSONB storage supports any CSV structure

---

## Features

### Core Functionality

- **Fully Dynamic Data Grid**: Excel-like spreadsheet interface with virtualization for 10,000+ rows
- **Dynamic Column Generation**: Columns automatically generated from CSV data - zero configuration required
- **Board System**: Each CSV import creates a new board (project/folder) to organize your data
- **JSONB Storage**: All CSV columns stored in a flexible JSONB column, supporting any CSV structure
- **Chunked Import**: Large CSV files (10,000+ rows) processed in 500-row chunks with progress tracking
- **Real-time Progress**: Visual progress bar and status messages during import
- **Smart Error Handling**: Comprehensive error handling with toast notifications
- **Column Selection**: Choose which columns to import during CSV upload

### User Experience

- **Resizable Columns**: Drag column borders to resize like Excel
- **Sticky Headers**: Headers stay visible while scrolling through data
- **Auto-Detection**: URLs automatically detected and made clickable
- **Virtual Scrolling**: Smooth performance with thousands of rows
- **Horizontal Scrolling**: Handle many columns without layout issues
- **Responsive Design**: Works on desktop and tablet devices
- **Column Sorting**: A-Z / Z-A sorting with visual indicators
- **Column Reordering**: Drag-and-drop column headers to reorder
- **Column Coloring**: Color-code columns for visual organization
- **Auto-Resize**: Double-click resize handle to auto-fit column width
- **Row Index**: Numbered rows for easy reference

### AI Enrichment

- **AI Column Creation**: Create new columns powered by Google Gemini AI
- **Multi-Shot Prompting**: Build complex prompts with System, User, and Assistant messages
- **Prompt Templates**: Save, load, and manage reusable prompt templates
- **Model Selection**: Choose from multiple Gemini models (Pro, Flash, Flash-Lite)
- **Variable Substitution**: Use `{{columnName}}` syntax to inject column data into prompts
- **Web Search**: Enable web search for AI responses with source citations
- **View-Aware Processing**: Process only visible rows respecting current sort/filter
- **Real-time Updates**: See AI results appear in cells as they're generated
- **Metadata Tracking**: View token usage, confidence scores, and search queries

### Project Management

- **Dashboard**: View all boards in a grid layout
- **Board Rename**: Inline editing of board names
- **Board Deletion**: Delete boards with cascade deletion of leads
- **Optimistic Updates**: Instant UI feedback for better UX
- **Loading States**: Skeleton loaders and spinners during data fetch
- **Persistent Sorting**: Column sort state saved and restored on refresh
- **Row View Settings**: Control pagination with start/limit parameters

---

## Tech Stack & Packages

### Core Framework

- **Next.js 14.2.5** (App Router)
  - Server-side rendering and API routes
  - File-based routing system
  - Built-in optimization
  - Serverless API endpoints

- **React 18.3.1**
  - Component-based UI architecture
  - Hooks for state management
  - Concurrent features

- **TypeScript 5.5.4**
  - Type safety throughout the application
  - Better IDE support and error catching
  - Compile-time error detection

### UI & Styling

- **Tailwind CSS 3.4.7**
  - Utility-first CSS framework
  - Responsive design system
  - Custom configuration

- **Shadcn UI** (Custom Components)
  - Reusable UI component library
  - Built on Radix UI primitives
  - Components: Button, Dialog, Input, Table, Toast, Dropdown Menu, Alert Dialog, Skeleton, Loader

- **Lucide React 0.427.0**
  - Icon library (ArrowLeft, Upload, GripVertical, MoreVertical, Trash2, Palette, ArrowUpDown, etc.)

### Data Grid & Virtualization

- **@tanstack/react-table 8.20.5**
  - Powerful table/data grid library
  - Features: Sorting, column resizing, column management
  - Headless UI (fully customizable)
  - TypeScript support

- **@tanstack/react-virtual 3.11.1**
  - Virtual scrolling for performance
  - Only renders visible rows (handles 10,000+ rows)
  - Smooth scrolling experience
  - Efficient memory usage

### Drag & Drop

- **@dnd-kit/core 6.3.1**
  - Core drag-and-drop functionality
  - Collision detection
  - Accessibility support

- **@dnd-kit/sortable 10.0.0**
  - Sortable list functionality
  - Used for column reordering
  - Smooth animations

- **@dnd-kit/utilities 3.2.2**
  - Utility functions for drag-and-drop
  - CSS transform helpers

### Data Processing

- **papaparse 5.4.1**
  - Client-side CSV parsing
  - Handles large files efficiently
  - TypeScript support via @types/papaparse
  - Streaming support

### Backend & Database

- **@supabase/supabase-js 2.45.4**
  - Supabase JavaScript client
  - PostgreSQL database connection
  - Real-time capabilities (not currently used)
  - Row Level Security support

- **Supabase (PostgreSQL)**
  - Backend-as-a-Service
  - JSONB support for flexible data storage
  - Row Level Security (RLS)
  - Automatic API generation
  - Connection pooling

### Utilities

- **clsx 2.1.1** & **tailwind-merge 2.5.2**
  - Conditional className utilities
  - Merge Tailwind classes without conflicts

- **class-variance-authority 0.7.0**
  - Component variant management
  - Used in Shadcn UI components

### Development Tools

- **ESLint 8.57.0**
  - Code linting
  - Next.js configuration

- **PostCSS 8.4.40** & **Autoprefixer 10.4.19**
  - CSS processing
  - Browser compatibility

---

## Getting Started

### Prerequisites

- **Node.js 18+** and npm
- **A Supabase account** and project
- **Modern web browser** (Chrome, Firefox, Safari, Edge)

### Installation

1. **Install Dependencies**
   ```bash
   cd App
   npm install
   ```

2. **Configure Environment Variables**

   Create a `.env.local` file in the `App` directory:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   GEMINI_API_KEY=your_gemini_api_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

   **To get your Supabase credentials:**
   - Go to your [Supabase Dashboard](https://app.supabase.com)
   - Select your project
   - Navigate to **Settings** → **API**
   - Copy the **Project URL** and **anon public** key
   - For **Service Role Key**: Copy from the same page (keep this secret!)

   **To get your Gemini API key:**
   - Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Create a new API key
   - Copy and add to `.env.local`

   **Important**: 
   - File must be named exactly `.env.local` (not `.env.local.txt`)
   - Must be in the `App` directory (same level as `package.json`)
   - No spaces around `=`, no quotes needed
   - Never commit `.env.local` to git
   - `SUPABASE_SERVICE_ROLE_KEY` is required for server-side operations (bypasses RLS)

3. **Set Up Database**

   The database schema includes:
   - `boards` table for organizing imports
   - `board_columns` table for column configurations
   - `leads` table with JSONB `data` column and `row_order`
   - `prompt_templates` table for AI prompt templates
   - Proper indexes for performance
   - Row Level Security (RLS) policies

   **Note**: The database schema has evolved. Ensure you have:
   - `board_columns` table with proper structure
   - `row_order` column in `leads` table
   - `prompt_templates` table for template management
   - RLS policies configured for all tables

4. **Start Development Server**
   ```bash
   npm run dev
   ```

5. **Open in Browser**

   Navigate to [http://localhost:3000](http://localhost:3000)

   Click "Import CSV & Create Board" to import your first CSV file.

### Verify Setup

Visit `http://localhost:3000/api/health` to verify Supabase connection. Should see:
```json
{"status":"ok","message":"Supabase connection successful"}
```

---

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Dashboard  │  │  Board Page  │  │ CSV Importer │     │
│  │    (Home)    │  │  (Data Grid) │  │   (Modal)    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│         │                 │                  │             │
│         └─────────────────┼──────────────────┘             │
│                           │                                │
│                  ┌────────▼────────┐                        │
│                  │  API Routes     │                        │
│                  │  (Next.js API)  │                        │
│                  └────────┬────────┘                        │
└───────────────────────────┼─────────────────────────────────┘
                            │
                            │ HTTP Requests
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                    Supabase (PostgreSQL)                      │
│  ┌──────────────┐              ┌──────────────┐             │
│  │   boards     │              │    leads     │             │
│  │  (Projects)  │◄─────────────┤  (CSV Data)  │             │
│  └──────────────┘   Foreign Key  └──────────────┘             │
└───────────────────────────────────────────────────────────────┘
```

### File Structure

```
App/
├── app/
│   ├── api/                          # Next.js API routes
│   │   ├── boards/
│   │   │   ├── [id]/
│   │   │   │   └── route.ts         # GET, PATCH, DELETE board
│   │   │   ├── create/
│   │   │   │   └── route.ts         # POST create board
│   │   │   └── route.ts             # GET all boards
│   │   ├── columns/
│   │   │   ├── [id]/
│   │   │   │   └── route.ts         # GET, PATCH, DELETE column
│   │   │   ├── create/
│   │   │   │   └── route.ts         # POST create column
│   │   │   └── sync/
│   │   │       └── route.ts         # POST sync columns
│   │   ├── enrich/
│   │   │   └── start/
│   │   │       └── route.ts         # POST start AI enrichment
│   │   ├── leads/
│   │   │   ├── [id]/
│   │   │   │   └── route.ts         # PATCH update lead cell
│   │   │   ├── insert/
│   │   │   │   └── route.ts            # POST insert leads
│   │   │   ├── remove-column/
│   │   │   │   └── route.ts         # POST remove column data
│   │   │   └── route.ts             # GET leads by board_id
│   │   ├── prompt-templates/
│   │   │   └── route.ts             # CRUD for prompt templates
│   │   └── health/
│   │       └── route.ts             # GET health check
│   ├── dashboard/
│   │   ├── page.tsx                 # Dashboard home (all boards)
│   │   └── board/
│   │       └── [id]/
│   │           └── page.tsx          # Board data grid page
│   ├── layout.tsx                   # Root layout
│   ├── page.tsx                     # Home/landing page
│   └── globals.css                  # Global styles
├── components/
│   ├── ai-configuration-modal.tsx   # AI column configuration
│   ├── board/                       # Board-specific components
│   │   ├── BoardHeader.tsx          # Top bar with title & actions
│   │   ├── ColumnHeader.tsx         # Sortable column header
│   │   ├── DataRow.tsx              # Memoized table row
│   │   └── RowViewController.tsx    # Pagination controls
│   ├── cell-detail-panel.tsx        # Cell detail modal
│   ├── csv-importer.tsx             # CSV import modal
│   ├── message-editor.tsx           # Multi-shot prompt editor
│   ├── model-select.tsx             # Custom model selector
│   └── ui/                          # UI components
│       ├── alert-dialog.tsx
│       ├── button.tsx
│       ├── dialog.tsx
│       ├── dropdown-menu.tsx
│       ├── input.tsx
│       ├── label.tsx
│       ├── loader.tsx
│       ├── popover.tsx
│       ├── select.tsx
│       ├── sheet.tsx
│       ├── skeleton.tsx
│       ├── slider.tsx
│       ├── switch.tsx
│       ├── table.tsx
│       ├── textarea.tsx
│       └── toast.tsx
├── hooks/
│   ├── useBoardData.ts              # Board & leads data fetching
│   └── useColumnManager.ts          # Column CRUD operations
├── lib/
│   ├── supabase.ts                  # Supabase client
│   ├── types.ts                     # TypeScript types
│   └── utils.ts                     # Utility functions
├── package.json                     # Dependencies
├── tsconfig.json                    # TypeScript config
├── tailwind.config.ts              # Tailwind config
├── next.config.js                   # Next.js config
└── README.md                        # This file
```

---

## Database Schema

### Tables

#### `boards` Table

Stores board/project information.

```sql
CREATE TABLE boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  columns JSONB DEFAULT '[]'::jsonb,  -- Legacy: kept for backward compatibility
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Fields:**
- `id`: Unique identifier (UUID)
- `name`: Board/project name (from CSV filename)
- `columns`: JSONB (legacy format, kept for backward compatibility)
- `created_at`: Timestamp of creation

**Note**: Column configurations are now stored in the `board_columns` table (see below).

#### `board_columns` Table

Stores column configurations with type support and persistent settings.

```sql
CREATE TABLE board_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',  -- 'text', 'ai_enrichment', etc.
  order INTEGER NOT NULL DEFAULT 0,
  config JSONB DEFAULT '{}'::jsonb,  -- Stores width, color, AI settings, etc.
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Fields:**
- `id`: Unique identifier (UUID)
- `board_id`: Foreign key to `boards` table (CASCADE delete)
- `name`: Column display name (exact as uploaded)
- `type`: Column type (`'text'`, `'ai_enrichment'`, etc.)
- `order`: Display order (for left-to-right positioning)
- `config`: JSONB storing:
  ```json
  {
    "width": 200,
    "color": "#3b82f6",
    "messages": [...],  // For AI columns: multi-shot prompts
    "model": "gemini-2.5-flash",
    "temperature": 0.0,
    "useWebSearch": false
  }
  ```
- `created_at`: Timestamp of creation

**Indexes:**
- Foreign key index on `board_id`
- Index on `order` for sorting

#### `leads` Table

Stores all CSV row data in flexible JSONB format.

```sql
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  row_order FLOAT,  -- For persistent row ordering
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Fields:**
- `id`: Unique identifier (UUID)
- `board_id`: Foreign key to `boards` table (CASCADE delete)
- `data`: JSONB storing entire CSV row and AI-generated data
  ```json
  {
    "profileUrl": "https://linkedin.com/in/johndoe",
    "fullName": "John Doe",
    "companyName": "Acme Corp",
    "email": "john@acme.com",
    "aiSummary": {
      "type": "ai_rich_text",
      "value": "Generated summary...",
      "metadata": {
        "tokenCount": 150,
        "confidenceScore": 0.85,
        "searchQuery": "Acme Corp company information"
      }
    }
  }
  ```
- `row_order`: FLOAT for persistent row ordering (lexicographical sorting)
- `created_at`: Timestamp of creation

**Indexes:**
- `idx_leads_board_id`: Fast lookups by board
- `idx_leads_created_at`: For sorting by date
- `idx_leads_data`: GIN index for JSONB queries
- Index on `row_order` for stable sorting

#### `prompt_templates` Table

Stores reusable AI prompt templates.

```sql
CREATE TABLE prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  content TEXT NOT NULL,  -- JSON string of messages array or plain text
  tags TEXT[] DEFAULT '{}',
  is_favorite BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Fields:**
- `id`: Unique identifier (UUID)
- `name`: Template name
- `content`: Template content (JSON messages array or plain text)
- `tags`: Array of tags for organization
- `is_favorite`: Favorite flag
- `created_at`: Timestamp of creation

### Relationships

- **One-to-Many**: `boards` → `leads` (one board has many leads)
- **One-to-Many**: `boards` → `board_columns` (one board has many columns)
- **CASCADE Delete**: Deleting a board automatically deletes all associated leads and columns

### Row Level Security (RLS)

Currently configured for development (allows all operations):
- Boards: Public read/write
- Leads: Public read/write

**Production Note**: Should implement proper authentication and user-based policies.

---

## API Endpoints

All API routes are in `app/api/` directory using Next.js App Router.

### Board Endpoints

#### `GET /api/boards`
**Purpose**: Fetch all boards for dashboard

**Response**:
```json
{
  "boards": [
    {
      "id": "uuid",
      "name": "Board Name",
      "created_at": "2024-01-01T00:00:00Z",
      "leadCount": 1000
    }
  ]
}
```

#### `GET /api/boards/[id]`
**Purpose**: Fetch a specific board with column configurations

**Response**:
```json
{
  "board": {
    "id": "uuid",
    "name": "Board Name",
    "columns": [
      {
        "id": "uuid",
        "name": "Column Name",
        "type": "text",
        "order": 0,
        "config": { "width": 200, "color": "#3b82f6" }
      }
    ],
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

**Note**: Columns are now fetched from `board_columns` table, not from `boards.columns` JSONB.

#### `POST /api/boards/create`
**Purpose**: Create a new board and insert first chunk of leads

**Request Body**:
```json
{
  "boardName": "My Board",
  "firstChunk": [
    { "data": { "column1": "value1" } },
    ...
  ]
}
```

**Response**:
```json
{
  "boardId": "uuid",
  "inserted": 500,
  "message": "Board created successfully"
}
```

#### `PATCH /api/boards/[id]`
**Purpose**: Update board name or column configurations

**Request Body** (either or both):
```json
{
  "name": "New Board Name",
  "columns": { "configs": [...], "deletedIds": [] }
}
```

**Response**:
```json
{
  "board": { ...updated board object }
}
```

#### `DELETE /api/boards/[id]`
**Purpose**: Delete a board and all associated leads (CASCADE)

**Response**:
```json
{
  "message": "Board deleted successfully",
  "deleted": [...]
}
```

### Lead Endpoints

#### `GET /api/leads?board_id=[id]`
**Purpose**: Fetch leads for a specific board (with pagination)

**Query Parameters**:
- `board_id`: UUID of the board
- `start`: Starting row index (default: 0)
- `limit`: Maximum number of rows to fetch (optional, null = all rows)

**Response**:
```json
{
  "leads": [
    {
      "id": "uuid",
      "board_id": "uuid",
      "data": { ... },
      "row_order": 1.0,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 2125
}
```

**Pagination**: 
- Fetches rows starting from `start` index
- Limits to `limit` rows if provided
- Returns `total` count of all rows in board
- Always ordered by `row_order`, `created_at`, `id` for stability

#### `POST /api/leads/insert`
**Purpose**: Insert additional chunks of leads into existing board

**Request Body**:
```json
{
  "boardId": "uuid",
  "leads": [
    { "data": { "column1": "value1" } },
    ...
  ]
}
```

**Response**:
```json
{
  "inserted": 500,
  "message": "Leads inserted successfully"
}
```

#### `PATCH /api/leads/[id]`
**Purpose**: Update a single cell value in a lead

**Request Body**:
```json
{
  "path": "columnName",
  "value": "new value"
}
```

**Response**:
```json
{
  "lead": { ...updated lead object }
}
```

#### `POST /api/leads/remove-column`
**Purpose**: Remove a column's data from all leads in a board

**Request Body**:
```json
{
  "boardId": "uuid",
  "columnId": "columnKey"
}
```

**Response**:
```json
{
  "message": "Column data removed successfully",
  "updated": 1000
}
```

**Implementation**: Uses Supabase RPC function for instant deletion

### Column Endpoints

#### `POST /api/columns/create`
**Purpose**: Create a new column (text or AI enrichment)

**Request Body**:
```json
{
  "boardId": "uuid",
  "name": "Column Name",
  "type": "text" | "ai_enrichment",
  "config": {}
}
```

**Response**:
```json
{
  "column": { ...column object }
}
```

#### `GET /api/columns/[id]`
**Purpose**: Fetch a single column configuration

**Response**:
```json
{
  "column": {
    "id": "uuid",
    "name": "Column Name",
    "type": "ai_enrichment",
    "config": { ... }
  }
}
```

#### `PATCH /api/columns/[id]`
**Purpose**: Update column name, order, or configuration

**Request Body**:
```json
{
  "name": "New Name",  // Optional
  "order": 2,          // Optional
  "config": { ... }    // Optional
}
```

**Response**:
```json
{
  "column": { ...updated column object }
}
```

#### `DELETE /api/columns/[id]`
**Purpose**: Delete a column and its data from all leads

**Query Parameters**:
- `board_id`: UUID of the board (for backward compatibility)

**Response**:
```json
{
  "message": "Column deleted successfully"
}
```

### AI Enrichment Endpoints

#### `POST /api/enrich/start`
**Purpose**: Start AI enrichment job for a column

**Request Body**:
```json
{
  "boardId": "uuid",
  "columnId": "uuid",
  "rowIds": ["uuid1", "uuid2", ...],  // Optional: specific rows to process
  "excludeProcessed": true           // Optional: skip rows with existing data
}
```

**Response**:
```json
{
  "message": "Enrichment started",
  "processing": 10
}
```

**Features**:
- Uses saved column configuration (prompt, model, etc.)
- Processes rows in batches
- Stores results with metadata (token count, confidence, search query)
- Supports multi-shot prompting (System, User, Assistant messages)

### Prompt Template Endpoints

#### `GET /api/prompt-templates`
**Purpose**: Fetch all prompt templates

**Response**:
```json
{
  "templates": [
    {
      "id": "uuid",
      "name": "Template Name",
      "content": "...",
      "tags": ["tag1"],
      "is_favorite": false,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

#### `POST /api/prompt-templates`
**Purpose**: Create a new prompt template

**Request Body**:
```json
{
  "name": "Template Name",
  "content": "..." // JSON string or plain text
}
```

#### `PATCH /api/prompt-templates`
**Purpose**: Rename a template

**Request Body**:
```json
{
  "id": "uuid",
  "name": "New Name"
}
```

#### `DELETE /api/prompt-templates`
**Purpose**: Delete a template

**Request Body**:
```json
{
  "id": "uuid"
}
```

### Health Check

#### `GET /api/health`
**Purpose**: Verify Supabase connection

**Response**:
```json
{
  "status": "ok",
  "supabase": "connected"
}
```

---

## Frontend Components

### Page Components

#### `app/dashboard/page.tsx`
**Purpose**: Dashboard home page showing all boards

**Features**:
- Lists all boards in a grid
- Board cards with name, date, row count
- Import CSV button
- Board management (rename, delete)
- Optimistic updates for better UX
- Loading skeletons
- Manual refresh button

**State Management**:
- `boards`: Array of board objects
- `isLoading`: Loading state
- `isImportModalOpen`: CSV import modal state
- `editingBoardId`: Currently editing board
- `deletingBoardId`: Currently deleting board

#### `app/dashboard/board/[id]/page.tsx`
**Purpose**: Main data grid page for a specific board

**Features**:
- Dynamic column generation from `board_columns` table
- Virtual scrolling (TanStack Virtual)
- Column management (rename, reorder, delete, resize, color)
- Sorting (A-Z, Z-A) with persistent state
- Sticky headers and row index column
- Drag-and-drop column reordering
- Cell editing (double-click to edit)
- AI column configuration and execution
- Row view controller for pagination
- URL detection and formatting

**Architecture**:
- Uses `useBoardData` hook for data fetching
- Uses `useColumnManager` hook for column operations
- Modular components: `BoardHeader`, `ColumnHeader`, `DataRow`

**State Management**:
- Managed by custom hooks (`useBoardData`, `useColumnManager`)
- `sorting`: TanStack Table sorting state (persisted to localStorage)
- `editingCell`: Currently editing cell state
- `selectedCell`: Cell detail panel state
- `selectedAIColumn`: AI configuration modal state

**Key Functions**:
- `handleDragEnd()`: Handle column reordering
- `handleRunAIColumn()`: Execute AI enrichment
- `handleSaveAIConfigWrapper()`: Save AI column configuration
- `handleOpenRenameDialog()`: Open column rename dialog

### Reusable Components

#### `components/csv-importer.tsx`
**Purpose**: CSV import modal with column selection

**Features**:
- File upload and parsing (PapaParse)
- Column selection checkboxes
- Select All / Deselect All buttons
- Preview of first 5 rows
- Chunked import with progress tracking
- Error handling and validation
- Real-time progress updates

**State Management**:
- `file`: Selected CSV file
- `headers`: Detected column names
- `selectedColumns`: Set of selected columns
- `preview`: First 5 rows for preview
- `progress`: Import progress state
- `isImporting`: Loading state

**Import Flow**:
1. Parse CSV on client (PapaParse)
2. Show column selection UI
3. Split data into 500-row chunks
4. Create board with first chunk
5. Insert remaining chunks sequentially
6. Show progress bar
7. Redirect to new board

#### `components/ai-configuration-modal.tsx`
**Purpose**: Configure and run AI enrichment columns

**Features**:
- Multi-shot prompt editor (System, User, Assistant messages)
- Model selection (Gemini Pro, Flash, Flash-Lite)
- Prompt template management
- Variable substitution (`{{columnName}}`)
- Temperature and web search controls
- Run options (exclude processed rows, row limit)
- Real-time execution status

#### `components/board/*`
**Purpose**: Board-specific UI components

**Components**:
- `BoardHeader.tsx`: Top bar with title, row count, action buttons
- `ColumnHeader.tsx`: Sortable column header with drag-and-drop, menu, AI config button
- `DataRow.tsx`: Memoized table row component for performance
- `RowViewController.tsx`: Pagination controls (start/limit)

#### `components/cell-detail-panel.tsx`
**Purpose**: Display detailed cell information

**Features**:
- Shows full cell value
- Displays AI metadata (tokens, confidence, search query)
- Source citations for web search results
- Model information

#### `components/message-editor.tsx`
**Purpose**: Multi-shot prompt editor for AI columns

**Features**:
- Add/remove message blocks
- Role selection (System, User, Assistant)
- Variable autocomplete
- Auto-growing textareas

#### `components/model-select.tsx`
**Purpose**: Custom model selector dropdown

**Features**:
- Grouped by model type (Pro vs Flash)
- Pricing information
- "NEW" badges
- Premium highlighting

#### `components/ui/*`
**Purpose**: Reusable UI components (Shadcn UI style)

**Components**:
- `button.tsx`: Button with variants
- `dialog.tsx`: Modal dialog
- `input.tsx`: Text input
- `table.tsx`: Table primitives
- `toast.tsx`: Toast notifications
- `dropdown-menu.tsx`: Dropdown menu
- `alert-dialog.tsx`: Confirmation dialogs
- `popover.tsx`: Popover component
- `select.tsx`: Select dropdown
- `switch.tsx`: Toggle switch
- `slider.tsx`: Range slider
- `textarea.tsx`: Multi-line input
- `skeleton.tsx`: Loading skeletons
- `loader.tsx`: Loading spinner

### Utility Components

#### `hooks/useBoardData.ts`
**Purpose**: Custom hook for board and leads data management

**Features**:
- Fetches board and leads data
- Manages pagination (viewStart, viewLimit)
- Persists pagination settings to localStorage
- Provides refetch functions

#### `hooks/useColumnManager.ts`
**Purpose**: Custom hook for column operations

**Features**:
- Column CRUD operations
- Column renaming
- Column deletion with data cleanup
- AI column creation and configuration
- Color management
- Debounced saving

#### `lib/types.ts`
**Purpose**: TypeScript type definitions

**Interfaces**:
- `ColumnConfig`: Column configuration object (with `config` for AI settings)
- `Board`: Board object (with `columns` array from `board_columns` table)
- `Lead`: Lead object with JSONB data and `row_order`
- `CSVRow`: CSV row structure
- `Message`: AI prompt message structure

#### `lib/utils.ts`
**Purpose**: Utility functions

**Functions**:
- `cn()`: Merge Tailwind classes
- `formatColumnHeader()`: Convert "camelCase" to "Title Case"
- `isUrl()`: Detect if string is a URL

#### `lib/supabase.ts`
**Purpose**: Supabase client initialization

**Features**:
- Environment variable validation
- Error handling for missing credentials
- Client export for use throughout app

---

## Data Flow

### CSV Import Flow

```
1. User selects CSV file
   ↓
2. PapaParse parses CSV on client
   ↓
3. Extract headers and show preview
   ↓
4. User selects columns to import
   ↓
5. Split data into 500-row chunks
   ↓
6. POST /api/boards/create (first chunk)
   → Creates board in database
   → Inserts first 500 rows
   → Returns boardId
   ↓
7. For each remaining chunk:
   POST /api/leads/insert
   → Inserts chunk into existing board
   → Updates progress bar
   ↓
8. Redirect to /dashboard/board/[boardId]
```

### Board Load Flow

```
1. User navigates to /dashboard/board/[id]
   ↓
2. GET /api/boards/[id]
   → Fetches board with column configs
   → Loads saved column configurations
   ↓
3. GET /api/leads?board_id=[id]
   → Fetches all leads (paginated)
   → Returns leads with JSONB data
   ↓
4. Generate columns from:
   - `board_columns` table (new system)
   - OR saved column configs in `boards.columns` JSONB (legacy)
   - OR scan leads data for keys (fallback)
   ↓
5. Render TanStack Table with:
   - Virtual scrolling
   - Column configurations
   - Sorting state
   ↓
6. User interactions update state
   → Save to database on change
```

### Column Management Flow

```
1. User modifies column (rename/reorder/delete/resize/color)
   ↓
2. Update local state (columnConfigs)
   ↓
3. Call saveColumnConfig() or saveColumnConfigDebounced()
   ↓
4. PATCH /api/columns/[id] (new system)
   → Updates column in board_columns table
   OR
   PATCH /api/boards/[id] (legacy)
   → Updates columns JSONB in database
   ↓
5. Refresh board to get updated columns
   ↓
6. On refresh:
   → Load columns from board_columns table
   → Apply saved configurations
```

### AI Enrichment Flow

```
1. User creates AI column or clicks sparkle icon on existing AI column
   ↓
2. Opens AI Configuration Modal
   ↓
3. User configures:
   - Multi-shot prompt (System, User, Assistant messages)
   - Model selection (Gemini Pro/Flash)
   - Temperature, web search settings
   ↓
4. User clicks "Save Configuration"
   → PATCH /api/columns/[id]
   → Saves config to board_columns.config JSONB
   ↓
5. User clicks "Run Column"
   → Frontend calculates pending row IDs from current view
   → POST /api/enrich/start with rowIds
   ↓
6. Backend processes rows:
   - Fetches column config from board_columns
   - Replaces variables in prompts ({{columnName}})
   - Calls Gemini API with messages
   - Stores result in leads.data[columnName]
   - Includes metadata (tokens, confidence, search query)
   ↓
7. Frontend polls for updates:
   → GET /api/leads?board_id=[id]
   → Checks for completed rows
   → Updates UI in real-time
   ↓
8. Results appear in table cells as they complete
```

---

## Key Features Implementation

### 1. Dynamic Column Generation

**Location**: `app/dashboard/board/[id]/page.tsx`

**Process**:
1. Scan first 50 rows to collect all unique keys
2. Generate `ColumnConfig` objects for each key
3. Calculate initial width based on content
4. Save to database if no saved config exists
5. Use saved config if available

**Code**:
```typescript
function generateInitialColumnConfig(leads: Lead[]): ColumnConfig[] {
  const allKeys = new Set<string>()
  leads.slice(0, 50).forEach(lead => {
    Object.keys(lead.data || {}).forEach(key => allKeys.add(key))
  })
  
  return Array.from(allKeys).map((key, index) => ({
    id: key,
    header: formatColumnHeader(key),
    width: calculateWidth(key, leads),
    order: index,
    visible: true
  }))
}
```

### 2. Virtual Scrolling

**Library**: `@tanstack/react-virtual`

**Implementation**:
```typescript
const rowVirtualizer = useVirtualizer({
  count: rows.length,
  getScrollElement: () => parentRef,
  estimateSize: () => 35,
  overscan: 10,
})
```

**Benefits**:
- Only renders visible rows
- Handles 10,000+ rows smoothly
- Efficient memory usage

### 3. Column Reordering

**Library**: `@dnd-kit/sortable`

**Implementation**:
- Drag handle on column header
- `SortableContext` wraps headers
- `handleDragEnd` updates order indices
- Saves to database immediately

### 4. Column Deletion with Data Cleanup

**Process**:
1. User clicks "Delete Column"
2. POST /api/leads/remove-column
3. Removes column key from all leads' JSONB data
4. Updates column configs (removes from array)
5. Adds to `deletedIds` to prevent re-adding
6. Refreshes leads data

**Database Operation**:
```typescript
// Uses PostgreSQL JSONB operator
const { error } = await supabase
  .from('leads')
  .update({ data: `data - '${columnId}'` as any })
  .eq('board_id', boardId)
```

### 5. Column Color Coding

**Implementation**:
- Color stored in `ColumnConfig.color` (hex code)
- Applied as background color with opacity
- 12 predefined colors + default
- Saved to database with column configs

### 6. Sorting

**Library**: `@tanstack/react-table`

**Features**:
- Click header to sort ascending
- Click again for descending
- Click third time to clear
- Custom sorting function handles:
  - Numeric values
  - String values (case-insensitive)
  - Empty/null values (placed at end)

### 7. Chunked Import

**Why**: Prevents timeout on large files

**Process**:
- Parse entire CSV on client
- Split into 500-row chunks
- First chunk creates board
- Remaining chunks inserted sequentially
- Progress bar shows status

**Code**:
```typescript
const CHUNK_SIZE = 500
const chunks = []
for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
  chunks.push(rows.slice(i, i + CHUNK_SIZE))
}
```

---

## Performance & Security

### Performance Optimizations

#### Frontend
1. **Virtual Scrolling**: Only renders visible rows
2. **Column Virtualization**: Efficient horizontal scrolling
3. **Debounced Saves**: Column resize saves debounced (500ms)
4. **Memoization**: `useMemo` for column definitions
5. **Optimistic Updates**: UI updates before API response

#### Backend
1. **Batch Inserts**: 1000 rows per Supabase insert
2. **Pagination**: Fetches leads in 1000-row batches
3. **Indexes**: GIN indexes on JSONB columns
4. **CASCADE Delete**: Efficient cleanup of related data

#### Database
1. **JSONB Storage**: Flexible schema, efficient queries
2. **GIN Indexes**: Fast JSONB key lookups
3. **Foreign Key Indexes**: Fast board_id lookups
4. **Connection Pooling**: Handled by Supabase

### Security Considerations

#### Current State (Development)
- **RLS Enabled**: Row Level Security is enabled
- **Public Policies**: Currently allows all operations
- **No Authentication**: No user authentication implemented

#### Production Recommendations
1. **Implement Authentication**: Supabase Auth or NextAuth.js
2. **User-Based RLS**: Restrict access to user's own boards
3. **API Rate Limiting**: Prevent abuse
4. **Input Validation**: Validate all user inputs
5. **CSRF Protection**: Next.js built-in CSRF protection
6. **Environment Variables**: Never commit `.env.local`

---

## Future Enhancements

### Planned Features

1. **CSV Export**: Download enriched data
2. **Advanced Filtering**: Multi-column filters
3. **Bulk Operations**: Select and modify multiple rows
4. **Search**: Full-text search across all columns
5. **User Authentication**: Multi-user support
6. **Team Collaboration**: Share boards with team members
7. **Job Queue**: Async processing for large AI enrichment jobs
8. **Cost Tracking**: Track AI API usage and costs

### AI Enrichment (Implemented)

The AI enrichment system is **fully implemented** with:

1. **Multi-Shot Prompting**: Support for System, User, and Assistant messages
2. **Google Gemini Integration**: Multiple model support (Pro, Flash, Flash-Lite)
3. **Prompt Templates**: Save and reuse prompts
4. **Variable Substitution**: `{{columnName}}` syntax for dynamic prompts
5. **Web Search**: Optional web search with source citations
6. **Metadata Tracking**: Token usage, confidence scores, search queries
7. **View-Aware Processing**: Process only visible rows respecting sort/filter
8. **Real-time Updates**: Results appear in cells as they're generated
9. **Persistent Configuration**: Column settings saved to database

**Current Implementation**:
- AI columns stored in `board_columns` table with type `'ai_enrichment'`
- Configuration stored in `config` JSONB (messages, model, temperature, etc.)
- Results stored in `leads.data[columnName]` with metadata
- Frontend-driven execution (sends specific row IDs)
- Polling mechanism for real-time updates

### Architecture Improvements

1. **Job Queue**: For async AI enrichment (BullMQ/Inngest)
2. **Caching**: Redis for frequently accessed data
3. **Real-time Updates**: Supabase real-time subscriptions
4. **Webhooks**: For external integrations
5. **Analytics**: Track usage and performance

---

## Troubleshooting

### Import Issues

**Problem**: Import stuck on "Importing..."  
**Solution**: 
- Check browser console for errors
- Verify Supabase connection in `.env.local`
- Ensure database tables exist
- Check file size (very large files may take time)

**Problem**: "Failed to create board" error  
**Solution**:
- Verify Supabase credentials
- Check RLS policies allow inserts
- Ensure `boards` table exists

**Problem**: Progress bar not updating  
**Solution**:
- Check network tab for failed requests
- Verify chunk size (should be 500 rows)
- Check browser console for JavaScript errors

### Display Issues

**Problem**: Columns not showing  
**Solution**:
- Refresh the page
- Check that leads have data in JSONB column
- Verify board_id matches between boards and leads
- Check `deletedIds` in column config

**Problem**: Table is slow  
**Solution**:
- Check number of rows (virtualization helps but very large datasets may lag)
- Reduce number of columns if possible
- Check browser performance tab

**Problem**: Column changes reset on refresh  
**Solution**:
- Verify columns are saved to `board_columns` table
- Check that `useColumnManager` hook is properly initialized
- Ensure `hasInitialized` flag is working correctly

**Problem**: AI enrichment not updating cells  
**Solution**:
- Check browser console for polling errors
- Verify column name matches between frontend and backend
- Check that `rowIds` are being sent correctly
- Verify Gemini API key is set in environment variables

### Database Issues

**Problem**: Can't query data  
**Solution**:
- Verify RLS policies allow SELECT
- Check that indexes exist
- Verify foreign key relationships

**Problem**: Environment variables not loading  
**Solution**:
- Check file name: Must be exactly `.env.local` (not `.env.local.txt`)
- Check location: Must be in the `App` directory (same level as `package.json`)
- Check format: No spaces around `=`, no quotes needed
- Restart Next.js dev server after creating `.env.local`

### Common Errors

**Error**: "Missing Supabase environment variables"  
**Fix**: Follow environment setup steps above

**Error**: "Board not found"  
**Fix**: Verify board exists in database, check board_id in URL

**Error**: "Column not found"  
**Fix**: Check column exists in `columnConfigs`, verify not in `deletedIds`

### Debug Tools

- **Browser Console**: Check for JavaScript errors
- **Network Tab**: Inspect API requests/responses
- **Supabase Dashboard**: View database directly
- **Next.js Dev Tools**: React DevTools for component inspection
- **Health Endpoint**: Visit `/api/health` to verify connection

---

## Development Workflow

### Local Development

1. **Setup**:
   ```bash
   cd App
   npm install
   cp .env.example .env.local  # If .env.example exists
   # Add Supabase credentials to .env.local
   ```

2. **Database**:
   - Ensure all tables exist: `boards`, `board_columns`, `leads`, `prompt_templates`
   - Verify `row_order` column exists in `leads` table
   - Check RLS policies are configured

3. **Run**:
   ```bash
   npm run dev
   ```

4. **Build**:
   ```bash
   npm run build
   npm start
   ```

### Deployment

1. **Environment**: Set environment variables in hosting platform
2. **Database**: Ensure Supabase project is accessible
3. **Build**: Next.js builds static and server components
4. **API Routes**: Deployed as serverless functions

---

## Conclusion

Chatpire Research is built with modern web technologies, focusing on performance, flexibility, and user experience. The architecture supports:

- **Scalability**: Handles large datasets efficiently
- **Flexibility**: JSONB storage supports any CSV structure
- **Maintainability**: TypeScript and clear code structure
- **Extensibility**: Easy to add new features on top of the existing AI enrichment system

The platform is production-ready for B2B lead data management and already includes a robust AI enrichment engine for at-scale data transformation and analysis.

---

**Last Updated**: 2026 Feb 10  
**Version**: 0.1.1  
**Maintainer**: Chatpire Development Team

# Chatpire Research - Application Description

## Overview

**Chatpire Research** is a sophisticated B2B data enrichment and management platform designed to function as a "Clay-like" solution for handling large-scale lead data. Built with modern web technologies, it provides a powerful spreadsheet-like interface for importing, organizing, enriching, and managing business lead information with AI-powered capabilities.

## What It Does

Chatpire Research serves as a comprehensive data management system that allows users to:

1. **Import and Organize CSV Data**: Import any CSV file structure without pre-configuration, automatically generating dynamic data grids that adapt to the imported data structure.

2. **Manage Lead Data**: Organize data into separate "boards" (projects/folders), each representing a different dataset or campaign. Users can view, edit, sort, filter, and manipulate data through an Excel-like interface.

3. **AI-Powered Data Enrichment**: Create new data columns powered by Google Gemini AI models. Users can generate insights, summaries, classifications, or any custom data transformations using natural language prompts.

4. **Flexible Data Storage**: Store data in a flexible JSONB format that supports any CSV structure without requiring schema changes.

## What It Serves To Do

The platform addresses several key business needs:

### Primary Use Cases

1. **Lead Management**: Sales and marketing teams can import lead lists, organize them by campaign or source, and manage them in a familiar spreadsheet interface.

2. **Data Enrichment**: Automatically enhance lead data with AI-generated insights. For example:
   - Generate company summaries based on available data
   - Classify leads by industry or intent
   - Extract key information from unstructured data
   - Create personalized messaging based on lead attributes

3. **Data Organization**: Organize multiple datasets into separate boards, making it easy to manage different campaigns, sources, or projects independently.

4. **Data Analysis Preparation**: Prepare and clean data for analysis by allowing easy manipulation, sorting, filtering, and enrichment of datasets.

5. **B2B Sales Intelligence**: Help sales teams understand their leads better by automatically generating insights and summaries about companies and contacts.

## How It Works

### Architecture

The application follows a modern full-stack architecture:

- **Frontend**: Next.js 14 with React 18, using the App Router for server-side rendering and client-side interactivity
- **Backend**: Next.js API routes serving as serverless functions
- **Database**: Supabase (PostgreSQL) with JSONB storage for flexible schema
- **UI Framework**: Tailwind CSS with Shadcn UI components for a modern, responsive interface

### Core Functionality Flow

#### 1. CSV Import Process

```
User uploads CSV → Client-side parsing (PapaParse) → Column selection UI → 
Chunked import (500 rows per chunk) → Database storage (JSONB) → 
Automatic column generation → Board creation
```

- Files are parsed entirely on the client side for privacy and performance
- Large files (10,000+ rows) are processed in 500-row chunks to prevent timeouts
- Each import creates a new "board" (project) to organize data
- Columns are automatically detected and configured

#### 2. Data Grid Interface

The main interface provides:

- **Virtual Scrolling**: Only renders visible rows, handling 10,000+ rows smoothly
- **Dynamic Columns**: Columns automatically generated from data structure
- **Excel-like Features**:
  - Resizable columns (drag borders)
  - Sortable columns (A-Z, Z-A)
  - Drag-and-drop column reordering
  - Color-coded columns for visual organization
  - Double-click cell editing with auto-save
  - Sticky headers while scrolling

- **Column Management**:
  - Rename columns
  - Delete columns (with cascade data cleanup)
  - Reorder columns
  - Resize columns
  - Color-code columns

#### 3. AI Enrichment System

The AI enrichment feature is a sophisticated multi-step process:

**Configuration Phase:**
1. User creates or selects an AI column
2. Configures multi-shot prompts (System, User, Assistant messages)
3. Selects AI model (Gemini Pro, Flash, or Flash-Lite)
4. Sets parameters (temperature, web search, etc.)
5. Uses variable substitution: `{{columnName}}` syntax to inject data into prompts

**Execution Phase:**
1. Frontend calculates which rows need processing (respects current sort/filter)
2. Sends specific row IDs to backend (view-aware execution)
3. Backend processes rows in batches (5 concurrent requests)
4. For each row:
   - Extracts variables from prompt
   - Replaces `{{variable}}` with actual data values
   - Calls Google Gemini API with configured messages
   - Stores result with metadata (tokens, confidence, sources)
5. Results appear in real-time as batches complete
6. Updates are saved incrementally to database

**Advanced Features:**
- **Multi-shot Prompting**: Supports conversation history with System, User, and Assistant messages
- **Variable Resolution**: Smart matching of variable names to column data (handles UUID-based storage)
- **Web Search Integration**: Optional Google Search grounding for fact-checked responses
- **Metadata Tracking**: Stores token usage, confidence scores, search queries, and source citations
- **Skip Processed Rows**: Automatically skips rows that already have valid data
- **Error Handling**: Gracefully handles API errors and stores error metadata

#### 4. Data Storage

**Database Schema:**
- `boards`: Stores project/board information
- `board_columns`: Stores column configurations (name, type, order, width, color, AI settings)
- `leads`: Stores all row data in JSONB format (flexible schema)
- `prompt_templates`: Stores reusable AI prompt templates

**Key Design Decisions:**
- JSONB storage allows any CSV structure without schema changes
- Column configurations stored separately for persistence
- UUID-based column IDs for reliable data mapping
- Row ordering preserved for stable sorting

### Technical Implementation Details

#### Performance Optimizations

1. **Virtual Scrolling**: Only renders visible rows using `@tanstack/react-virtual`
2. **Batch Processing**: AI enrichment processes 5 rows concurrently
3. **Chunked Imports**: Large CSV files imported in 500-row chunks
4. **Debounced Saves**: Column resize operations debounced to reduce API calls
5. **Optimistic Updates**: UI updates immediately before API confirmation
6. **Database Indexes**: GIN indexes on JSONB columns for fast queries

#### Data Flow

**CSV Import:**
```
Client (PapaParse) → Column Selection → Chunked API Calls → 
Supabase (JSONB storage) → Column Generation → UI Update
```

**AI Enrichment:**
```
User Config → Save to Database → Frontend Calculates Pending Rows → 
API Request with Row IDs → Batch Processing → Gemini API → 
Incremental Database Updates → Real-time UI Polling → Results Display
```

**Column Management:**
```
User Action → Local State Update → Debounced API Call → 
Database Update → State Refresh → UI Update
```

### User Experience Features

1. **Dashboard**: Grid view of all boards with metadata (row count, creation date)
2. **Board Management**: Rename, delete boards with cascade deletion
3. **Real-time Updates**: AI results appear as they're generated
4. **Progress Tracking**: Visual progress bars during import and enrichment
5. **Error Handling**: Comprehensive error messages and toast notifications
6. **Loading States**: Skeleton loaders and spinners for better perceived performance
7. **Responsive Design**: Works on desktop and tablet devices

## Key Technologies

- **Next.js 14.2.5**: React framework with App Router
- **TypeScript 5.5.4**: Type safety throughout
- **Supabase**: PostgreSQL database with JSONB support
- **Google Gemini AI**: AI enrichment engine
- **TanStack Table**: Data grid functionality
- **TanStack Virtual**: Virtual scrolling
- **DnD Kit**: Drag-and-drop functionality
- **PapaParse**: CSV parsing
- **Tailwind CSS**: Utility-first styling
- **Shadcn UI**: Component library

## Security & Data Management

- **Row Level Security (RLS)**: Enabled on all tables (currently permissive for development)
- **Environment Variables**: Sensitive keys stored securely
- **Client-side Parsing**: CSV files parsed on client for privacy
- **Cascade Deletion**: Deleting a board removes all associated data
- **Data Validation**: Input validation on all API endpoints

## Scalability

The platform is designed to handle:
- **10,000+ rows** per board with smooth performance
- **Unlimited columns** (limited only by browser memory)
- **Large CSV files** (chunked import prevents timeouts)
- **Concurrent AI processing** (5 rows at a time with rate limiting)

## Future Enhancements

Planned features include:
- CSV export functionality
- Advanced filtering and search
- Bulk row operations
- User authentication and multi-user support
- Team collaboration features
- Job queue for async AI processing
- Cost tracking for AI API usage

## Conclusion

Chatpire Research is a powerful, flexible platform for B2B data management that combines the familiarity of spreadsheet interfaces with modern AI capabilities. It serves teams that need to import, organize, and enrich large datasets without the complexity of traditional database management systems. The platform's strength lies in its zero-configuration approach, allowing users to import any CSV structure and immediately start working with their data, while providing powerful AI enrichment capabilities to enhance and transform that data automatically.

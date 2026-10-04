# Contract Obligation & Renewal Assistant

An enterprise-grade information-management platform that ingests commercial contracts (PDF, DOCX, pasted text) and optional organizational policy guidelines. It extracts structured contractual obligations and key dates using a multi-provider LLM pipeline with verbatim citations, provides a split-screen human review queue, calculates deadlines deterministically, tracks clause diffs across contract versions, and exports audit-ready summaries in Markdown and printable HTML.

---

## ⚠️ Important Legal Notice & System Positioning

> **INFORMATION-MANAGEMENT TOOL ONLY — NOT LEGAL ADVICE**
>
> This application is strictly an information-management and workflow automation tool. It organizes factual contract clauses, computes operational notification schedules, and compares contracts against organizational policy guidelines.
>
> **It does NOT provide legal advice, opinion on legal enforceability, legal risk scoring, or recommendations to terminate or renegotiate.**
>
> All extracted items, computed deadlines, and source citations must be independently verified against original legal agreements by qualified professionals.

---

## 🏛️ System Architecture

```mermaid
flowchart TD
    subgraph Ingestion ["1. Multi-Format Ingestion"]
        A[Contract: PDF / DOCX / Text] --> B[Text Extractor: pdfjs-dist & mammoth]
        P[Optional Policy Document] --> B
        B --> C[Section Parser & Normalizer]
        C --> D[(Document Sections: Neon PostgreSQL)]
    end

    subgraph Pipeline ["2. Multi-Pass AI Extraction & Failover"]
        D --> E1[Pass 1: Contracting Parties & Effective Date]
        D --> E2[Pass 2: Term, Expiry, Renewal & Notice]
        D --> E3[Pass 3: Concrete Obligations & Recurrence]
        D --> E4[Pass 4: Ambiguities, Conflicts & Policy Gaps]
        D --> E5[Pass 5: Neutral Clarification Questions]
        
        E1 & E2 & E3 & E4 & E5 --> F[Multi-Provider LLM Fallback Chain]
        F -->|Primary| F1[Google Gemini]
        F -->|Failover on 429 Rate Limit| F2[Groq Llama 3.3]
        F -->|Failover on 503 / Limit| F3[Hugging Face Qwen 2.5]
        F -->|No Keys Configured| F4[MockLLM Demo Mode]

        F --> G[Deterministic Guardrail Post-Filter]
        G --> H[Deterministic Verbatim Citation Verifier]
        H --> I[(Extracted Items DB)]
    end

    subgraph DeterministicEngine ["3. Deterministic Date Engine"]
        I --> J[Pure Date Arithmetic: dates.ts]
        J -->|Month-End Clamping, Leap Years, UTC| K[Computed Expiry & Notice Deadlines]
        J -->|Past Suppression, Recurrence Rules| L[Lead Reminder Schedules: 90, 60, 30, 14, 7 Days]
    end

    subgraph HumanReview ["4. Review Workflow & Stale Detection"]
        I --> M[Split-Screen Review Workspace]
        D --> M
        M -->|Approve / Reject / Edit / Override| N[(Audit Log DB)]
        M -->|Upload v2| O[Token-Similarity Diff Engine]
        O -->|Similarity < 0.98| P3[Flag Changed / Missing Stale Clauses]
        P3 --> M
    end

    subgraph Output ["5. Dashboard & Summary Export"]
        N & K --> Q[Deadlines Dashboard: Firm vs Unreviewed]
        N --> R[Approved-Only Summary Compiler]
        R --> S1[Markdown Export .md]
        R --> S2[Printable Clean HTML / PDF]
    end
```

---

## ⚖️ Architectural Boundary: AI vs. Deterministic Code

To guarantee safety, auditability, and zero hallucinated dates, probabilistic AI generation is strictly quarantined to extraction and quote location, while all calculations and validations are strictly deterministic:

| Feature / Responsibility | AI (LLM Pipeline) | Deterministic Code (TypeScript) |
| :--- | :---: | :---: |
| **Document Ingestion & Text Offset Tracking** | ❌ | ✅ `pdfjs-dist`, `mammoth`, regex clause chunker |
| **Entity & Obligation Candidate Identification** | ✅ Multi-pass targeted prompts | ❌ |
| **Legal Guardrail Filtering** | ❌ | ✅ Deterministically scrubs advisory phrases |
| **Source Citation Verification** | ❌ | ✅ Verbatim quote matching + Unicode normalization |
| **Expiry & Notice Date Arithmetic** | ❌ | ✅ `date-fns` UTC, month-end clamping, leap years |
| **Notification Reminder Schedules** | ❌ | ✅ Pure math (e.g. expiry minus notice days minus lead time) |
| **Review State & Monotonic Audit History** | ❌ | ✅ PostgreSQL transactions with user changes |
| **Bulk Approval Safeguards** | ❌ | ✅ Blocks unverified quotes or confidence < 0.80 |
| **Version Section Diffing & Stale Item Detection** | ❌ | ✅ Token similarity matching (threshold ≥ 0.98) |
| **Compiled Contract Summary** | ❌ | ✅ Strict approved-only whitelist with verbatim citations |

---

## ⚡ Multi-Provider LLM Fallback (Zero Rate-Limit Downtime)

The system includes a resilient **multi-provider LLM chain**:
1. **Google Gemini** (`gemini-2.5-flash` / `gemini-1.5-pro` via `@google/genai`)
2. **Groq** (`llama-3.3-70b-versatile` via high-speed REST)
3. **Hugging Face** (`Qwen/Qwen2.5-72B-Instruct` via Router API)
4. **Mock LLM Fallback** (active in test runs or demo mode when no keys are set)

> **Automatic 429 Failover:** If your primary provider hits an HTTP 429 Rate Limit, token quota exhaustion, or 503 service overload, the engine logs a structured warning and **automatically retries the extraction pass with the next provider in the chain**.

---

## 📦 Project Structure

```
├── shared/                         # Shared TypeScript types & Zod schemas
│   └── src/index.ts                # Contracts, sections, items, dates, reviews, summary schemas
├── backend/                        # Fastify REST API + Prisma PostgreSQL engine
│   ├── prisma/
│   │   └── schema.prisma           # Database schema (Contracts, Versions, Sections, Items, Audit, Summary)
│   ├── src/
│   │   ├── api/routes/             # REST routes (contracts, dashboard, versions, summaries)
│   │   ├── llm/                    # Multi-provider client (Gemini, Groq, HF, Mock), guardrails, prompts
│   │   ├── services/               # Ingestion, citation verifier, dates, stale detection, summary compiler
│   │   └── utils/                  # Structured Pino logger, AppError classes
│   └── test/                       # 8 Vitest suites (72 passing unit & integration tests)
├── frontend/                       # React 18 + TypeScript + Vite + Tailwind CSS
│   ├── src/
│   │   ├── components/             # Header, LegalDisclaimerBanner, Modals
│   │   ├── pages/                  # UploadPage, ContractsListPage, ReviewPage, DashboardPage, SummaryPage
│   │   ├── services/               # Type-safe API client (supports VITE_API_URL)
│   │   └── test/                   # Vitest component tests (6 passing tests)
├── samples/                        # 4 realistic test contracts & policy documents
│   ├── sample_contract_auto_renewal.txt
│   ├── sample_contract_conflicts.txt
│   ├── sample_contract_auto_renewal_v2.txt
│   └── sample_policy_document.txt
├── .github/workflows/ci.yml        # GitHub Actions CI (Typecheck, Postgres, 78 Tests, Build)
├── .gitignore                      # Clean Git ignore rules (secrets, node_modules, build artifacts)
└── package.json                    # Root npm workspace configuration
```

---

## 🚀 Quick Start Guide

### Prerequisites
* **Node.js**: `v20.x` or higher
* **npm**: `v10.x` or higher
* **Database**: PostgreSQL (e.g., [Neon](https://neon.tech), Supabase, AWS RDS, or local PostgreSQL)

### 1. Clone & Install Dependencies
```bash
git clone <repository-url>
cd "Contract Obligation and Renewal Assistant"
npm install
```

### 2. Configure Environment Variables
Create or edit `backend/.env`:

```ini
PORT=3001
HOST=0.0.0.0
NODE_ENV=development

# Database Connection (Neon, Supabase, or PostgreSQL)
DATABASE_URL="postgresql://username:password@host/database?sslmode=require"

# Multi-Provider LLM Fallback (Add one or more keys)
# 1. Google Gemini
GEMINI_API_KEY="your-gemini-api-key"
GEMINI_MODEL="gemini-2.5-flash"

# 2. Groq (Optional fallback - get free key at https://console.groq.com)
GROQ_API_KEY=""
GROQ_MODEL="llama-3.3-70b-versatile"

# 3. Hugging Face (Optional fallback - get free token at https://huggingface.co/settings/tokens)
HUGGINGFACE_API_KEY=""
HUGGINGFACE_MODEL="Qwen/Qwen2.5-72B-Instruct"
```

### 3. Synchronize Database Schema
Push the Prisma models to your PostgreSQL database:
```bash
npx --workspace=backend prisma db push
```

### 4. Start Development Servers

Open two terminal tabs:

**Terminal 1 — Backend API (Port 3001):**
```bash
npm run dev:backend
```

**Terminal 2 — Frontend UI (Port 5173):**
```bash
npm run dev:frontend
```

Open your browser at **`http://localhost:5173`**.

---

## 🖥️ User Workflow Walkthrough

### Step 1: Upload a Contract
* Navigate to **Upload Contract** (`/upload`).
* Select a contract file (**PDF**, **DOCX**, or **TXT**) or choose **Paste Text**.
* *(Optional)* Upload an internal organizational policy document (e.g. `samples/sample_policy_document.txt`) to test policy gap cross-referencing.
* Click **Extract & Process Contract**.

### Step 2: Split-Screen Review Queue
* The left panel displays the normalized contract text with section labels.
* The right panel displays the AI-extracted candidate items across 5 categories:
  * **Parties & Effective Date**
  * **Term, Expiry & Renewal**
  * **Obligations & Recurrence**
  * **Ambiguities, Conflicts & Policy Discrepancies**
  * **Neutral Clarification Questions**
* **Citation Jump**: Click any citation chip (e.g. `[Section 4.1]`) to scroll to and highlight the exact clause in the document viewer.
* **Review Actions**:
  * **Approve**: Confirms the item as verified.
  * **Reject**: Removes irrelevant or inaccurate candidates.
  * **Edit**: Corrects dates, titles, descriptions, or party assignments.
  * **Date Override**: Sets a custom deadline with a mandatory audit rationale.
  * **Clarifications**: Selects the intended interpretation for ambiguous clauses.
* **Bulk Approve**: Approves all confirmed items with verified citations in one click. Unverified citations or low-confidence items are withheld for individual human review.

### Step 3: Deadlines & Operations Dashboard
* Navigate to **Deadlines & Dashboard** (`/dashboard`).
* Displays a clear two-tier separation:
  1. **Confirmed & Approved Deadlines**: Actionable deadlines computed strictly from approved items.
  2. **Pending / Not Yet Reviewed Candidates**: Non-operational items awaiting review.
* Urgency indicators: **Overdue** (red), **Due Soon (≤ 30 days)** (amber), and **Upcoming** (emerald).
* Filter by timeframe (Next 30, 60, 90 Days, or Overdue).

### Step 4: Contract Versioning & Stale Item Detection
* When a revised contract arrives, open the contract details and click **Upload New Version**.
* Upload `v2` (e.g. `samples/sample_contract_auto_renewal_v2.txt`).
* The system preserves `v1` and compares sections using token similarity:
  * If a clause changed (similarity < 0.98), the item is flagged as **`source_clause_changed`**.
  * If a clause was removed, it is flagged as **`clause_not_found`**.
* The reviewer reconfirms or resolves stale items in the review queue.

### Step 5: Reviewed Summary & Export
* Open **Summary** (`/contracts/:id/summary`).
* Displays an audit-ready summary compiled **strictly from approved items** with full citations.
* If any reviews change after summary compilation, an "Outdated Summary" banner appears with a one-click **Regenerate Summary** button.
* **Exports**:
  * **Clean Markdown (`.md`)**: Download via `/api/contracts/:id/summary/export/markdown`.
  * **Printable Clean HTML / PDF**: Open via `/api/contracts/:id/summary/export/html` with professional typography and page breaks.

---

## 🧪 Testing & Quality Assurance

### Run All Test Suites (78 Automated Tests)
```bash
# Run backend tests (72 tests across 8 suites on PostgreSQL)
npm --workspace=backend run test

# Run frontend tests (6 tests with React Testing Library & jsdom)
npm --workspace=frontend run test
```

### Type Checking & Production Build
```bash
# Monorepo strict TypeScript check (0 errors)
npm run typecheck

# Production build of shared library, backend, and Vite frontend
npm run build
```

---

## ☁️ Deployment Guide

### Deploying Frontend (Vercel, Netlify, Cloudflare Pages)
* Build Command: `npm run build`
* Output Directory: `frontend/dist`
* Environment Variable:
  * `VITE_API_URL="https://your-backend-api-domain.com/api"`

### Deploying Backend (Render, Railway, Fly.io, or VPS)
* Build Command: `npx --workspace=backend prisma generate && npm --workspace=backend run build`
* Start Command: `node backend/dist/index.js` (or `npm --workspace=backend run dev` with tsx)
* Environment Variables:
  * `PORT=3001`
  * `NODE_ENV=production`
  * `DATABASE_URL="postgresql://...neon.tech/neondb?sslmode=require"`
  * `GEMINI_API_KEY="..."`
  * `GROQ_API_KEY="..."` (optional)
  * `HUGGINGFACE_API_KEY="..."` (optional)

---

## 🔒 Scope & Limitations

| In Scope | Explicitly Out of Scope |
| :--- | :--- |
| Single contract + optional policy document per upload | Bulk multi-contract portfolio ingestion |
| Native text extraction for PDF, DOCX, and raw text | OCR for image-only scanned documents |
| Deterministic deadline calculation & lead reminder intervals | Automated email/SMS dispatch or calendar integrations |
| Human-in-the-loop review queue & monotonic audit trail | Automated contract execution or e-signatures |
| Clause diffing & stale review queue across versions | Automated legal advice, risk scoring, or redlining |

# Contract Obligation & Renewal Assistant

An enterprise information-management application that ingests commercial contracts (PDF, DOCX, pasted text) and optional organizational policy documents, extracts structured contractual metadata and obligations with verbatim source citations, provides a synchronized human-in-the-loop review interface, tracks deadlines deterministically, detects version diffs and stale items, and compiles approved audit-ready summaries with PDF/print and Markdown exports.

---

## ⚠️ Important Notice & Positioning

> **INFORMATION-MANAGEMENT TOOL ONLY — NOT LEGAL ADVICE**
>
> This application organizes contract information, computes operational notification schedules, and cross-references policy guidelines. **It does not provide legal advice, contract interpretation, legal risk ratings, or enforceability opinions.**
>
> All extracted items, cited quotes, and computed dates must be verified against the executed physical agreement by qualified legal counsel or procurement professionals.

---

## 🏛️ System Architecture

```mermaid
flowchart TD
    subgraph Ingestion ["1. Document Ingestion"]
        A[Contract File: PDF / DOCX / Text] --> B[Text Extractor]
        P[Optional Policy Document] --> B
        B --> C[Section Parser & Normalizer]
        C --> D[(Document Sections DB)]
    end

    subgraph Pipeline ["2. Multi-Pass AI Extraction & Citation Verification"]
        D --> E1[Pass 1: Parties & Effective Date]
        D --> E2[Pass 2: Term, Expiry & Auto-Renewal]
        D --> E3[Pass 3: Obligations & Milestones]
        D --> E4[Pass 4: Ambiguities, Conflicts & Policy Gaps]
        D --> E5[Pass 5: Clarification Questions]
        
        E1 & E2 & E3 & E4 & E5 --> F[Deterministic Guardrail Filter]
        F --> G[Deterministic Citation Verifier]
        G --> H[(Extracted Items DB)]
    end

    subgraph DeterministicEngine ["3. Deterministic Date Engine"]
        H --> I[dates.ts Engine]
        I -->|Leap Year, Month-End Clamping, UTC| J[Computed Expiry & Notice Deadlines]
        I -->|Past Suppression, Recurrence| K[Reminder Schedules: 90/60/30/14/7 Days]
    end

    subgraph HumanReview ["4. Review Workflow & Stale Detection"]
        H --> L[Split-Screen Review UI]
        D --> L
        L -->|Approve / Reject / Edit / Override| M[(Audit Log DB)]
        L -->|Upload v2| N[Version Diff & Stale Clause Detector]
        N --> L
    end

    subgraph Output ["5. Dashboard & Summary Export"]
        M & J --> O[Deadlines Dashboard]
        M --> P2[Strict Approved-Only Summary Compiler]
        P2 --> Q1[Markdown Export]
        P2 --> Q2[Printable HTML / PDF Export]
    end
```

---

## ⚖️ Architectural Boundary: AI vs. Deterministic Code

To ensure enterprise reliability, safety, and auditability, probabilistic AI generation is strictly quarantined to extraction and quote location, while calculations and validations are strictly deterministic:

| Responsibility | AI (LLM / Gemini) | Deterministic Code (TypeScript) |
| :--- | :---: | :---: |
| **Ingestion & Section Offsets** | ❌ | ✅ `pdfjs-dist`, `mammoth`, regex clause chunker |
| **Entity & Obligation Candidate Extraction** | ✅ Multi-pass structured prompts | ❌ |
| **Legal Guardrail Filtering** | ❌ | ✅ Strips advisory phrases (`should renegotiate`, `unfair terms`) |
| **Source Citation Verification** | ❌ | ✅ Exact text search + whitespace normalization |
| **Expiry & Notice Date Calculations** | ❌ | ✅ `date-fns` UTC, month-end clamping, leap year rules |
| **Reminder Schedule Generation** | ❌ | ✅ Configurable lead windows, suppression of past dates |
| **Review State & Audit History** | ❌ | ✅ Prisma transactions, user edits, monotonic timestamps |
| **Bulk Approval Guardrails** | ❌ | ✅ Rejects low-confidence or unverified citations |
| **Version Section Diffing & Stale Item Detection** | ❌ | ✅ Token similarity matching (threshold ≥ 0.98) |
| **Final Summary Compilation** | ❌ | ✅ Whitelist: ONLY approved items, verbatim quotes |

---

## 📦 Project Structure

The project is structured as a monorepo using npm workspaces:

```
├── shared/                     # Shared TypeScript schemas and contracts
│   └── src/index.ts            # Zod schemas & TypeScript types (Sections, Items, Review, Dates, Summary)
├── backend/                    # Fastify REST API + Prisma SQLite Engine
│   ├── prisma/
│   │   ├── schema.prisma       # Database schema (Contracts, Versions, Sections, Items, Audit, Summary)
│   │   └── dev.db              # SQLite database
│   ├── src/
│   │   ├── api/routes/         # REST API endpoints (contracts, dashboard, versions, summaries)
│   │   ├── llm/                # LLM client (Gemini + MockLLM fallback), guardrail filter, prompts
│   │   ├── services/           # Ingestion, citation verification, dates, stale detection, summaries
│   │   └── utils/              # Structured Pino logger, AppError classes
│   └── test/                   # Vitest unit & integration test suites (64 passing tests)
├── frontend/                   # React + TypeScript + Vite + Tailwind CSS
│   ├── src/
│   │   ├── components/         # Header, LegalDisclaimerBanner, Modals
│   │   ├── pages/              # UploadPage, ContractsListPage, ReviewPage, DashboardPage, SummaryPage
│   │   ├── services/           # Type-safe API client
│   │   └── test/               # Vitest component unit tests (6 passing tests)
├── samples/                    # Realistic test contracts and organizational policy documents
│   ├── sample_contract_auto_renewal.txt
│   ├── sample_contract_conflicts.txt
│   ├── sample_contract_auto_renewal_v2.txt
│   └── sample_policy_document.txt
└── .github/workflows/ci.yml    # GitHub Actions continuous integration pipeline
```

---

## 🚀 Quick Start Guide

### Prerequisites
- **Node.js**: `v20.x` or higher
- **npm**: `v10.x` or higher

### 1. Clone & Install Dependencies
```bash
git clone <repo-url>
cd "Contract Obligation and Renewal Assistant"
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `backend/.env`:
```bash
cp .env.example backend/.env
```

Edit `backend/.env`:
```ini
PORT=3001
HOST=0.0.0.0
NODE_ENV=development

# Database: PostgreSQL (Neon, Supabase, AWS RDS, or local)
DATABASE_URL="postgresql://user:password@host/db?sslmode=require"

# Multi-Provider LLM Fallback Chain (Automatic Rate-Limit Rollover)
# Configure one or more keys. If one provider hits a 429 rate limit or quota exhaustion,
# the system automatically fails over to the next provider!
# Priority: Gemini -> Groq -> Hugging Face -> MockLLMClient (if none configured)

# 1. Google Gemini
GEMINI_API_KEY="your-gemini-api-key"
GEMINI_MODEL="gemini-2.5-flash"

# 2. Groq (Ultra-fast inference & generous free tier)
GROQ_API_KEY="gsk_..."
GROQ_MODEL="llama-3.3-70b-versatile"

# 3. Hugging Face (Serverless Inference Router)
HUGGINGFACE_API_KEY="hf_..."
HUGGINGFACE_MODEL="Qwen/Qwen2.5-72B-Instruct"
```

### 3. Initialize the Database
```bash
npx --workspace=backend prisma db push
```

### 4. Run Development Servers
Open two terminal tabs:

**Terminal 1 — Backend (Port 3001):**
```bash
npm run dev:backend
```

**Terminal 2 — Frontend (Port 5173):**
```bash
npm run dev:frontend
```

Navigate to `http://localhost:5173` in your web browser.

---

## 🧪 Testing & Verification

### Running All Tests
```bash
# Run backend test suites (Ingestion, Prompts, Citations, Dates, Review, Dashboard, Versioning, Summary)
npm --workspace=backend run test

# Run frontend component test suites (Disclaimer, Header, Modals)
npm --workspace=frontend run test
```

### Type Checking & Build
```bash
# Strict TypeScript validation (0 compile errors, zero `any`)
npm run typecheck

# Production build of shared, backend, and frontend
npm run build
```

---

## 📂 Samples & Walkthrough

The `samples/` directory contains four realistic documents designed to validate the end-to-end functionality:

### 1. `sample_contract_auto_renewal.txt`
- **Description:** SaaS Master Services Agreement between CloudScale Technologies Inc. and Apex Global Logistics LLC.
- **Key Clauses:** Effective date Jan 1, 2026, 12-month term, auto-renewal with 30-day notice, $12,500/mo fees, quarterly SLA reporting, annual SOC 2 audits.
- **Workflow:** Upload this file to observe candidate extraction, citation offsets, automatic computation of renewal deadlines (2026-12-01) and reminder schedules.

### 2. `sample_contract_conflicts.txt`
- **Description:** Digital Media Content Distribution Agreement.
- **Key Clauses:** Section 3 states renewal is prevented via 30 days written notice; Section 7 states notice must be delivered exclusively by certified registered mail with 60 days advance notice.
- **Workflow:** Demonstrates ambiguity and conflict extraction, flagging conflicting notice requirements and discretionary "reasonable commercial efforts" support language.

### 3. `sample_contract_auto_renewal_v2.txt`
- **Description:** Version 2 of the CloudScale MSA.
- **Modifications:** Renewal notice modified from 30 days to 60 days; fees updated to $14,000; Section 9 added with GDPR and 48-hour breach notification.
- **Workflow:** Navigate to the Contract Details page for v1 and click "Upload New Version". Upload this file to observe section diffing, clause comparison, and automatic stale item flagging for Section 4.

### 4. `sample_policy_document.txt`
- **Description:** Apex Global Logistics Vendor & Security Policy.
- **Key Requirements:** Requires a minimum 60-day renewal notice period, annual SOC 2 Type II audits, and third-party penetration testing.
- **Workflow:** When uploading `sample_contract_auto_renewal.txt`, include this file as the optional policy document. Pass 4 detects that the vendor contract's 30-day notice window violates the internal 60-day policy requirement.

---

## 🛡️ Key Features & Workflows

### 1. Robust Document Ingestion
- Native text extraction for **PDF** (via `pdfjs-dist`), **DOCX** (via `mammoth`), and **Raw Text**.
- Scanned PDF detection: Flags documents without extractable text streams and alerts the user that OCR is not supported.
- Section Chunker: Normalizes clause headings (`Section 1.`, `1.1`, uppercase headers) while calculating absolute character start and end offsets.

### 2. Guardrailed Multi-Pass Extraction Pipeline
- **Pass 1:** Parties, roles, effective date, and governing law.
- **Pass 2:** Term duration, renewal mechanism (auto/manual), notice window days.
- **Pass 3:** Obligations, recurrence patterns, payment terms, and reporting deadlines.
- **Pass 4:** Ambiguities, conflicting clauses, and policy gaps against uploaded guidelines.
- **Pass 5:** Clarification questions with specific options for ambiguous terms.
- **Guardrail Filter:** Deterministically scans and strips legal advice or subjective legal recommendations.
- **Citation Verifier:** Validates exact verbatim quotes against the section text with whitespace and punctuation normalization.

### 3. Deterministic Date Engine (`dates.ts`)
- Pure, side-effect-free date arithmetic using `date-fns` in UTC (`YYYY-MM-DD`).
- **Month-End Clamping:** Correctly handles 1-month additions from Jan 31 -> Feb 28 (or Feb 29 on leap years).
- **Notice Deadlines:** Computes notice deadlines by subtracting advance notice days from expiry dates.
- **Reminder Schedules:** Computes lead-time notification dates (e.g. 90, 60, 30, 14, 7 days prior) while automatically suppressing dates in the past.
- **Manual Overrides:** Preserves human review overrides with audit reasons.

### 4. Split-Screen Review & Audit Log
- Interactive side-by-side workspace: Document Viewer on the left with citation highlights, Candidate Review Queue on the right.
- Clicking any extracted citation automatically jumps and highlights the exact clause in the document viewer.
- Actions: **Approve**, **Reject**, **Edit Text / Details**, **Override Date**, or **Answer Clarification Questions**.
- **Bulk Approve:** Safeguarded to approve only items with high confidence and verified citations; flags unverified or low-confidence items for individual inspection.
- Comprehensive audit log tracks every review action, timestamp, and user modification.

### 5. Versioning & Stale Item Detection
- Supports uploading contract revisions (e.g., v1 -> v2) without overwriting historical records.
- Semantic and token similarity analysis compares corresponding clauses between versions.
- Items whose underlying contract text changed (similarity < 0.98) or whose source section was deleted are marked with `source_clause_changed` or `clause_not_found`, prompting targeted re-review.

### 6. Approved Contract Summary & Export
- Compiles an audit-ready contract summary drawn **strictly** from approved items.
- Displays full source citations, party responsibilities, confirmed deadlines, and clarification resolutions.
- Includes mandatory legal disclaimer.
- Exports to **Clean Markdown** and **Printable HTML / PDF**.

---

## 🔒 Scope & Limitations

| In Scope | Out of Scope |
| :--- | :--- |
| Single contract + optional policy document | Bulk cross-repository portfolio ingestion |
| Text-based PDF, DOCX, and plain text | OCR for scanned image-only PDFs |
| Deterministic deadline computation & lead alerts | Push email / SMS notifications or calendar sync |
| Human-in-the-loop review & audit trail | Automated contract signing / e-signatures |
| Clause diffing & stale review queue | Automated legal risk scoring or contract redlining |

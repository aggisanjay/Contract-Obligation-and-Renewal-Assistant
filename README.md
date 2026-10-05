# Contract Obligation & Renewal Assistant

An enterprise-grade information-management platform that ingests commercial contracts (PDF, DOCX, raw text) and optional organizational policy guidelines. It extracts structured contractual obligations and key dates using a multi-provider LLM pipeline with verbatim citations, provides a split-screen human review queue, calculates deadlines deterministically, tracks clause diffs across contract versions, and exports audit-ready summaries in Markdown and printable HTML.

The entire application can be deployed as **one single service** (Fastify serving the prebuilt React SPA with same-origin `/api` routing) or as independent frontend and backend services.

🌐 **Live Application URL:** `https://contract-obligation-assistant.onrender.com` *(Live Demo Placeholder)*

---

## ⚠️ Important Legal Notice & System Positioning

> **INFORMATION-MANAGEMENT TOOL ONLY — NOT LEGAL ADVICE**
>
> This application is strictly an information-management and workflow automation tool. It organizes factual contract clauses, computes operational notification schedules, and compares contracts against organizational policy guidelines.
>
> **It does NOT provide legal advice, opinion on legal enforceability, legal risk scoring, or recommendations to terminate or renegotiate.**
>
> All extracted items, computed deadlines, and source citations must be independently verified against original legal agreements by qualified professionals.

### 🚫 Excluded Scope
The system explicitly excludes the following capabilities:
- **No Legal Counsel or Advice:** The platform does not evaluate clause fairness, enforceability under specific jurisdictions, or provide recommendations to accept, reject, or renegotiate contracts.
- **No Autonomous Contracting:** The system never drafts revisions, modifies underlying legal documents, or executes contracts autonomously.
- **No Direct Outbound Notice Transmission:** The platform tracks notification deadlines and alerts teams; it does not dispatch legal notices or emails directly to counterparties.
- **No Bitmap OCR Ingestion:** Scanned image PDFs lacking embedded text layers are rejected with instructions to supply OCR-processed files.
- **No E-Signature Workflow:** E-signature capturing and identity management (e.g., DocuSign, Adobe Sign) are excluded and delegated to dedicated signature systems.

---

## 🏛️ System Architecture

```mermaid
flowchart TD
    subgraph Ingestion ["1. Multi-Format Ingestion"]
        A[Contract: PDF / DOCX / Text] --> B[Text Extractor: pdfjs-dist & mammoth]
        P[Optional Policy Document] --> B
        B --> C[Section Parser & Coordinate Reconstruction]
        C --> D[(Document Sections: PostgreSQL)]
    end

    subgraph Pipeline ["2. Multi-Pass AI Extraction & Failover"]
        D --> E1[Pass 1: Contracting Parties & Effective Date]
        D --> E2[Pass 2: Term, Expiry, Renewal & Notice]
        D --> E3[Pass 3: Concrete Obligations & Recurrence]
        D --> E4[Pass 4: Ambiguities, Conflicts & Policy Gaps]
        D --> E5[Pass 5: Neutral Clarification Questions]
        
        E1 & E2 & E3 & E4 & E5 --> F[Hugging Face Qwen 2.5 Inference]
        F -->|Direct Fast Inference| F1[Hugging Face Serverless / Router API]
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
        M -->|Approve / Reject / Edit / Date Override| N[(Audit Log DB)]
        M -->|Upload v2| O[Token-Similarity Diff Engine]
        O -->|Similarity < 0.98| P3[Flag Changed / Missing Stale Clauses]
        P3 --> M
    end

    subgraph Output ["5. Single-Service Serving & Export"]
        N & K --> Q[Deadlines Dashboard: Firm vs Unreviewed]
        N --> R[Approved-Only Summary Compiler]
        R --> S1[Markdown Export .md]
        R --> S2[Printable Clean HTML / PDF]
        Fastify[Fastify Single-Service Host] -->|Serves API| R
        Fastify -->|Serves Static SPA| SPA[frontend/dist with SPA Fallback]
    end
```

---

## ⚖️ Architectural Boundary: AI vs. Deterministic Code

To guarantee safety, auditability, and zero hallucinated dates, probabilistic AI generation is strictly quarantined to extraction and quote location, while all calculations and validations are strictly deterministic:

| Feature / Responsibility | AI (LLM Pipeline) | Deterministic Code (TypeScript) |
| :--- | :---: | :---: |
| **Document Ingestion & Text Offset Tracking** | ❌ | ✅ `pdfjs-dist`, `mammoth`, coordinate chunker |
| **Entity & Obligation Candidate Identification** | ✅ Multi-pass targeted prompts | ❌ |
| **Legal Guardrail Filtering** | ❌ | ✅ Deterministically scrubs advisory phrases |
| **Source Citation Verification** | ❌ | ✅ Verbatim quote matching + Unicode normalization |
| **Natural Written-Date Parsing** | ❌ | ✅ Regex & calendar validation (`parseNaturalDate`) |
| **Cascading Date Resolution** | ❌ | ✅ Topological dependency recalculation (`recomputeVersionDates`) |
| **Expiry & Notice Date Arithmetic** | ❌ | ✅ `date-fns` UTC, month-end clamping, leap years |
| **Notification Reminder Schedules** | ❌ | ✅ Pure math (e.g. expiry minus notice days minus lead time) |
| **Review State & Monotonic Audit History** | ❌ | ✅ PostgreSQL transactions with user changes |
| **Bulk Approval Safeguards** | ❌ | ✅ Blocks unverified quotes or confidence < 0.80 |
| **Version Section Diffing & Stale Item Detection** | ❌ | ✅ Token similarity matching (threshold ≥ 0.98) |
| **Compiled Contract Summary** | ❌ | ✅ Strict approved-only whitelist with 5-state wording |

---

## ⚡ Fast LLM Inference (Hugging Face)

The system connects directly to **Hugging Face Serverless Inference / Router API** for fast, deterministic contract extractions:
1. **Model:** `Qwen/Qwen2.5-72B-Instruct` (72B parameter instruction-tuned model with exceptional structured JSON compliance and legal syntax accuracy)
2. **Direct Execution:** Direct execution without multi-provider rollover latency or cascading retry delays.
3. **Mock LLM Fallback:** Automatically active in automated test runs or demo mode when no API keys are provided.

---

## 📦 Project Structure

```
├── shared/                         # Shared TypeScript types & Zod schemas
│   └── src/index.ts                # Contracts, sections, items, dates, reviews, summary schemas
├── backend/                        # Fastify REST API + Prisma PostgreSQL engine
│   ├── prisma/
│   │   └── schema.prisma           # Database schema (Contracts, Versions, Sections, Items, Audit, Summary)
│   ├── src/
│   │   ├── api/                    # REST routes (contracts, dashboard, versions, summaries, health)
│   │   ├── llm/                    # Hugging Face Qwen 2.5 client & MockLLMClient, guardrails, prompts
│   │   ├── services/               # Ingestion (PDF, DOCX), citations, dates.ts, dateRecalculator.ts, summaryCompiler.ts
│   │   └── utils/                  # Structured Pino logger, AppError classes
│   └── test/                       # 17 Vitest suites (126 passing unit & integration tests)
├── frontend/                       # React 18 + TypeScript + Vite + Tailwind CSS
│   ├── src/
│   │   ├── components/             # Header, LegalDisclaimerBanner, Modals (UploadVersion, VersionDiff)
│   │   ├── pages/                  # UploadPage, ReviewPage (split-screen, recalculate dates), Dashboard, Summary
│   │   ├── services/               # Type-safe API client (defaults to same-origin /api)
│   │   └── test/                   # 7 Vitest component suites (19 passing tests)
├── samples/                        # Realistic sample contracts (.pdf, .docx, .txt) & policy documents
│   ├── sample_contract_cloud_services.pdf
│   ├── sample_contract_cloud_services_v2.pdf
│   ├── sample_master_services_agreement.docx
│   ├── sample_master_services_agreement_v2.docx
│   ├── sample_contract_cloud_services.txt
│   ├── sample_contract_cloud_services_v2.txt
│   ├── demo_future_dates.txt
│   └── sample_policy_document.txt
├── .github/workflows/ci.yml        # GitHub Actions CI (Typecheck, Lint, Postgres, 117 Tests, Build)
├── render.yaml                     # Render Blueprint for Single-Service Web Service deployment
├── railway.json                    # Railway deployment configuration
├── .gitignore                      # Clean Git ignore rules (zero secrets, node_modules, build artifacts)
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

# LLM Inference (Hugging Face Serverless / Router API)
# Get a free access token at: https://huggingface.co/settings/tokens
HUGGINGFACE_API_KEY="your-huggingface-token"
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

## 🌐 Single-Service Production Deployment

The entire application can be deployed as **one single service** where the Fastify backend serves both the `/api` endpoints and the pre-built React frontend static assets with an SPA fallback:

### 1. Build the Entire Monorepo
```bash
npm run build
```
This builds `@contract-assistant/shared`, compiles TypeScript in `backend/dist`, and bundles the frontend into `frontend/dist`.

### 2. Run the Single-Service Application
```bash
npm start
```
The backend initializes database tables if needed, serves static files from `frontend/dist`, handles all `/api/*` routes, and routes any non-API web request to `index.html`.

### 3. Health & Readiness Endpoint
```bash
curl http://localhost:3001/api/health
```
Response:
```json
{
  "status": "ok",
  "llmMode": "huggingface",
  "db": "ok",
  "timestamp": "2026-10-05T08:00:00.000Z",
  "service": "Contract Obligation & Renewal Assistant"
}
```

### Deploying to Render
A pre-configured `render.yaml` blueprint is provided in the repository root:
1. Connect your GitHub repository to [Render](https://render.com).
2. Choose **New Blueprint Instance**.
3. Render automatically provisions the web service, compiles the monorepo, and attaches your PostgreSQL database.

### Deploying to Railway
A pre-configured `railway.json` is provided in the repository root:
1. Link your repository in [Railway](https://railway.app).
2. Attach a PostgreSQL plugin.
3. Railway executes `npm run build` and starts the unified service with `npm start`.

---

## 🖥️ User Workflow Walkthrough

### Step 1: Upload a Contract & 5-Pass Stepper
* Navigate to **Upload Contract** (`/upload`).
* Select a contract file (**PDF**, **DOCX**, or **TXT**) or choose **Paste Text**.
* Client-side validation checks that files are under 10 MB and in a supported format.
* *(Optional)* Upload an internal organizational policy document (e.g. `samples/sample_policy_document.txt`) to test policy gap cross-referencing.
* Click **Extract & Process Contract**.
* A visual 5-pass loading stepper displays live extraction progress across:
  1. *Parties & Effective Date*
  2. *Term, Expiry & Renewal*
  3. *Obligations & Recurrence*
  4. *Ambiguities & Conflicts*
  5. *Clarification Questions*

### Step 2: Split-Screen Review Queue & Citation Jumps
* The left panel displays the parsed document text with section labels.
* The right panel displays the AI-extracted candidate items grouped by category.
* **Citation Jump**: Click any citation label (e.g. `[Section 2.1]`) to scroll to and highlight the exact clause in the document viewer.
* **Review Actions**:
  * **Approve**: Confirms the item as verified.
  * **Reject**: Marks candidate item as rejected (excluded from final commitments).
  * **Edit**: Corrects dates, titles, descriptions, or party assignments with an audit reason.
  * **Date Override**: Sets a custom deadline with a mandatory audit rationale.
  * **Clarifications**: Records intended human interpretation for ambiguous clauses.
* **Bulk Approve**: Approves all confirmed items with verified citations in one click. Unverified citations or low-confidence items are withheld for individual human review.
* **Category Retry Pass**: If any extraction pass failed or returned zero items, click **Retry Pass** inside the category tab to re-run only that specific step without re-running the entire contract.

### Step 3: Deadlines & Operations Dashboard
* Navigate to **Deadlines & Dashboard** (`/dashboard`).
* Displays a clear two-tier separation:
  1. **Confirmed & Approved Deadlines**: Actionable operational deadlines computed strictly from approved items.
  2. **Pending / Not Yet Reviewed Candidates**: Non-operational items awaiting human review.
* Urgency indicators: **Overdue** (red), **Due Soon (≤ 30 days)** (amber), and **Upcoming** (emerald).
* Filter by timeframe (Next 30, 60, 90 Days, or Overdue).

### Step 4: Contract Versioning & Stale Item Detection
* When an amended contract arrives (e.g. v2):
  * Open the contract review page and click **Upload New Version**.
  * Upload the amended file or paste revised text.
* The system preserves `v1` intact and runs token similarity section alignment:
  * Click **Compare Versions** to open `VersionDiffModal` for side-by-side section diffs (Added, Modified, Removed clauses).
  * If a clause was modified in v2, its prior approved item is flagged as **`source_clause_changed`**.
  * If a section was removed in v2, it is flagged as **`clause_not_found`**.
* A high-priority **Stale Clause Alert Banner** appears in the review queue.
* The human reviewer re-confirms or dismisses stale items with an optional audit note before compiling the summary.

### Step 5: Reviewed Summary & Export
* Open **Summary** (`/contracts/:id/summary`).
* Displays an audit-ready summary compiled **strictly from approved items** with full citations.
* If any reviews change after summary compilation, an "Outdated Summary" banner appears with a one-click **Regenerate Summary** button.
* **Exports**:
  * **Clean Markdown (`.md`)**: Download via `/api/contracts/:id/summary/export/markdown`.
  * **Printable Clean HTML / PDF**: Open via `/api/contracts/:id/summary/export/html` with professional print styles and page breaks.

---

## 📄 Supported Document Formats & Limitations

| Format | Parsing Engine | Sectioning Mechanism | Limitations / Handling |
| :--- | :--- | :--- | :--- |
| **PDF (`.pdf`)** | `pdfjs-dist` | Bounding box coordinates & font sizes | Digital/text PDFs supported. Scanned PDFs under 50 characters are rejected with a clear message to provide OCR text. |
| **DOCX (`.docx`)** | `mammoth` | Headings, paragraph styles, numbered sections | Complex nested embedded spreadsheets are flattened to plain text. |
| **Plain Text (`.txt`)** | Regex chunker | Numbered clauses (e.g. `Section 1.0`, `Article 2`) | Unstructured narrative text is grouped into paragraph chunks. |

---

## 🧪 Testing & Quality Assurance

### Run All Automated Tests (117 Tests Passing)
```bash
# Run all 117 unit, integration, and UI component tests across all workspaces
npm test

# Or run workspace test suites individually:
node ./node_modules/vitest/vitest.mjs run --root backend    # 13 suites, 102 backend tests
node ./node_modules/vitest/vitest.mjs run --root frontend   # 6 suites, 15 frontend tests
```

### Full Lifecycle Integration Test
The integration test suite (`backend/test/fullLifecycleIntegration.test.ts`) tests the entire lifecycle:
`Upload Contract v1` $\rightarrow$ `5-Pass Extract` $\rightarrow$ `Human Approve` $\rightarrow$ `Date Override with Audit Note` $\rightarrow$ `Upload v2` $\rightarrow$ `Detect Stale Items` $\rightarrow$ `Human Re-confirm Stale Item` $\rightarrow$ `Compile Approved-Only Summary`.

### Type Checking & Linting
```bash
# Monorepo strict TypeScript typecheck (0 errors across shared, backend, frontend)
npm run typecheck

# Cross-workspace linting (0 errors)
npm run lint
```

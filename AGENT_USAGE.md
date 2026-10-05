# AGENT_USAGE.md: AI Agent System Architecture & Operational Guide

This document records the operational usage of AI agents within the **Contract Obligation & Renewal Assistant**, detailing the tools utilized, representative prompts, delegated responsibilities, documented mistakes and rejected suggestions, and multi-layer verification procedures.

For the full architectural pipeline and multi-provider rollover documentation, refer to [`docs/AI_PIPELINE.md`](file:///c:/Users/aggis/Desktop/Contract%20Obligation%20and%20Renewal%20Assistant/docs/AI_PIPELINE.md).

---

## 1. Tools Used

The engineering and runtime lifecycle leverages the following tool stack:

| Category | Tools & Libraries | Operational Role |
| :--- | :--- | :--- |
| **Development & Coding Assistant** | Antigravity AI Coding Agent | Autonomous code generation, test-driven refactoring, workspace orchestration |
| **LLM Inference Providers** | Google Gemini (`gemini-2.5-flash`), Groq (`llama-3.3-70b-versatile`), Hugging Face (`Qwen/Qwen2.5-72B-Instruct`) | Primary and fallback contract extraction engines |
| **Mock LLM Provider** | `MockLLMClient` (`backend/src/llm/mockClient.ts`) | Offline deterministic test harness and zero-API demo mode |
| **Runtime & Language** | Node.js v24.18.0, TypeScript v5.7.3 | Core execution runtime and static type checking |
| **Backend Framework & ORM** | Fastify v5, Prisma ORM v6.4, Neon PostgreSQL | REST API server, database modeling, migrations, connection pooling |
| **Frontend Framework & Styling** | Vite v6, React 18, TailwindCSS, Lucide React | Single-page application, interactive split-screen review, responsive dashboard |
| **Document Ingestion** | `pdfjs-dist` v4.10, `mammoth` v1.9, `date-fns` v4.1 | PDF parsing, DOCX text extraction, calendar date calculations |
| **Quality & Verification** | Vitest v3, Supertest v7, ESLint v10, `typescript-eslint` v8 | Automated unit/integration test suites, static analysis, CI gate |

---

## 2. Representative Prompts

The assistant decomposes contract analysis into 5 specialized extraction passes rather than relying on an error-prone monolithic prompt. Every pass is preceded by a strict non-advisory system directive.

### Core System Directive (Injected into Every Agent Pass)
```text
You are an information extraction assistant. Your job is to extract factual clauses, dates, and obligations from legal contracts.
You MUST NOT provide legal advice, opinion on fairness, legal enforceability, or recommendations to renegotiate.
Extract ONLY what is explicitly stated with exact verbatim source quotes.
```

### Pass 1: Contracting Parties & Effective Date (`parties.v1.ts`)
```text
Analyze the provided contract sections and extract the contracting entities and effective date.

Output format (strict JSON):
{
  "parties": [
    {
      "name": "Exact Legal Entity Name",
      "role": "Vendor | Customer | Partner | Licensor | Licensee | Other",
      "sourceSectionLabel": "Section X.X",
      "sourceQuote": "verbatim text identifying party"
    }
  ],
  "effectiveDate": {
    "dateString": "YYYY-MM-DD",
    "isExplicit": true | false,
    "sourceSectionLabel": "Section X.X",
    "sourceQuote": "verbatim text defining effective date"
  },
  "governingLaw": {
    "jurisdiction": "State / Country",
    "sourceSectionLabel": "Section X.X",
    "sourceQuote": "verbatim text defining governing law"
  }
}
```

### Pass 2: Term, Expiration & Renewal (`termAndRenewal.v1.ts`)
```text
Analyze the contract text for term length, expiration dates, renewal mechanisms, and non-renewal notice requirements.

Strict constraints:
- Set renewalType to: "auto_renew", "manual_opt_in", or "none".
- noticePeriodDays must be an integer (e.g. 30, 45, 60).
- sourceQuote must be an exact verbatim excerpt from the section.
```

### Pass 3: Operational Obligations & Milestones (`obligations.v1.ts`)
```text
Extract all affirmative and negative operational obligations, milestones, deliverables, payment terms, and reporting requirements.

Strict constraints:
- Associate each obligation with the responsibleParty ("Vendor", "Customer", etc.).
- Categorize type: "payment", "deliverable", "reporting", "audit", "compliance", or "other".
- Extract exact recurrence rule if applicable (e.g. "quarterly", "monthly", "within 15 days of quarter end").
```

### Pass 4: Ambiguities, Contradictions & Policy Conflicts (`ambiguities.v1.ts`)
```text
Identify contradictory clauses (e.g., conflicting notice windows in different sections), vague performance standards (e.g. "promptly", "best efforts"), or deviations from company procurement policy.
Provide exact verbatim quotes for both conflicting provisions. Do NOT provide legal advice on which clause takes precedence.
```

### Pass 5: Multiple-Choice Clarification Questions (`clarificationQuestions.v1.ts`)
```text
Formulate actionable multiple-choice clarification questions for human reviewers to resolve identified ambiguities.
Provide clear, concrete options (e.g., Option A: "30 calendar days notice", Option B: "60 calendar days notice").
Do NOT formulate open-ended questions requiring legal analysis.
```

---

## 3. Delegated Work Breakdown

To ensure both scalability and auditability, responsibilities are cleanly bifurcated between AI models, deterministic code, and human reviewers:

```mermaid
graph LR
    subgraph AI Model Work
        A1[Clause Classification]
        A2[Entity Extraction]
        A3[Ambiguity Identification]
        A4[Clarification Formulations]
    end

    subgraph Deterministic Code
        D1[Zod Schema Validation]
        D2[Verbatim Citation Verification]
        D3[Guardrail Advisory Filter]
        D4[Date Math & Recurrence Rules]
        D5[Stale Version Diff Detection]
    end

    subgraph Human Reviewer Touchpoints
        H1[Candidate Item Approval / Rejection]
        H2[Manual Date Overrides + Rationale]
        H3[Ambiguity Selection]
        H4[Stale Item Re-confirmation]
    end

    AI Model Work --> Deterministic Code
    Deterministic Code --> Human Reviewer Touchpoints
```

1. **Delegated to AI Agent:**
   - Unstructured text understanding across variable contract formats (PDF, DOCX, TXT).
   - Entity recognition and role mapping.
   - Initial candidate clause classification (Parties, Term, Obligations, Ambiguities).
   - Formulating candidate clarification questions with discrete choices.

2. **Handled Deterministically (Zero LLM Hallucination Risk):**
   - Character offset mapping (`charStart`, `charEnd`) and string verification in `citationVerifier.ts`.
   - Scrubbing and flagging banned advisory patterns in `guardrailFilter.ts`.
   - Date recurrence calculation, calendar quarter/month-end offsets, and leap-year clamping in `dates.ts`.
   - Levenshtein/token similarity diffing between contract revisions in `versions.ts`.
   - Export compilation strictly constrained to approved items in `summaryCompiler.ts`.

3. **Reserved Exclusively for Human Operators:**
   - Confirming candidate extractions into legally binding commitments.
   - Setting manual date overrides with mandatory audit justification.
   - Selecting preferred interpretations for conflicting clauses.
   - Re-verifying stale items flagged after a new contract version is uploaded.

---

## 4. Agent Mistakes & Rejected Suggestions (Honest Log)

During system development and automated verification, several agent mistakes and invalid patterns were identified, rejected, and corrected:

### Mistake 1: Implicit Database Mutations Inside GET Request Handlers
- **What happened:** Early implementations of `GET /api/contracts/:id` and `GET /api/dashboard` resolved dates and attempted to persist updated dates back to PostgreSQL during read requests.
- **Why rejected:** Violates HTTP idempotent read semantics, caused database lock contention under concurrent dashboard polling, and broke test isolation.
- **Resolution:** Removed all DB write operations from GET routes. Date resolution is strictly in-memory during reads, with persistence occurring only during extraction ingestion, new version creation, or explicit human edits.
- <!-- TODO: Verify DB connection pool saturation under 500+ concurrent reviewer workloads -->

### Mistake 2: Missing Date Source Attribution on Regex Fallbacks
- **What happened:** When the LLM payload omitted an explicit ISO date, deterministic fallback regexes extracted dates directly from the cited clause text without distinguishing them from AI extractions.
- **Why rejected:** Human reviewers could not determine whether a deadline came directly from the AI model or was inferred via regex from the quoted clause.
- **Resolution:** Added `dateSource: "derived_from_quote"` attribute to the database schema and rendered a prominent Amber verification badge (`"Derived from clause text. Please verify."`) in both the Review queue and Dashboard.
- <!-- TODO: Add heuristic warning if clause contains multiple competing dates in the same paragraph -->

### Mistake 3: Falsely Defaulting Missing `isAutoRenew` to `false`
- **What happened:** `summaryCompiler.ts` coerced `null` or undefined `isAutoRenew` flags to `false`, generating summaries claiming auto-renewal was disabled when it was actually unspecified or unapproved.
- **Why rejected:** Misleading legal interpretation that could cause teams to miss silent auto-renewals.
- **Resolution:** Strictly typed `isAutoRenew: boolean | null`. If unconfirmed or absent, the compiler outputs: `"Renewal terms not specified in approved data. See cited clause."`.
- <!-- TODO: Support multi-tiered renewal hierarchies (e.g., auto-renews unless budget cap exceeded) -->

### Mistake 4: Loose TypeScript `any` Types in API Route Handlers
- **What happened:** Error catch blocks and multi-part upload handlers used `any` casts to bypass Fastify / Prisma typing restrictions.
- **Why rejected:** Allowed silent runtime type regressions and prevented ESLint enforcement in CI.
- **Resolution:** Replaced all `any` usages with typed interfaces and unknown guard checks. Integrated `@typescript-eslint` with zero-tolerance rules (`@typescript-eslint/no-explicit-any: "error"`).
- <!-- TODO: Enforce strict-null-checks across legacy test fixtures -->

### Mistake 5: Disruptive Modal `alert()` Dialogs
- **What happened:** UI handlers in `ReviewPage.tsx` and `SummaryPage.tsx` utilized native browser `alert()` calls on error or success, freezing browser interaction and interfering with automated test drivers.
- **Why rejected:** Degraded user experience and prevented non-blocking notifications.
- **Resolution:** Replaced all `alert()` calls with an accessible, auto-dismissing `ToastContext` provider and animated toast notification system.
- <!-- TODO: Implement undo action within toast notifications for accidental rejections -->

---

## 5. Output Verification & Auditing Procedures

All outputs produced by the system undergo a multi-stage deterministic verification pipeline:

1. **Exact-Match Verbatim Citation Verification:**
   - Every candidate obligation or term must supply a verbatim `sourceQuote`.
   - `citationVerifier.ts` standardizes Unicode whitespace and search-indexes the quote against the section text.
   - If verified, exact `charStart` and `charEnd` offsets are recorded; if unverified, confidence is penalized, triggering mandatory individual human review.

2. **Deterministic Banned-Advisory Filter:**
   - Every generated text field is scanned against regex guardrails prohibiting unauthorized legal advice (`should renegotiate`, `legally invalid`, `we advise you to`).

3. **Zod Schema Runtime Validation:**
   - All extraction passes are validated against Zod schemas defined in `@contract-assistant/shared`. Any malformed model output fails immediately and triggers provider rollover.

4. **Automated Test Suite Enforcement:**
   - **102 Backend Tests:** Verifying date math, multi-provider fallback, citation verification, audit trails, and versioning.
   - **15 Frontend Tests:** Verifying review queue workflows, stale item reconfirmation, toast notifications, and diff viewers.
   - **Total 117 Tests Passing** with 0 failures across all workspaces.

5. **Human-in-the-Loop Approved-Only Output Boundary:**
   - Unapproved candidate items are never included in executive summaries or firm deadline alerts.
   - Stale items from previous contract versions are quarantined until human re-confirmation.

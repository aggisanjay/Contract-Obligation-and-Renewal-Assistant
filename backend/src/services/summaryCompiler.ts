import { ExtractedItem } from "@contract-assistant/shared";

export interface SummaryFactItem {
  text: string;
  citation: string;
}

export interface SummaryParty {
  name: string;
  role: string;
  citation: string;
}

export interface SummaryObligation {
  description: string;
  responsibleParty: string;
  type: string;
  deadline: string | null;
  recurrence: string;
  citation: string;
}

export interface SummaryAmbiguity {
  description: string;
  userAnswer: string | null;
  citation: string;
}

export interface CompiledSummaryData {
  contractTitle: string;
  versionNumber: number;
  generatedAt: string;
  disclaimer: string;
  parties: SummaryParty[];
  keyDates: {
    effectiveDate: string | null;
    expiryDate: string | null;
    noticeDeadline: string | null;
    citation: string;
  };
  renewalTerms: {
    isAutoRenew: boolean;
    summary: string;
    citation: string;
  };
  terminationTerms: {
    summary: string;
    citation: string;
  };
  obligations: SummaryObligation[];
  openQuestionsAndAmbiguities: SummaryAmbiguity[];
  metrics: {
    totalApproved: number;
    totalRejected: number;
    totalStale: number;
  };
  markdown: string;
  html: string;
}

const LEGAL_DISCLAIMER =
  "IMPORTANT NOTICE: This tool organizes contract information. It does not provide legal advice. Verify all items against the original document and consult a qualified professional.";

/**
 * Deterministically compiles a Reviewed Contract Summary strictly from approved/edited items.
 */
export function compileReviewedSummary(
  contractTitle: string,
  versionNumber: number,
  items: ExtractedItem[],
  generatedAt: string = new Date().toISOString()
): CompiledSummaryData {
  const approvedItems = items.filter(
    (i) => i.reviewStatus === "approved" || i.reviewStatus === "edited_approved"
  );
  const rejectedItems = items.filter((i) => i.reviewStatus === "rejected");
  const staleItems = items.filter((i) => i.reviewStatus === "stale");

  // Helper to parse current value safely
  function parseVal(item: ExtractedItem): any {
    try {
      return JSON.parse(item.currentValue);
    } catch {
      return { description: item.currentValue };
    }
  }

  // 1. Parties
  const partyItems = approvedItems.filter((i) => i.itemType === "party");
  const parties: SummaryParty[] = partyItems.map((item) => {
    const val = parseVal(item);
    return {
      name: val.name || "Unnamed Party",
      role: val.role || "Party",
      citation: `[${item.sourceSectionLabel}${item.page ? `, p.${item.page}` : ""}] "${item.exactQuote}"`,
    };
  });

  // 2. Key Dates
  const effItem = approvedItems.find((i) => i.itemType === "effective_date");
  const effVal = effItem ? parseVal(effItem) : null;
  const effectiveDate = effItem?.manualDateOverride || effItem?.calculatedDate || effVal?.date || null;

  const expItem = approvedItems.find((i) => i.itemType === "expiry");
  const expVal = expItem ? parseVal(expItem) : null;
  const expiryDate = expItem?.manualDateOverride || expItem?.calculatedDate || expVal?.expiryDate || null;

  const renewalNoticeItem = approvedItems.find(
    (i) => i.itemType === "renewal" || i.itemType === "notice"
  );
  const noticeDeadline =
    renewalNoticeItem?.manualDateOverride || renewalNoticeItem?.calculatedDate || null;

  const keyDateCitations = [
    effItem ? `Effective Date: [${effItem.sourceSectionLabel}] "${effItem.exactQuote}"` : "",
    expItem ? `Expiry: [${expItem.sourceSectionLabel}] "${expItem.exactQuote}"` : "",
    renewalNoticeItem
      ? `Notice: [${renewalNoticeItem.sourceSectionLabel}] "${renewalNoticeItem.exactQuote}"`
      : "",
  ]
    .filter(Boolean)
    .join(" | ");

  // 3. Renewal Terms
  const renewalItem = approvedItems.find((i) => i.itemType === "renewal");
  const renewalVal = renewalItem ? parseVal(renewalItem) : null;
  const renewalTerms = {
    isAutoRenew: !!renewalVal?.isAutoRenew,
    summary:
      renewalVal?.conditions ||
      (renewalVal?.isAutoRenew
        ? `Automatically renews${renewalVal.renewalTermMonths ? ` for ${renewalVal.renewalTermMonths} months` : ""}. Notice required: ${renewalVal.noticePeriodDays || renewalVal.noticePeriodMonths || 30} days.`
        : "Does not auto-renew."),
    citation: renewalItem
      ? `[${renewalItem.sourceSectionLabel}${renewalItem.page ? `, p.${renewalItem.page}` : ""}] "${renewalItem.exactQuote}"`
      : "Not specified in approved items",
  };

  // 4. Termination Terms
  const termItem = approvedItems.find((i) => i.itemType === "termination");
  const termVal = termItem ? parseVal(termItem) : null;
  const terminationTerms = {
    summary:
      termVal?.summary ||
      (termVal?.forCauseAllowed ? "Termination for cause permitted." : "No explicit termination summary approved."),
    citation: termItem
      ? `[${termItem.sourceSectionLabel}${termItem.page ? `, p.${termItem.page}` : ""}] "${termItem.exactQuote}"`
      : "Not specified in approved items",
  };

  // 5. Obligations
  const obligationItems = approvedItems.filter((i) => i.itemType === "obligation");
  const obligations: SummaryObligation[] = obligationItems.map((item) => {
    const val = parseVal(item);
    return {
      description: val.description || item.currentValue,
      responsibleParty: val.responsibleParty || "Unassigned",
      type: val.obligationType || "other",
      deadline: item.manualDateOverride || item.calculatedDate || val.deadlineDate || val.relativeDeadline || "Ongoing",
      recurrence: val.recurrence || "one_time",
      citation: `[${item.sourceSectionLabel}${item.page ? `, p.${item.page}` : ""}] "${item.exactQuote}"`,
    };
  });

  // 6. Open Questions and Clarifications
  const questionItems = items.filter(
    (i) => i.itemType === "clarification_question" || i.itemType === "ambiguity"
  );
  const openQuestionsAndAmbiguities: SummaryAmbiguity[] = questionItems.map((item) => {
    const val = parseVal(item);
    return {
      description: val.question || val.description || item.currentValue,
      userAnswer: val.userAnswer || null,
      citation: `[${item.sourceSectionLabel}] "${item.exactQuote}"`,
    };
  });

  // 7. Markdown Generation
  const markdown = `
# Reviewed Contract Summary: ${contractTitle} (v${versionNumber})

> **DISCLAIMER:** ${LEGAL_DISCLAIMER}
>
> *Generated on: ${new Date(generatedAt).toUTCString()}*

---

## 1. Contracting Parties
${
  parties.length === 0
    ? "_No contracting parties approved._"
    : parties
        .map((p) => `- **${p.name}** (${p.role})\n  - Source: ${p.citation}`)
        .join("\n")
}

## 2. Key Dates
- **Effective Date:** ${effectiveDate || "Not confirmed"}
- **Contract Expiry Date:** ${expiryDate || "Not confirmed"}
- **Notice Deadline:** ${noticeDeadline || "Not confirmed"}
- **Citations:** ${keyDateCitations || "None"}

## 3. Term, Renewal & Termination
- **Renewal:** ${renewalTerms.summary}
  - Source: ${renewalTerms.citation}
- **Termination:** ${terminationTerms.summary}
  - Source: ${terminationTerms.citation}

## 4. Approved Obligations
| Responsible Party | Obligation | Deadline | Recurrence | Source Citation |
|:---|:---|:---|:---|:---|
${
  obligations.length === 0
    ? "| - | _No approved obligations_ | - | - | - |"
    : obligations
        .map(
          (o) =>
            `| ${o.responsibleParty} | ${o.description.replace(/\|/g, "/")} | ${o.deadline} | ${o.recurrence} | ${o.citation.replace(/\|/g, "/")} |`
        )
        .join("\n")
}

## 5. Open Questions & Ambiguities
${
  openQuestionsAndAmbiguities.length === 0
    ? "_No open ambiguities or clarification questions recorded._"
    : openQuestionsAndAmbiguities
        .map(
          (q) =>
            `- **Item:** ${q.description}\n  - **Resolution / Answer:** ${q.userAnswer ? `_${q.userAnswer}_` : "**Pending Reviewer Answer**"}\n  - Source: ${q.citation}`
        )
        .join("\n")
}

---

## 6. Review Metrics
- **Total Approved Items:** ${approvedItems.length}
- **Rejected Items:** ${rejectedItems.length}
- **Stale Items Flagged:** ${staleItems.length}
`.trim();

  // 8. Printable HTML Generation (with print-to-PDF CSS rules)
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Reviewed Summary - ${contractTitle} (v${versionNumber})</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; line-height: 1.5; padding: 2rem; max-width: 900px; margin: auto; }
    h1 { font-size: 1.75rem; border-bottom: 2px solid #0284c7; padding-bottom: 0.5rem; margin-bottom: 0.25rem; }
    h2 { font-size: 1.25rem; margin-top: 1.5rem; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.25rem; }
    .disclaimer { background: #fef3c7; border: 1px solid #f59e0b; color: #78350f; padding: 0.75rem 1rem; border-radius: 0.5rem; font-size: 0.85rem; font-weight: 500; margin: 1rem 0; }
    .meta { font-size: 0.85rem; color: #64748b; margin-bottom: 1.5rem; }
    table { width: 100%; border-collapse: collapse; margin-top: 0.75rem; font-size: 0.85rem; }
    th, td { border: 1px solid #cbd5e1; padding: 0.5rem 0.75rem; text-align: left; }
    th { background: #f8fafc; font-weight: 600; }
    .citation { font-style: italic; color: #64748b; font-size: 0.8rem; }
    .metrics { display: flex; gap: 1.5rem; margin-top: 1rem; }
    .metric-card { background: #f1f5f9; padding: 0.75rem 1rem; border-radius: 0.375rem; font-size: 0.85rem; font-weight: 600; }
    @media print {
      body { padding: 0; font-size: 11pt; }
      .no-print { display: none; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>Reviewed Contract Summary: ${contractTitle}</h1>
  <div class="meta">Contract Version: v${versionNumber} | Generated At: ${new Date(generatedAt).toUTCString()}</div>
  <div class="disclaimer">
    <strong>DISCLAIMER:</strong> ${LEGAL_DISCLAIMER}
  </div>

  <h2>1. Contracting Parties</h2>
  <ul>
    ${
      parties.length === 0
        ? "<li>No contracting parties approved.</li>"
        : parties
            .map(
              (p) =>
                `<li><strong>${p.name}</strong> (${p.role})<br><span class="citation">Source: ${p.citation}</span></li>`
            )
            .join("")
    }
  </ul>

  <h2>2. Key Dates</h2>
  <ul>
    <li><strong>Effective Date:</strong> ${effectiveDate || "Not confirmed"}</li>
    <li><strong>Contract Expiry Date:</strong> ${expiryDate || "Not confirmed"}</li>
    <li><strong>Notice Deadline:</strong> ${noticeDeadline || "Not confirmed"}</li>
  </ul>
  <p class="citation">Citations: ${keyDateCitations || "None"}</p>

  <h2>3. Term, Renewal & Termination</h2>
  <ul>
    <li><strong>Renewal:</strong> ${renewalTerms.summary}<br><span class="citation">Source: ${renewalTerms.citation}</span></li>
    <li><strong>Termination:</strong> ${terminationTerms.summary}<br><span class="citation">Source: ${terminationTerms.citation}</span></li>
  </ul>

  <h2>4. Approved Obligations</h2>
  <table>
    <thead>
      <tr>
        <th>Responsible Party</th>
        <th>Obligation</th>
        <th>Deadline</th>
        <th>Recurrence</th>
        <th>Source Citation</th>
      </tr>
    </thead>
    <tbody>
      ${
        obligations.length === 0
          ? "<tr><td colspan='5'>No approved obligations</td></tr>"
          : obligations
              .map(
                (o) =>
                  `<tr><td>${o.responsibleParty}</td><td>${o.description}</td><td>${o.deadline}</td><td>${o.recurrence}</td><td class="citation">${o.citation}</td></tr>`
              )
              .join("")
      }
    </tbody>
  </table>

  <h2>5. Open Questions & Ambiguities</h2>
  <ul>
    ${
      openQuestionsAndAmbiguities.length === 0
        ? "<li>No open ambiguities or questions recorded.</li>"
        : openQuestionsAndAmbiguities
            .map(
              (q) =>
                `<li><strong>${q.description}</strong><br>Answer: <em>${q.userAnswer || "Pending Reviewer Answer"}</em><br><span class="citation">Source: ${q.citation}</span></li>`
            )
            .join("")
    }
  </ul>

  <h2>6. Review Summary Metrics</h2>
  <div class="metrics">
    <div class="metric-card">Total Approved: ${approvedItems.length}</div>
    <div class="metric-card">Rejected Items: ${rejectedItems.length}</div>
    <div class="metric-card">Stale Items Flagged: ${staleItems.length}</div>
  </div>
</body>
</html>
`.trim();

  return {
    contractTitle,
    versionNumber,
    generatedAt,
    disclaimer: LEGAL_DISCLAIMER,
    parties,
    keyDates: {
      effectiveDate,
      expiryDate,
      noticeDeadline,
      citation: keyDateCitations,
    },
    renewalTerms,
    terminationTerms,
    obligations,
    openQuestionsAndAmbiguities,
    metrics: {
      totalApproved: approvedItems.length,
      totalRejected: rejectedItems.length,
      totalStale: staleItems.length,
    },
    markdown,
    html,
  };
}

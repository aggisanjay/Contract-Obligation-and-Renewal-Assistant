/**
 * Deterministic Post-Filter for Legal Advice Guardrails.
 *
 * POSITIONING REQUIREMENT:
 * This tool is strictly an information-management tool and must NEVER provide legal advice.
 * This filter inspects all LLM output strings and structures, flags advisory or normative legal language,
 * and strips or neutralizes it before saving or returning to the user.
 */

// Patterns indicating legal advice or recommendations
const ADVISORY_PATTERNS: Array<{ regex: RegExp; replacement: string; reason: string }> = [
  {
    regex: /\b(?:you\s+should|you\s+must|we\s+advise\s+you\s+to|we\s+recommend\s+(?:that\s+you\s+)?)\s*(?:terminate|cancel|renegotiate|sue|sign|avoid|reject|dispute)\b/gi,
    replacement: "[Advisory recommendation removed: consult legal counsel]",
    reason: "Direct legal recommendation detected",
  },
  {
    regex: /\b(?:this\s+clause\s+is\s+unenforceable|this\s+is\s+unenforceable|void\s+ab\s+initio|legally\s+invalid)\b/gi,
    replacement: "[Legal validity assertion removed]",
    reason: "Enforceability or legal validity claim detected",
  },
  {
    regex: /\b(?:legally\s+risky|high\s+legal\s+risk|poses\s+significant\s+liability\s+risk|you\s+face\s+liability)\b/gi,
    replacement: "[Subjective risk opinion removed]",
    reason: "Subjective legal risk opinion detected",
  },
  {
    regex: /\b(?:in\s+violation\s+of\s+the\s+law|illegal\s+under\s+state\s+law|unlawful\s+provision)\b/gi,
    replacement: "[Legal conclusion removed]",
    reason: "Legal conclusion on legality detected",
  },
];

export interface GuardrailCheckResult {
  isClean: boolean;
  sanitizedText: string;
  violations: string[];
}

/**
 * Sanitizes a single string by flagging and replacing advisory language.
 */
export function sanitizeAdvisoryContent(text: string): GuardrailCheckResult {
  let sanitizedText = text;
  const violations: string[] = [];

  for (const { regex, replacement, reason } of ADVISORY_PATTERNS) {
    if (regex.test(sanitizedText)) {
      violations.push(reason);
      sanitizedText = sanitizedText.replace(regex, replacement);
    }
  }

  return {
    isClean: violations.length === 0,
    sanitizedText,
    violations,
  };
}

/**
 * Recursively scans and sanitizes an object or array of extracted data.
 */
export function sanitizePayloadRecursively<T>(obj: T): { sanitized: T; flaggedCount: number } {
  let flaggedCount = 0;

  function walk(value: unknown): unknown {
    if (typeof value === "string") {
      const check = sanitizeAdvisoryContent(value);
      if (!check.isClean) {
        flaggedCount += check.violations.length;
      }
      return check.sanitizedText;
    }
    if (Array.isArray(value)) {
      return value.map(walk);
    }
    if (value !== null && typeof value === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = walk(val);
      }
      return result;
    }
    return value;
  }

  const sanitized = walk(obj) as T;
  return { sanitized, flaggedCount };
}

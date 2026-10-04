import {
  addDays,
  addMonths,
  subDays,
  subMonths,
  format,
  parseISO,
  isValid,
  isBefore,
  isEqual,
  endOfMonth,
  getDate,
} from "date-fns";

export interface RelativeDeadlineRule {
  quantity: number; // e.g. 30
  unit: "days" | "weeks" | "months" | "years";
  direction: "after" | "before";
  anchor: "effective_date" | "expiry" | "renewal" | "execution" | "invoice_receipt";
}

export interface ReminderConfig {
  offsetsDays?: number[]; // default [30, 14, 7, 1]
  today?: string; // Injectable YYYY-MM-DD for deterministic testing
}

export interface ComputeExpiryOptions {
  effectiveDate: string; // YYYY-MM-DD
  termMonths?: number | null;
  termYears?: number | null;
  exactExpiryDate?: string | null; // YYYY-MM-DD
}

export interface ComputeNoticeDeadlineOptions {
  expiryDate: string; // YYYY-MM-DD
  noticeDays?: number | null;
  noticeMonths?: number | null;
}

export interface DateResultResolved {
  status: "resolved";
  date: string; // YYYY-MM-DD
  sourceRule: string;
  reminders: string[]; // YYYY-MM-DD reminder dates
  nextOccurrences?: string[]; // For recurring events
}

export interface DateResultNeedsInput {
  status: "needs_input";
  reason: string;
}

export interface DateResultNotApplicable {
  status: "not_applicable";
}

export type DateResolutionResult =
  | DateResultResolved
  | DateResultNeedsInput
  | DateResultNotApplicable;

/**
 * Validates whether a string is a valid YYYY-MM-DD date format.
 */
export function isValidDateString(dateStr: string | null | undefined): boolean {
  if (!dateStr || typeof dateStr !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const parsed = parseISO(dateStr);
  return isValid(parsed);
}

/**
 * Formats a Date object to plain UTC YYYY-MM-DD string.
 */
export function toDateString(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/**
 * Parses YYYY-MM-DD safely into a UTC-normalized Date object.
 */
export function parseDateString(dateStr: string): Date {
  const parts = dateStr.split("-");
  const year = parseInt(parts[0] || "0", 10);
  const month = parseInt(parts[1] || "1", 10) - 1;
  const day = parseInt(parts[2] || "1", 10);
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
}

/**
 * Clamps date to the end of the month if adding months lands past month end.
 * Handles month-end clamping (e.g. Jan 31 + 1 month -> Feb 28/29).
 */
export function addMonthsClamped(dateStr: string, monthsToAdd: number): string {
  const parsed = parseDateString(dateStr);
  const originalDay = getDate(parsed);
  const calculated = addMonths(parsed, monthsToAdd);
  const maxDayInTargetMonth = getDate(endOfMonth(calculated));

  if (originalDay > maxDayInTargetMonth) {
    return toDateString(endOfMonth(calculated));
  }
  return toDateString(calculated);
}

/**
 * Computes contract expiry date from effective date and term duration.
 * Month-end clamping (e.g. Jan 31 + 1 month = Feb 28 or 29).
 */
export function computeExpiryDate(
  options: ComputeExpiryOptions,
  config?: ReminderConfig
): DateResolutionResult {
  if (options.exactExpiryDate && isValidDateString(options.exactExpiryDate)) {
    return {
      status: "resolved",
      date: options.exactExpiryDate,
      sourceRule: "Explicit contract expiry date",
      reminders: generateReminders(options.exactExpiryDate, config),
    };
  }

  if (!options.effectiveDate || !isValidDateString(options.effectiveDate)) {
    return {
      status: "needs_input",
      reason: "Missing or invalid Effective Date. Expiry cannot be computed.",
    };
  }

  const totalMonths =
    (options.termMonths || 0) + (options.termYears ? options.termYears * 12 : 0);

  if (totalMonths <= 0) {
    return {
      status: "needs_input",
      reason: "Term duration is not specified or zero months.",
    };
  }

  const expiry = addMonthsClamped(options.effectiveDate, totalMonths);

  return {
    status: "resolved",
    date: expiry,
    sourceRule: `Effective date (${options.effectiveDate}) + ${totalMonths} months`,
    reminders: generateReminders(expiry, config),
  };
}

/**
 * Computes non-renewal or termination notice deadline:
 * notice deadline = expiry (or renewal date) minus notice period.
 */
export function computeNoticeDeadline(
  options: ComputeNoticeDeadlineOptions,
  config?: ReminderConfig
): DateResolutionResult {
  if (!options.expiryDate || !isValidDateString(options.expiryDate)) {
    return {
      status: "needs_input",
      reason: "Expiry date is missing or invalid. Notice deadline cannot be computed.",
    };
  }

  const noticeDays = options.noticeDays ?? 0;
  const noticeMonths = options.noticeMonths ?? 0;

  if (noticeDays < 0 || noticeMonths < 0) {
    return {
      status: "needs_input",
      reason: "Notice period cannot be negative.",
    };
  }

  if (noticeDays === 0 && noticeMonths === 0) {
    return {
      status: "needs_input",
      reason: "Notice period is not specified or zero.",
    };
  }

  const expiryParsed = parseDateString(options.expiryDate);
  let deadlineDate = expiryParsed;

  if (noticeMonths > 0) {
    deadlineDate = subMonths(deadlineDate, noticeMonths);
  }
  if (noticeDays > 0) {
    deadlineDate = subDays(deadlineDate, noticeDays);
  }

  const deadlineStr = toDateString(deadlineDate);

  // Notice period longer than the term / lands in the past or before effective date
  return {
    status: "resolved",
    date: deadlineStr,
    sourceRule: `Expiry (${options.expiryDate}) minus ${noticeMonths ? `${noticeMonths} month(s) ` : ""}${noticeDays ? `${noticeDays} day(s)` : ""}`.trim(),
    reminders: generateReminders(deadlineStr, config),
  };
}

/**
 * Generates reminder dates at configurable offsets before target date (default 30, 14, 7, 1 days).
 * Automatically suppresses reminders that fall in the past relative to `today`.
 */
export function generateReminders(
  targetDateStr: string,
  config?: ReminderConfig
): string[] {
  if (!isValidDateString(targetDateStr)) return [];

  const offsets = config?.offsetsDays ?? [30, 14, 7, 1];
  const todayStr = config?.today || format(new Date(), "yyyy-MM-dd");
  const todayDate = parseDateString(todayStr);
  const targetDate = parseDateString(targetDateStr);

  const reminders: string[] = [];

  for (const offset of offsets) {
    const reminderDate = subDays(targetDate, offset);
    // Skip if reminder is strictly before today (in the past)
    if (isBefore(reminderDate, todayDate) && !isEqual(reminderDate, todayDate)) {
      continue;
    }
    const remStr = toDateString(reminderDate);
    if (!reminders.includes(remStr)) {
      reminders.push(remStr);
    }
  }

  return reminders.sort();
}

/**
 * Expands recurring events (monthly, quarterly, semi-annual, annual) into the next N occurrences.
 */
export function generateRecurringOccurrences(
  startDateStr: string,
  recurrence: "monthly" | "quarterly" | "semi_annual" | "annual",
  count: number = 4
): string[] {
  if (!isValidDateString(startDateStr) || count <= 0) return [];

  const monthSteps: Record<string, number> = {
    monthly: 1,
    quarterly: 3,
    semi_annual: 6,
    annual: 12,
  };

  const step = monthSteps[recurrence] || 1;
  const occurrences: string[] = [];
  let currentDate = startDateStr;

  for (let i = 0; i < count; i++) {
    currentDate = addMonthsClamped(currentDate, step);
    occurrences.push(currentDate);
  }

  return occurrences;
}

/**
 * Resolves a relative deadline rule into a concrete YYYY-MM-DD date.
 * e.g. "within 30 days of effective date", "end of initial term", "3 months before expiry".
 */
export function resolveRelativeDeadline(
  textRule: string,
  context: {
    effectiveDate?: string | null;
    expiryDate?: string | null;
    invoiceReceiptDate?: string | null;
    today?: string;
  }
): DateResolutionResult {
  const normalized = textRule.toLowerCase().trim();

  // Pattern: "within X days of effective date" / "X days after effective date"
  const daysAfterEffective = normalized.match(
    /(?:within\s+)?(\d+)\s+days?\s+(?:after|from|following|of)\s+(?:the\s+)?effective\s+date/
  );
  if (daysAfterEffective) {
    const days = parseInt(daysAfterEffective[1] || "0", 10);
    if (!context.effectiveDate || !isValidDateString(context.effectiveDate)) {
      return {
        status: "needs_input",
        reason: "Effective Date is required to resolve this deadline.",
      };
    }
    const resolved = toDateString(addDays(parseDateString(context.effectiveDate), days));
    return {
      status: "resolved",
      date: resolved,
      sourceRule: `${days} days after Effective Date (${context.effectiveDate})`,
      reminders: generateReminders(resolved, { today: context.today }),
    };
  }

  // Pattern: "X months before expiry" / "X days prior to expiry"
  const daysBeforeExpiry = normalized.match(
    /(\d+)\s+days?\s+(?:before|prior\s+to|in\s+advance\s+of)\s+(?:the\s+)?(?:expiry|expiration|end\s+of\s+term)/
  );
  if (daysBeforeExpiry) {
    const days = parseInt(daysBeforeExpiry[1] || "0", 10);
    if (!context.expiryDate || !isValidDateString(context.expiryDate)) {
      return {
        status: "needs_input",
        reason: "Expiry Date is required to resolve this deadline.",
      };
    }
    const resolved = toDateString(subDays(parseDateString(context.expiryDate), days));
    return {
      status: "resolved",
      date: resolved,
      sourceRule: `${days} days prior to Expiry (${context.expiryDate})`,
      reminders: generateReminders(resolved, { today: context.today }),
    };
  }

  // Pattern: "X months after effective date"
  const monthsAfterEffective = normalized.match(
    /(\d+)\s+months?\s+(?:after|following|from)\s+(?:the\s+)?effective\s+date/
  );
  if (monthsAfterEffective) {
    const months = parseInt(monthsAfterEffective[1] || "0", 10);
    if (!context.effectiveDate || !isValidDateString(context.effectiveDate)) {
      return {
        status: "needs_input",
        reason: "Effective Date is required to resolve this deadline.",
      };
    }
    const resolved = addMonthsClamped(context.effectiveDate, months);
    return {
      status: "resolved",
      date: resolved,
      sourceRule: `${months} months after Effective Date (${context.effectiveDate})`,
      reminders: generateReminders(resolved, { today: context.today }),
    };
  }

  // Pattern: "end of initial term"
  if (normalized.includes("end of the initial term") || normalized.includes("end of initial term")) {
    if (!context.expiryDate || !isValidDateString(context.expiryDate)) {
      return {
        status: "needs_input",
        reason: "Expiry date is missing to determine the end of the initial term.",
      };
    }
    return {
      status: "resolved",
      date: context.expiryDate,
      sourceRule: `End of initial term (${context.expiryDate})`,
      reminders: generateReminders(context.expiryDate, { today: context.today }),
    };
  }

  return {
    status: "needs_input",
    reason: `Could not parse relative deadline rule: "${textRule}". Manual date entry required.`,
  };
}

/**
 * Handles manual date overrides, preserving both computed and manual values.
 */
export function applyManualOverride(
  originalComputedDate: string | null,
  overrideDate: string,
  reason?: string
): {
  calculatedDate: string | null;
  manualDateOverride: string;
  isOverridden: boolean;
  status: "resolved" | "needs_input";
  reason: string;
} {
  if (!isValidDateString(overrideDate)) {
    return {
      calculatedDate: originalComputedDate,
      manualDateOverride: overrideDate,
      isOverridden: false,
      status: "needs_input",
      reason: "Manual date override format must be YYYY-MM-DD.",
    };
  }

  return {
    calculatedDate: originalComputedDate,
    manualDateOverride: overrideDate,
    isOverridden: true,
    status: "resolved",
    reason: reason || "Manually overridden by reviewer",
  };
}

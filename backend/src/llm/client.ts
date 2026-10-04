import { z } from "zod";
import { logger } from "../utils/logger.js";
import { sanitizePayloadRecursively } from "./guardrailFilter.js";

export interface LLMGenerateOptions {
  temperature?: number;
  maxRetries?: number;
  requestId?: string;
  stepName?: string;
}

export interface LLMClient {
  isMock(): boolean;
  generateStructured<T>(
    prompt: string,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    systemInstruction?: string,
    options?: LLMGenerateOptions
  ): Promise<T>;
}

/**
 * Deterministic Mock LLM client used in tests and demo mode when no GEMINI_API_KEY is configured.
 */
export class MockLLMClient implements LLMClient {
  private customHandler?: (prompt: string) => unknown;

  constructor(customHandler?: (prompt: string) => unknown) {
    this.customHandler = customHandler;
  }

  isMock(): boolean {
    return true;
  }

  setHandler(handler: (prompt: string) => unknown) {
    this.customHandler = handler;
  }

  async generateStructured<T>(
    prompt: string,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    _systemInstruction?: string,
    options?: LLMGenerateOptions
  ): Promise<T> {
    logger.info({ step: options?.stepName || "mock_llm" }, "Using MockLLMClient (demo/test mode)");

    if (this.customHandler) {
      const customResult = this.customHandler(prompt);
      const parsed = schema.parse(customResult);
      const { sanitized } = sanitizePayloadRecursively(parsed);
      return sanitized;
    }

    // Default mock behavior inspects prompt keywords to provide structured sample outputs
    const lowerPrompt = prompt.toLowerCase();
    let mockData: unknown = {};

    const step = options?.stepName || "";
    if (step === "parties_and_effective_date" || (!step && lowerPrompt.includes("extract contracting parties"))) {
      mockData = {
        parties: [
          {
            name: "Acme Cloud Services Inc.",
            role: "Vendor",
            address: "100 Tech Blvd, San Francisco, CA",
            sourceSectionLabel: "Preamble",
            exactQuote: 'This Master Services Agreement is entered into by Acme Cloud Services Inc. ("Vendor")',
            confidence: 0.98,
            status: "confirmed",
          },
          {
            name: "Apex Logistics LLC",
            role: "Customer",
            address: "500 Supply Chain Way, Chicago, IL",
            sourceSectionLabel: "Preamble",
            exactQuote: 'and Apex Logistics LLC ("Customer").',
            confidence: 0.98,
            status: "confirmed",
          },
        ],
        effectiveDate: {
          date: "2025-01-01",
          isRelative: false,
          sourceSectionLabel: "Section 1",
          exactQuote: "The Effective Date of this Agreement shall be January 1, 2025.",
          confidence: 0.99,
          status: "confirmed",
        },
      };
    } else if (step === "term_and_renewal" || (!step && lowerPrompt.includes("extract term, expiry, renewal"))) {
      mockData = {
        term: {
          termLengthMonths: 12,
          termLengthYears: 1,
          expiryDate: "2026-01-01",
          isPerpetual: false,
          description: "Initial term of twelve (12) months from the Effective Date.",
          sourceSectionLabel: "Section 2",
          exactQuote: "The initial term of this Agreement shall commence on the Effective Date and continue for twelve (12) months.",
          confidence: 0.95,
          status: "confirmed",
        },
        renewal: {
          isAutoRenew: true,
          renewalTermMonths: 12,
          noticePeriodDays: 30,
          conditions: "Renews automatically for 1-year terms unless either party gives 30 days notice.",
          sourceSectionLabel: "Section 2.1",
          exactQuote: "This Agreement shall automatically renew for additional one-year terms unless either party provides written notice of non-renewal at least thirty (30) days prior.",
          confidence: 0.96,
          status: "confirmed",
        },
        termination: {
          forCauseAllowed: true,
          forConvenienceAllowed: false,
          curePeriodDays: 30,
          summary: "Termination for material breach with 30 days written cure notice.",
          sourceSectionLabel: "Section 8.1",
          exactQuote: "Either party may terminate upon thirty (30) days written notice in the event of a material breach.",
          confidence: 0.92,
          status: "confirmed",
        },
        notice: {
          noticePeriodDays: 30,
          method: "Certified email or courier",
          recipient: "Notices Officer",
          sourceSectionLabel: "Section 12",
          exactQuote: "All notices under this Agreement shall be in writing and delivered via email or certified courier.",
          confidence: 0.9,
          status: "confirmed",
        },
      };
    } else if (step === "obligations" || (!step && lowerPrompt.includes("extract concrete obligations"))) {
      mockData = {
        obligations: [
          {
            description: "Client shall pay invoices within 30 days of receipt.",
            responsibleParty: "Customer",
            obligationType: "payment",
            deadlineDate: null,
            relativeDeadline: "within 30 days of receiving invoice",
            recurrence: "monthly",
            recurrenceRule: "Monthly upon invoice receipt",
            sourceSectionLabel: "Section 4.2",
            exactQuote: "Client shall remit payment within thirty (30) days following receipt of each monthly invoice.",
            confidence: 0.95,
            status: "confirmed",
          },
          {
            description: "Vendor must deliver quarterly SLA performance uptime reports.",
            responsibleParty: "Vendor",
            obligationType: "reporting",
            deadlineDate: null,
            relativeDeadline: "within 15 days following the end of each calendar quarter",
            recurrence: "quarterly",
            recurrenceRule: "Quarterly end + 15 days",
            sourceSectionLabel: "Section 6.1",
            exactQuote: "Vendor shall provide quarterly uptime reports within fifteen (15) days after each calendar quarter.",
            confidence: 0.93,
            status: "confirmed",
          },
        ],
      };
    } else if (
      step === "ambiguities_and_conflicts" ||
      (!step && lowerPrompt.includes("identify factual ambiguities"))
    ) {
      mockData = {
        ambiguitiesAndConflicts: [
          {
            issueType: "unclear_term",
            description: "Clause references 'Commercially Reasonable Efforts' for support resolution times without defining specific target hours or metric.",
            sourceSectionLabel: "Section 5.2",
            exactQuote: "Vendor will use commercially reasonable efforts to resolve support tickets promptly.",
            confidence: 0.85,
            status: "uncertain",
            uncertaintyReason: "Undefined response SLA hours",
          },
        ],
      };
    } else if (
      step === "clarification_questions" ||
      (!step && lowerPrompt.includes("formulate neutral clarification questions"))
    ) {
      mockData = {
        clarificationQuestions: [
          {
            question: "What specific response time or severity level applies to support tickets under Section 5.2?",
            targetClause: "Section 5.2 Support Resolution",
            sourceSectionLabel: "Section 5.2",
            exactQuote: "Vendor will use commercially reasonable efforts to resolve support tickets promptly.",
            confidence: 0.9,
            status: "uncertain",
            uncertaintyReason: "Lacks measurable target",
          },
        ],
      };
    }

    const parsed = schema.parse(mockData);
    const { sanitized } = sanitizePayloadRecursively(parsed);
    return sanitized;
  }
}

/**
 * Normalizes output from diverse LLM providers (Gemini, Groq, Hugging Face)
 * before schema validation, ensuring structural resilience against common LLM
 * quirks (such as raw arrays instead of { items: [...] }, variant property names,
 * or wrapped expiry date objects).
 */
export function normalizeLLMOutput(data: unknown, stepName?: string): unknown {
  if (!data) return data;

  const step = stepName || "";

  // 1. If LLM returned raw array directly when object with array was expected
  if (Array.isArray(data)) {
    if (step === "obligations") return { obligations: data };
    if (step === "ambiguities_and_conflicts") return { ambiguitiesAndConflicts: data };
    if (step === "clarification_questions") return { clarificationQuestions: data };
    if (step === "parties_and_effective_date") return { parties: data };
    return { items: data };
  }

  if (typeof data !== "object") return data;

  const obj = { ...(data as Record<string, unknown>) };

  // 2. Unpack generic "items" or aliases
  if (Array.isArray(obj.items)) {
    if (step === "obligations" && !obj.obligations) obj.obligations = obj.items;
    if (step === "ambiguities_and_conflicts" && !obj.ambiguitiesAndConflicts) obj.ambiguitiesAndConflicts = obj.items;
    if (step === "clarification_questions" && !obj.clarificationQuestions) obj.clarificationQuestions = obj.items;
    if (step === "parties_and_effective_date" && !obj.parties) obj.parties = obj.items;
  }

  // 3. Step-specific array property aliases
  if (step === "obligations") {
    if (!obj.obligations && Array.isArray(obj.tasks)) obj.obligations = obj.tasks;
    if (!obj.obligations && Array.isArray(obj.deliverables)) obj.obligations = obj.deliverables;
    if (!obj.obligations && Array.isArray(obj.data)) obj.obligations = obj.data;
    if (!Array.isArray(obj.obligations)) obj.obligations = [];
  } else if (step === "ambiguities_and_conflicts") {
    if (!obj.ambiguitiesAndConflicts && Array.isArray(obj.ambiguities)) obj.ambiguitiesAndConflicts = obj.ambiguities;
    if (!obj.ambiguitiesAndConflicts && Array.isArray(obj.conflicts)) obj.ambiguitiesAndConflicts = obj.conflicts;
    if (!obj.ambiguitiesAndConflicts && Array.isArray(obj.data)) obj.ambiguitiesAndConflicts = obj.data;
    if (!Array.isArray(obj.ambiguitiesAndConflicts)) obj.ambiguitiesAndConflicts = [];
  } else if (step === "clarification_questions") {
    if (!obj.clarificationQuestions && Array.isArray(obj.questions)) obj.clarificationQuestions = obj.questions;
    if (!obj.clarificationQuestions && Array.isArray(obj.data)) obj.clarificationQuestions = obj.data;
    if (!Array.isArray(obj.clarificationQuestions)) obj.clarificationQuestions = [];
  } else if (step === "term_and_renewal") {
    // If sections were returned as arrays, take the first element
    if (Array.isArray(obj.term)) obj.term = obj.term[0];
    if (Array.isArray(obj.renewal)) obj.renewal = obj.renewal[0];
    if (Array.isArray(obj.termination)) obj.termination = obj.termination[0];
    if (Array.isArray(obj.notice)) obj.notice = obj.notice[0];
  }

  return obj;
}

/**
 * Gemini LLM Client using official @google/genai SDK.
 */
export class GeminiClient implements LLMClient {
  private apiKey: string;
  private modelName: string;
  private aiInstance: {
    models: {
      generateContent: (args: {
        model: string;
        contents: string;
        config?: {
          systemInstruction?: string;
          responseMimeType?: string;
          temperature?: number;
        };
      }) => Promise<{ text?: string }>;
    };
  } | null = null;

  constructor(apiKey: string, modelName: string = "gemini-2.5-flash") {
    this.apiKey = apiKey;
    this.modelName = modelName;
  }

  isMock(): boolean {
    return false;
  }

  private async getAI() {
    if (!this.aiInstance) {
      const { GoogleGenAI } = await import("@google/genai");
      this.aiInstance = new GoogleGenAI({ apiKey: this.apiKey }) as unknown as typeof this.aiInstance;
    }
    return this.aiInstance!;
  }

  async generateStructured<T>(
    prompt: string,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    systemInstruction?: string,
    options?: LLMGenerateOptions
  ): Promise<T> {
    const ai = await this.getAI();
    const maxRetries = options?.maxRetries ?? 1; // Retry once on invalid JSON
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: this.modelName,
          contents: prompt,
          config: {
            systemInstruction:
              (systemInstruction ? `${systemInstruction}\n\n` : "") +
              "CRITICAL: Output strictly valid JSON matching the requested schema. Do NOT include markdown code blocks or prose. Never give legal advice.",
            responseMimeType: "application/json",
            temperature: options?.temperature ?? 0.1,
          },
        });

        const rawText = response.text || "";
        const cleanJson = rawText
          .replace(/^```json\s*/i, "")
          .replace(/```\s*$/i, "")
          .trim();

        const jsonObject = JSON.parse(cleanJson);
        const normalized = normalizeLLMOutput(jsonObject, options?.stepName);
        const parsed = schema.parse(normalized);

        // Run post-filter for advisory phrasing
        const { sanitized } = sanitizePayloadRecursively(parsed);
        return sanitized;
      } catch (err) {
        lastError = err;
        logger.warn(
          { attempt, maxRetries, err: (err as Error).message },
          "Gemini call or JSON parsing failed; retrying if attempts remain"
        );
      }
    }

    throw lastError;
  }
}

/**
 * Groq LLM Client using high-speed OpenAI-compatible REST API.
 */
export class GroqClient implements LLMClient {
  private apiKey: string;
  private modelName: string;
  private apiUrl: string;

  constructor(
    apiKey: string,
    modelName: string = "llama-3.3-70b-versatile",
    apiUrl: string = "https://api.groq.com/openai/v1/chat/completions"
  ) {
    this.apiKey = apiKey;
    this.modelName = modelName;
    this.apiUrl = apiUrl;
  }

  isMock(): boolean {
    return false;
  }

  async generateStructured<T>(
    prompt: string,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    systemInstruction?: string,
    options?: LLMGenerateOptions
  ): Promise<T> {
    const maxRetries = options?.maxRetries ?? 1;
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(this.apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.modelName,
            messages: [
              {
                role: "system",
                content:
                  (systemInstruction ? `${systemInstruction}\n\n` : "") +
                  "CRITICAL: Output strictly valid JSON matching the requested schema. Do NOT include markdown code blocks or prose. Never give legal advice.",
              },
              {
                role: "user",
                content: prompt,
              },
            ],
            response_format: { type: "json_object" },
            temperature: options?.temperature ?? 0.1,
          }),
          signal: AbortSignal.timeout(45000),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Groq API error HTTP ${response.status}: ${errText}`);
        }

        const data = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const rawContent = data.choices?.[0]?.message?.content || "";
        const cleanJson = rawContent
          .replace(/^```json\s*/i, "")
          .replace(/```\s*$/i, "")
          .trim();

        const jsonObject = JSON.parse(cleanJson);
        const normalized = normalizeLLMOutput(jsonObject, options?.stepName);
        const parsed = schema.parse(normalized);
        const { sanitized } = sanitizePayloadRecursively(parsed);
        return sanitized;
      } catch (err) {
        lastError = err;
        logger.warn(
          { attempt, maxRetries, err: (err as Error).message },
          "Groq call or JSON parsing failed; retrying if attempts remain"
        );
      }
    }

    throw lastError;
  }
}

/**
 * Hugging Face Inference Client using OpenAI-compatible Router endpoint.
 */
export class HuggingFaceClient implements LLMClient {
  private apiKey: string;
  private modelName: string;
  private apiUrl: string;

  constructor(
    apiKey: string,
    modelName: string = "Qwen/Qwen2.5-72B-Instruct",
    apiUrl: string = "https://router.huggingface.co/v1/chat/completions"
  ) {
    this.apiKey = apiKey;
    this.modelName = modelName;
    this.apiUrl = apiUrl;
  }

  isMock(): boolean {
    return false;
  }

  async generateStructured<T>(
    prompt: string,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    systemInstruction?: string,
    options?: LLMGenerateOptions
  ): Promise<T> {
    const maxRetries = options?.maxRetries ?? 1;
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(this.apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.modelName,
            messages: [
              {
                role: "system",
                content:
                  (systemInstruction ? `${systemInstruction}\n\n` : "") +
                  "CRITICAL: Output strictly valid JSON matching the requested schema. Do NOT include markdown code blocks or prose. Never give legal advice.",
              },
              {
                role: "user",
                content: prompt,
              },
            ],
            response_format: { type: "json_object" },
            temperature: options?.temperature ?? 0.1,
          }),
          signal: AbortSignal.timeout(60000),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`HuggingFace API error HTTP ${response.status}: ${errText}`);
        }

        const data = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const rawContent = data.choices?.[0]?.message?.content || "";
        const cleanJson = rawContent
          .replace(/^```json\s*/i, "")
          .replace(/```\s*$/i, "")
          .trim();

        const jsonObject = JSON.parse(cleanJson);
        const normalized = normalizeLLMOutput(jsonObject, options?.stepName);
        const parsed = schema.parse(normalized);
        const { sanitized } = sanitizePayloadRecursively(parsed);
        return sanitized;
      } catch (err) {
        lastError = err;
        logger.warn(
          { attempt, maxRetries, err: (err as Error).message },
          "HuggingFace call or JSON parsing failed; retrying if attempts remain"
        );
      }
    }

    throw lastError;
  }
}

export interface NamedLLMClient {
  name: string;
  client: LLMClient;
}

/**
 * Fallback Chain LLM Client:
 * Tries providers sequentially. If one provider encounters a rate limit (HTTP 429),
 * quota limit, or transient failure, it automatically falls back to the next configured provider!
 */
export class FallbackChainLLMClient implements LLMClient {
  private providers: NamedLLMClient[];

  constructor(providers: NamedLLMClient[]) {
    if (providers.length === 0) {
      throw new Error("FallbackChainLLMClient requires at least one provider");
    }
    this.providers = providers;
  }

  isMock(): boolean {
    return this.providers.every((p) => p.client.isMock());
  }

  getProviders(): NamedLLMClient[] {
    return this.providers;
  }

  async generateStructured<T>(
    prompt: string,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    systemInstruction?: string,
    options?: LLMGenerateOptions
  ): Promise<T> {
    const errors: Array<{ provider: string; error: string; isRateLimit: boolean }> = [];

    for (let i = 0; i < this.providers.length; i++) {
      const { name, client } = this.providers[i];
      try {
        logger.info(
          { provider: name, step: options?.stepName, providerIndex: i + 1, totalProviders: this.providers.length },
          `Attempting LLM extraction with provider: ${name}`
        );

        const result = await client.generateStructured(prompt, schema, systemInstruction, options);
        return result;
      } catch (err) {
        const errorMsg = (err as Error)?.message || String(err);
        const isRateLimit =
          errorMsg.includes("429") ||
          errorMsg.toLowerCase().includes("rate limit") ||
          errorMsg.toLowerCase().includes("quota") ||
          errorMsg.toLowerCase().includes("resource exhausted") ||
          errorMsg.includes("503");

        logger.warn(
          {
            provider: name,
            isRateLimit,
            error: errorMsg,
            hasNextProvider: i < this.providers.length - 1,
          },
          `LLM provider '${name}' failed${isRateLimit ? " [RATE LIMIT / QUOTA DETECTED]" : ""}. ${
            i < this.providers.length - 1 ? `Rolling over to next provider: ${this.providers[i + 1].name}` : "No more fallback providers."
          }`
        );

        errors.push({ provider: name, error: errorMsg, isRateLimit });
      }
    }

    throw new Error(
      `All ${this.providers.length} configured LLM providers in fallback chain failed:\n` +
        errors.map((e) => `• [${e.provider}${e.isRateLimit ? " (RATE LIMITED)" : ""}]: ${e.error}`).join("\n")
    );
  }
}

let activeClient: LLMClient | null = null;

/**
 * Factory for obtaining the configured LLMClient.
 * Assembles a FallbackChainLLMClient from all available providers:
 * Gemini -> Groq -> Hugging Face -> MockLLMClient (if none configured)
 */
export function getLLMClient(): LLMClient {
  // Use MockLLMClient in automated unit tests for speed and determinism
  if (process.env.NODE_ENV === "test" || process.env.VITEST) {
    return new MockLLMClient();
  }

  if (activeClient) return activeClient;

  const providers: NamedLLMClient[] = [];

  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  if (geminiKey) {
    providers.push({
      name: "Gemini",
      client: new GeminiClient(geminiKey, geminiModel),
    });
  }

  const groqKey = process.env.GROQ_API_KEY?.trim();
  const groqModel = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  if (groqKey) {
    providers.push({
      name: "Groq",
      client: new GroqClient(groqKey, groqModel),
    });
  }

  const hfKey = process.env.HUGGINGFACE_API_KEY?.trim();
  const hfModel = process.env.HUGGINGFACE_MODEL || "Qwen/Qwen2.5-72B-Instruct";
  if (hfKey) {
    providers.push({
      name: "HuggingFace",
      client: new HuggingFaceClient(hfKey, hfModel),
    });
  }

  if (providers.length > 0) {
    logger.info(
      { providers: providers.map((p) => p.name) },
      "Configured multi-provider LLM fallback chain with automatic rate-limit rollover"
    );
    activeClient = new FallbackChainLLMClient(providers);
  } else {
    logger.info("No LLM API keys configured; using MockLLMClient demo mode");
    activeClient = new MockLLMClient();
  }

  return activeClient;
}

export function setLLMClient(client: LLMClient) {
  activeClient = client;
}

export function getLLMMode(): "gemini" | "groq" | "huggingface" | "mock" {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) {
    return "mock";
  }
  const client = getLLMClient();
  if (client.isMock()) return "mock";
  if (client instanceof FallbackChainLLMClient) {
    const first = client.getProviders()[0]?.name.toLowerCase();
    if (first === "gemini") return "gemini";
    if (first === "groq") return "groq";
    if (first === "huggingface") return "huggingface";
  }
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.HUGGINGFACE_API_KEY) return "huggingface";
  return "mock";
}


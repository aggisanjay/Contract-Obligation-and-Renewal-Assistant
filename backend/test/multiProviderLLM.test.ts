import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import {
  GroqClient,
  HuggingFaceClient,
  FallbackChainLLMClient,
  NamedLLMClient,
} from "../src/llm/client.js";

const SampleSchema = z.object({
  title: z.string(),
  parties: z.array(z.string()),
});

describe("Multi-Provider LLM & Automatic Rate-Limit Failover", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("GroqClient", () => {
    it("successfully calls Groq REST endpoint and parses structured JSON", async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: "Cloud Service Agreement",
                parties: ["Vendor Inc", "Client LLC"],
              }),
            },
          },
        ],
      };

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const client = new GroqClient("gsk_test_key", "llama-3.3-70b-versatile");
      const result = await client.generateStructured("extract parties", SampleSchema);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(result.title).toBe("Cloud Service Agreement");
      expect(result.parties).toEqual(["Vendor Inc", "Client LLC"]);
    });

    it("throws explicit error on Groq HTTP 429 rate limit", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ error: { message: "Rate limit reached for model" } }),
      } as Response);

      const client = new GroqClient("gsk_test_key");
      await expect(client.generateStructured("test", SampleSchema, undefined, { maxRetries: 0 })).rejects.toThrow(
        /Groq API error HTTP 429/
      );
    });
  });

  describe("HuggingFaceClient", () => {
    it("successfully calls Hugging Face Router endpoint and parses structured JSON", async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: "```json\n" + JSON.stringify({
                title: "SaaS Subscription Agreement",
                parties: ["Host Co", "User Corp"],
              }) + "\n```",
            },
          },
        ],
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const client = new HuggingFaceClient("hf_test_token", "Qwen/Qwen2.5-72B-Instruct");
      const result = await client.generateStructured("extract data", SampleSchema);

      expect(result.title).toBe("SaaS Subscription Agreement");
      expect(result.parties).toHaveLength(2);
    });

    it("throws explicit error on Hugging Face 503 model overloaded / rate limit", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => "Model is currently loading or rate limit exceeded",
      } as Response);

      const client = new HuggingFaceClient("hf_test_token");
      await expect(client.generateStructured("test", SampleSchema, undefined, { maxRetries: 0 })).rejects.toThrow(
        /HuggingFace API error HTTP 503/
      );
    });
  });

  describe("FallbackChainLLMClient", () => {
    it("uses Primary provider when Primary succeeds", async () => {
      const primaryMock: NamedLLMClient = {
        name: "PrimaryGemini",
        client: {
          isMock: () => false,
          generateStructured: vi.fn().mockResolvedValue({
            title: "Contract from Gemini",
            parties: ["Company A"],
          }),
        },
      };

      const secondaryMock: NamedLLMClient = {
        name: "SecondaryGroq",
        client: {
          isMock: () => false,
          generateStructured: vi.fn(),
        },
      };

      const chain = new FallbackChainLLMClient([primaryMock, secondaryMock]);
      const result = await chain.generateStructured("prompt", SampleSchema);

      expect(result.title).toBe("Contract from Gemini");
      expect(primaryMock.client.generateStructured).toHaveBeenCalledTimes(1);
      expect(secondaryMock.client.generateStructured).not.toHaveBeenCalled();
    });

    it("automatically fails over to Secondary when Primary hits 429 Rate Limit", async () => {
      const primaryMock: NamedLLMClient = {
        name: "PrimaryGemini",
        client: {
          isMock: () => false,
          generateStructured: vi.fn().mockRejectedValue(new Error("Resource exhausted: 429 Rate limit exceeded")),
        },
      };

      const secondaryMock: NamedLLMClient = {
        name: "SecondaryGroq",
        client: {
          isMock: () => false,
          generateStructured: vi.fn().mockResolvedValue({
            title: "Saved by Groq Fallback",
            parties: ["Company B"],
          }),
        },
      };

      const chain = new FallbackChainLLMClient([primaryMock, secondaryMock]);
      const result = await chain.generateStructured("prompt", SampleSchema);

      expect(primaryMock.client.generateStructured).toHaveBeenCalledTimes(1);
      expect(secondaryMock.client.generateStructured).toHaveBeenCalledTimes(1);
      expect(result.title).toBe("Saved by Groq Fallback");
    });

    it("cascades through multiple providers: Gemini fails (429) -> Groq fails (503) -> HuggingFace succeeds", async () => {
      const gemini: NamedLLMClient = {
        name: "Gemini",
        client: {
          isMock: () => false,
          generateStructured: vi.fn().mockRejectedValue(new Error("Gemini quota exhausted HTTP 429")),
        },
      };

      const groq: NamedLLMClient = {
        name: "Groq",
        client: {
          isMock: () => false,
          generateStructured: vi.fn().mockRejectedValue(new Error("Groq API error HTTP 503: overloaded")),
        },
      };

      const huggingface: NamedLLMClient = {
        name: "HuggingFace",
        client: {
          isMock: () => false,
          generateStructured: vi.fn().mockResolvedValue({
            title: "HuggingFace Rescued Extraction",
            parties: ["Company C"],
          }),
        },
      };

      const chain = new FallbackChainLLMClient([gemini, groq, huggingface]);
      const result = await chain.generateStructured("prompt", SampleSchema);

      expect(gemini.client.generateStructured).toHaveBeenCalledTimes(1);
      expect(groq.client.generateStructured).toHaveBeenCalledTimes(1);
      expect(huggingface.client.generateStructured).toHaveBeenCalledTimes(1);
      expect(result.title).toBe("HuggingFace Rescued Extraction");
    });

    it("throws aggregated error if ALL providers in fallback chain fail", async () => {
      const p1: NamedLLMClient = {
        name: "P1",
        client: {
          isMock: () => false,
          generateStructured: vi.fn().mockRejectedValue(new Error("P1 429 rate limit")),
        },
      };

      const p2: NamedLLMClient = {
        name: "P2",
        client: {
          isMock: () => false,
          generateStructured: vi.fn().mockRejectedValue(new Error("P2 connection timed out")),
        },
      };

      const chain = new FallbackChainLLMClient([p1, p2]);
      await expect(chain.generateStructured("prompt", SampleSchema)).rejects.toThrow(
        /All 2 configured LLM providers in fallback chain failed/
      );
    });
  });
});

import { describe, it, expect, vi } from "vitest";
import { createGroqProvider } from "../src/services/groqProvider.js";
const answer = {
  content: "La garantie couvre deux ans [1].",
  confidence: 0.93,
  needsHuman: false,
  reason: "",
};
const response = (value = answer) => ({
  ok: true,
  json: async () => ({
    choices: [
      { finish_reason: "stop", message: { content: JSON.stringify(value) } },
    ],
  }),
});
describe("Groq grounded inference", () => {
  it("sends verified facts and history to the real Groq protocol with a strict schema", async () => {
    const fetchImpl = vi.fn(async () => response());
    const execute = vi.fn(async () => [
      {
        id: "rule",
        citation: 1,
        content: "Garantie de deux ans",
        source: "learned/rule.md",
      },
    ]);
    const provider = createGroqProvider({
      apiKey: "fixture-secret",
      fetchImpl,
    });
    expect(
      await provider.runTools({
        question: "Quelle est la garantie ?",
        history: [],
        execute,
      }),
    ).toEqual(answer);
    expect(execute).toHaveBeenCalledWith("search_knowledge_base", {
      query: "Quelle est la garantie ?",
    });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    const payload = JSON.parse(options.body);
    expect(payload.response_format.json_schema.strict).toBe(true);
    expect(payload.messages[1].content).toContain("Garantie de deux ans");
    expect(payload.model).toBe("openai/gpt-oss-20b");
  });
  it("never invents a provider when the API key is missing", async () => {
    const fetchImpl = vi.fn();
    const provider = createGroqProvider({ fetchImpl });
    await expect(provider.check()).rejects.toThrow("GROQ_API_KEY");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("fails safely for rejected credentials and malformed answers", async () => {
    const provider = createGroqProvider({
      apiKey: "fixture",
      fetchImpl: async () => ({ ok: false, status: 401 }),
    });
    await expect(provider.check()).rejects.toThrow("401");
    const invalid = createGroqProvider({
      apiKey: "fixture",
      fetchImpl: async () => response({ ...answer, confidence: 5 }),
    });
    await expect(
      invalid.runTools({
        question: "Bonjour",
        history: [],
        execute: async () => [],
      }),
    ).rejects.toThrow("Invalid Groq");
  });
  it("rejects truncated generations and extracts reusable rules", async () => {
    const truncated = createGroqProvider({
      apiKey: "fixture",
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ choices: [{ finish_reason: "length" }] }),
      }),
    });
    await expect(
      truncated.runTools({
        question: "Bonjour",
        history: [],
        execute: async () => [],
      }),
    ).rejects.toThrow("Incomplete");
    const rule = {
      intent: "garantie",
      condition: "Produit couvert",
      resolution: "Deux ans",
      notes: null,
    };
    const provider = createGroqProvider({
      apiKey: "fixture",
      fetchImpl: async () => response(rule),
    });
    expect(
      await provider.extractKnowledge({
        question: "garantie ?",
        humanAnswer: "Deux ans",
      }),
    ).toEqual(rule);
  });
});

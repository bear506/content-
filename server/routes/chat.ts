import { Router } from "express";
import { GoogleGenAI } from "@google/genai";
import { requireAuth } from "../middleware/auth";

const router = Router();

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5";

function getGenAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is missing.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });
}

// Plain-text Claude fallback for when Gemini is unconfigured/failing — mirrors the provider
// fallback the campaign generator already has, so a bad/missing GEMINI_API_KEY doesn't leave the
// chatbot dead in the water when a working ANTHROPIC_API_KEY is available.
async function callClaudeChat(systemInstruction: string, userMessage: string, maxTokens: number, temperature: number): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is missing.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: maxTokens,
        temperature,
        system: systemInstruction,
        messages: [{ role: "user", content: userMessage }],
      }),
    });
    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Claude API Error (${response.status}): ${errBody}`);
    }
    const json: any = await response.json();
    return json.content?.[0]?.text || "I couldn't come up with an answer to that.";
  } finally {
    clearTimeout(timer);
  }
}

function mapProviderError(err: any): string {
  const msg = String(err?.message || err || "");
  if (/\b401\b|invalid.*api.?key|unauthorized|permission.?denied/i.test(msg)) {
    return "The AI provider's API key looks invalid or missing. Check the server's environment configuration.";
  }
  if (/\b429\b|rate.?limit|quota/i.test(msg)) {
    return "The AI service is rate-limited right now. Wait a moment and try again.";
  }
  if (/ETIMEDOUT|ECONNRESET|ENOTFOUND|network|timeout|abort/i.test(msg)) {
    return "Couldn't reach the AI service — check your connection and try again.";
  }
  return msg || "An unexpected error occurred.";
}

const MAX_HISTORY_TURNS = 10;
const MAX_CONTEXT_CHARS = 12000; // keeps the snapshot bounded even with many campaigns/promo codes

// Read-only Q&A over the caller's already-loaded brand/campaign/promo data — deliberately NOT a
// content generator. The system prompt below is the only thing stopping it from writing marketing
// copy; it's the intentional guardrail keeping this assistant "ask questions" rather than
// "generate content", which already has its own guarded flow (the wizard + per-post AI refine).
router.post("/", requireAuth, async (req, res) => {
  try {
    const { message, history = [], contextSummary = "" } = req.body || {};
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "message is required." });
    }

    const boundedContext =
      typeof contextSummary === "string" && contextSummary.length > MAX_CONTEXT_CHARS
        ? contextSummary.slice(0, MAX_CONTEXT_CHARS) + "\n...(truncated)"
        : contextSummary || "(no data loaded yet)";

    const systemInstruction = `You are a read-only data assistant embedded in Vendox Content AI, a multi-brand SMS & Web Push campaign tool.

STRICT RULES:
- Answer questions using ONLY the CAMPAIGN DATA SNAPSHOT below. Never invent brands, campaigns, numbers, or promo codes that aren't in it.
- If the answer isn't in the snapshot, say so plainly instead of guessing.
- Do NOT write, suggest, or improve marketing copy, hooks, captions, or CTAs — that is out of scope for you. If asked to generate or rewrite content, say that's handled by "New Campaign" or a post's "Refine with AI" button, not by you.
- Keep answers short: a sentence or two, or a short bullet list. This is a quick-lookup tool, not a report generator.

CAMPAIGN DATA SNAPSHOT (as of this message):
${boundedContext}`;

    const historyText = (Array.isArray(history) ? history : [])
      .filter((h: any) => h && typeof h.content === "string" && (h.role === "user" || h.role === "assistant"))
      .slice(-MAX_HISTORY_TURNS)
      .map((h: any) => `${h.role === "user" ? "User" : "Assistant"}: ${h.content}`)
      .join("\n");

    const promptText = `${historyText ? historyText + "\n" : ""}User: ${message.trim()}`;

    let reply: string;
    try {
      const ai = getGenAIClient();
      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: promptText,
        config: {
          systemInstruction,
          temperature: 0.2,
          maxOutputTokens: 500,
        },
      });
      reply = response.text || "I couldn't come up with an answer to that.";
    } catch (geminiErr: any) {
      if (!process.env.ANTHROPIC_API_KEY) throw geminiErr;
      console.warn("Chat: Gemini failed, falling back to Claude —", geminiErr.message);
      reply = await callClaudeChat(systemInstruction, promptText, 500, 0.2);
    }

    res.json({ success: true, reply });
  } catch (err: any) {
    console.error("Chat error:", err);
    res.status(500).json({ error: mapProviderError(err) });
  }
});

export default router;

import React, { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Loader2, Sparkles } from "lucide-react";
import { Brand, CampaignResult, PromoCodeRecord } from "../types";
import { chatApi, ChatMessage } from "../lib/api";
import { buildChatContextSummary } from "../lib/chatContext";

interface ChatWidgetProps {
  brands: Brand[];
  savedCampaigns: CampaignResult[];
  promoLibrary: PromoCodeRecord[];
}

const SUGGESTED_PROMPTS = [
  "Which brands haven't run a campaign yet?",
  "How many posts are still pending review?",
  "What promo codes are active this month?",
];

export const ChatWidget: React.FC<ChatWidgetProps> = ({ brands, savedCampaigns, promoLibrary }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isOpen]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setIsSending(true);

    try {
      const contextSummary = buildChatContextSummary(brands, savedCampaigns, promoLibrary);
      const { reply } = await chatApi.send(trimmed, nextMessages, contextSummary);
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err: any) {
      setError(err.message || "Couldn't get a response. Try again.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      {/* Floating toggle button */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-40 w-12 h-12 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 shadow-lg flex items-center justify-center transition-all active:scale-95 cursor-pointer"
        title="Ask about your campaigns"
      >
        {isOpen ? <X className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
      </button>

      {isOpen && (
        <div className="fixed bottom-20 right-5 z-40 w-[360px] max-w-[calc(100vw-2.5rem)] h-[min(520px,70vh)] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="p-3.5 border-b border-slate-800 bg-slate-950/60 flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-white">Campaign Assistant</p>
              <p className="text-[10px] text-slate-500">Ask about your brands, campaigns &amp; promo codes</p>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
            {messages.length === 0 && (
              <div className="space-y-2">
                <p className="text-xs text-slate-400">Try asking:</p>
                {SUGGESTED_PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => send(p)}
                    className="w-full text-left text-xs px-2.5 py-1.5 bg-slate-950/60 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors"
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}

            {messages.map((m, idx) => (
              <div key={idx} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-amber-500 text-slate-950 font-medium"
                      : "bg-slate-950/80 border border-slate-800 text-slate-200"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {isSending && (
              <div className="flex justify-start">
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin" />
                  <span className="text-[10px] text-slate-500">Thinking...</span>
                </div>
              </div>
            )}

            {error && (
              <div className="text-[11px] text-rose-300 bg-rose-950/40 border border-rose-800/60 rounded-lg px-2.5 py-1.5">
                {error}
              </div>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="p-3 border-t border-slate-800 flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question..."
              disabled={isSending}
              className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={isSending || !input.trim()}
              className="p-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg disabled:opacity-40 shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}
    </>
  );
};

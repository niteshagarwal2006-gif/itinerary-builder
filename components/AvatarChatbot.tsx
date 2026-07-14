"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "./ui";

interface Message {
  role: "user" | "assistant";
  text: string;
}

export function AvatarChatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      text: "Hi! I'm your India travel expert. Ask me about destinations, hotels, monuments, or anything travel-related — I search my knowledge so you don't have to leave the page.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const nextMessages: Message[] = [...messages, { role: "user", text }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const data = (await res.json()) as { text?: string; error?: string };
      if (data.text) {
        setMessages((m) => [...m, { role: "assistant", text: data.text as string }]);
      } else {
        setMessages((m) => [...m, { role: "assistant", text: data.error || "Sorry, I couldn't answer that." }]);
      }
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "Sorry, I'm having trouble connecting right now." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="flex w-80 flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-2xl">
          <div className="flex items-center justify-between bg-deep px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-lg">🧭</div>
              <span className="text-sm font-semibold text-white">Travel Expert</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-white/80 hover:text-white"
              aria-label="Close chat"
            >
              ✕
            </button>
          </div>

          <div ref={scrollRef} className="flex h-80 flex-col gap-3 overflow-y-auto p-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  m.role === "user"
                    ? "self-end rounded-br-none bg-deep text-white"
                    : "self-start rounded-bl-none bg-cream text-ink"
                }`}
              >
                {m.text}
              </div>
            ))}
            {loading && (
              <div className="self-start rounded-2xl rounded-bl-none bg-cream px-3 py-2 text-sm text-ink/60">
                <span className="inline-block animate-pulse">Typing…</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-line p-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Ask anything…"
              className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-deep"
            />
            <Button onClick={sendMessage} variant="primary" disabled={loading || !input.trim()}>
              Send
            </Button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-deep to-teal-700 text-2xl shadow-lg transition-transform hover:scale-110 focus:outline-none"
        aria-label="Open travel expert chat"
      >
        <span className="drop-shadow-md">🧭</span>
        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-gold text-[10px] font-bold text-white">
          AI
        </span>
      </button>
    </div>
  );
}

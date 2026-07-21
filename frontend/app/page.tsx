"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface Source {
  page: number | string;
  source: string;
  excerpt: string;
}

interface DocMeta {
  title?: string;
  page_count?: number;
  chunk_count?: number;
  file_size_kb?: number;
}

interface AppStatus {
  ready: boolean;
  pdf_exists: boolean;
  meta: DocMeta;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const API_BASE = "http://localhost:8000";

const SUGGESTIONS_AR = [
  { icon: "⚖️", text: "ما هي عقوبة السرقة في قانون العقوبات؟" },
  { icon: "🔒", text: "ما هي عقوبة الاغتصاب؟" },
  { icon: "💼", text: "ما هي عقوبة الرشوة والفساد؟" },
  { icon: "🏠", text: "ما هي جرائم انتهاك حرمة المنازل؟" },
];

const SUGGESTIONS_EN = [
  { icon: "⚖️", text: "What is the punishment for theft?" },
  { icon: "🔒", text: "What are the penalties for assault?" },
  { icon: "💼", text: "What does the law say about bribery?" },
  { icon: "🏠", text: "What are the penalties for trespassing?" },
];

const TIPS_AR = [
  "ما هي عقوبة القتل العمد؟",
  "ما هي جرائم التزوير؟",
  "ما هو الفرق بين الجناية والجنحة؟",
];

const TIPS_EN = [
  "Penalties for first-degree murder?",
  "What is considered forgery?",
  "Difference between felony and misdemeanor?",
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatTime(date: Date): string {
  return date.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
}

function uid(): string {
  return Math.random().toString(36).slice(2);
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function HomePage() {
  const [lang, setLang] = useState<"ar" | "en">("ar");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [sources, setSources] = useState<Source[]>([]);
  const [showSources, setShowSources] = useState(true);
  const [appStatus, setAppStatus] = useState<AppStatus | null>(null);
  const [isIngesting, setIsIngesting] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const isAr = lang === "ar";

  // ── Poll status ──────────────────────────────────────────────────────────────
  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/status`);
      const data: AppStatus = await res.json();
      setAppStatus(data);
      if (!data.ready && data.pdf_exists) {
        setIsIngesting(true);
      } else {
        setIsIngesting(false);
      }
    } catch {
      // backend not running yet
    }
  }, []);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 4000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  // ── Auto-scroll ──────────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Handle send ──────────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || isStreaming) return;

      const userMsg: Message = {
        id: uid(),
        role: "user",
        content: question,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setSources([]);

      // Create placeholder for assistant
      const assistantId = uid();
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "", timestamp: new Date() },
      ]);
      setIsStreaming(true);

      // Fetch sources in parallel
      fetch(`${API_BASE}/api/chat/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      })
        .then((r) => r.json())
        .then((d) => setSources(d.sources || []))
        .catch(() => {});

      // Stream the response
      abortRef.current = new AbortController();
      try {
        const res = await fetch(`${API_BASE}/api/chat/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, chat_history: messages }),
          signal: abortRef.current.signal,
        });

        if (!res.body) throw new Error("No response body");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          // Parse SSE lines
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const payload = line.slice(6);
              if (payload === "[DONE]") break;
              if (payload.startsWith("[ERROR]")) {
                accumulated += "\n⚠️ " + payload.slice(8);
              } else {
                // Restore escaped newlines
                accumulated += payload.replace(/\\n/g, "\n");
              }
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: accumulated } : m
                )
              );
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== "AbortError") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content:
                      "⚠️ Failed to connect to the backend. Make sure the Python server is running on port 8000.",
                  }
                : m
            )
          );
        }
      } finally {
        setIsStreaming(false);
      }
    },
    [isStreaming]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleSuggestion = (text: string) => {
    setInput(text);
    sendMessage(text);
  };

  const clearChat = () => {
    if (isStreaming) abortRef.current?.abort();
    setMessages([]);
    setSources([]);
    setIsStreaming(false);
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  const suggestions = isAr ? SUGGESTIONS_AR : SUGGESTIONS_EN;
  const tips = isAr ? TIPS_AR : TIPS_EN;

  return (
    <>
      {/* Ingestion Overlay */}
      {isIngesting && (
        <div className="ingest-overlay">
          <div className="ingest-card">
            <span className="ingest-icon">⚙️</span>
            <div className="ingest-title">
              {isAr ? "جاري فهرسة الوثيقة..." : "Indexing Document..."}
            </div>
            <p className="ingest-desc">
              {isAr
                ? "يتم الآن استخراج النص وإنشاء التضمينات الدلالية لقانون العقوبات. قد يستغرق هذا دقيقة."
                : "Extracting text and generating semantic embeddings for the Penal Code. This may take a minute."}
            </p>
            <div className="progress-bar">
              <div className="progress-fill" />
            </div>
          </div>
        </div>
      )}

      <div className="app-layout">
        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <aside className="sidebar">
          <div className="sidebar-header">
            {/* Logo */}
            <div className="app-logo">
              <div className="logo-icon">⚖️</div>
              <div className="app-title">
                <span className="app-title-main">
                  {isAr ? "المساعد القانوني" : "Legal AI Assistant"}
                </span>
                <span className="app-title-sub">
                  {isAr ? "قانون العقوبات المصري" : "Egyptian Penal Code"}
                </span>
              </div>
            </div>

            {/* Language Toggle */}
            <div className="lang-toggle">
              <button
                id="lang-ar-btn"
                className={`lang-btn ${lang === "ar" ? "active" : ""}`}
                onClick={() => setLang("ar")}
              >
                عربي
              </button>
              <button
                id="lang-en-btn"
                className={`lang-btn ${lang === "en" ? "active" : ""}`}
                onClick={() => setLang("en")}
              >
                EN
              </button>
            </div>
          </div>

          {/* Document Card */}
          <div className="doc-card">
            <span className="doc-card-icon">📜</span>
            <div className="doc-card-title">قانون العقوبات</div>
            <div className="doc-card-sub">Egyptian Penal Code (Arabic)</div>
            <div className="doc-stats">
              {appStatus?.ready ? (
                <>
                  <span className="status-badge ready">
                    <span className="doc-stat-dot" />
                    {isAr ? "جاهز" : "Ready"}
                  </span>
                  {appStatus.meta?.page_count && (
                    <span className="doc-stat">
                      📄 {appStatus.meta.page_count}{" "}
                      {isAr ? "صفحة" : "pages"}
                    </span>
                  )}
                  {appStatus.meta?.chunk_count && (
                    <span className="doc-stat">
                      🔢 {appStatus.meta.chunk_count}{" "}
                      {isAr ? "مقطع" : "chunks"}
                    </span>
                  )}
                </>
              ) : (
                <span className="status-badge loading">
                  <span className="spinner" />
                  {isAr ? "جاري التحميل..." : "Loading..."}
                </span>
              )}
            </div>
          </div>

          {/* Sample Questions */}
          <div className="sidebar-section">
            {isAr ? "أسئلة مقترحة" : "Sample Questions"}
          </div>
          <div className="sidebar-tips">
            {tips.map((tip, i) => (
              <div
                key={i}
                id={`tip-${i}`}
                className={`tip-item ${isAr ? "arabic" : ""}`}
                onClick={() => handleSuggestion(tip)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && handleSuggestion(tip)}
              >
                <div className="tip-label">
                  <span>💡</span>
                  <span>{isAr ? "اضغط للسؤال" : "Click to ask"}</span>
                </div>
                {tip}
              </div>
            ))}
          </div>

          <div className="sidebar-footer">
            {isAr
              ? "مبني بـ Groq · LLaMA 3.3 · ChromaDB"
              : "Powered by Groq · LLaMA 3.3 · ChromaDB"}
          </div>
        </aside>

        {/* ── Chat Area ───────────────────────────────────────────────────── */}
        <main className="chat-area">
          {/* Header */}
          <header className="chat-header">
            <div className="chat-header-title">
              <h1>{isAr ? "محادثة قانونية ذكية" : "AI Legal Chat"}</h1>
              <span>
                {isAr
                  ? "اسأل عن قانون العقوبات بالعربية أو الإنجليزية"
                  : "Ask about the Penal Code in Arabic or English"}
              </span>
            </div>
            <div className="header-actions">
              <button
                id="toggle-sources-btn"
                className="icon-btn"
                title={isAr ? "عرض المصادر" : "Toggle sources"}
                onClick={() => setShowSources((v) => !v)}
              >
                📋
              </button>
              <button
                id="clear-chat-btn"
                className="icon-btn"
                title={isAr ? "محادثة جديدة" : "New chat"}
                onClick={clearChat}
              >
                🗑️
              </button>
            </div>
          </header>

          {/* Messages */}
          <div className="messages-container">
            {messages.length === 0 ? (
              /* Welcome Screen */
              <div className="welcome-screen">
                <div className="welcome-icon">⚖️</div>
                <div className="welcome-title">قانون العقوبات</div>
                <p className="welcome-subtitle">AI Legal Assistant</p>
                <p className="welcome-desc">
                  {isAr
                    ? "اسأل أي سؤال قانوني وسأجيبك بناءً على نصوص قانون العقوبات المصري مباشرةً، مع الإشارة إلى المواد ذات الصلة."
                    : "Ask any legal question and I'll answer based on the Egyptian Penal Code text, citing relevant articles."}
                </p>
                <div className="welcome-suggestions">
                  {suggestions.map((s, i) => (
                    <div
                      key={i}
                      id={`suggestion-${i}`}
                      className="suggestion-card"
                      onClick={() => handleSuggestion(s.text)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) =>
                        e.key === "Enter" && handleSuggestion(s.text)
                      }
                    >
                      <span className="suggestion-icon">{s.icon}</span>
                      <p>{s.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`message ${msg.role}`}
                  id={`msg-${msg.id}`}
                >
                  <div className="message-avatar">
                    {msg.role === "user" ? "👤" : "⚖️"}
                  </div>
                  <div className="message-body">
                    {msg.role === "assistant" && msg.content === "" ? (
                      <div className="typing-indicator">
                        <div className="typing-dot" />
                        <div className="typing-dot" />
                        <div className="typing-dot" />
                      </div>
                    ) : (
                      <div className="message-bubble">
                        {msg.content.split("\n").map((line, i) =>
                          line ? <p key={i} style={{ marginBottom: "4px" }}>{line}</p> : <br key={i} />
                        )}
                        {msg.role === "assistant" && isStreaming &&
                          msg.id === messages[messages.length - 1]?.id && (
                            <span
                              style={{
                                display: "inline-block",
                                width: 2,
                                height: "1em",
                                background: "var(--accent-primary)",
                                marginLeft: 2,
                                animation: "typingBounce 0.8s infinite",
                                verticalAlign: "text-bottom",
                              }}
                            />
                          )}
                      </div>
                    )}
                    <div className="message-meta">
                      <span>{formatTime(msg.timestamp)}</span>
                      {msg.role === "assistant" && msg.content && (
                        <span>
                          {isAr ? "· مستند إلى وثيقة قانونية" : "· Grounded in legal text"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="input-area">
            <div className="input-wrapper">
              <textarea
                ref={inputRef}
                id="chat-input"
                className="chat-input"
                placeholder={
                  isAr
                    ? "اكتب سؤالك القانوني هنا..."
                    : "Ask your legal question here..."
                }
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                }}
                onKeyDown={handleKeyDown}
                disabled={isStreaming || !appStatus?.ready}
                rows={1}
              />
              <button
                id="send-btn"
                className="send-btn"
                onClick={() => sendMessage(input)}
                disabled={isStreaming || !input.trim() || !appStatus?.ready}
                title={isAr ? "إرسال" : "Send"}
              >
                {isStreaming ? (
                  <span className="spinner" />
                ) : (
                  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                  </svg>
                )}
              </button>
            </div>
            <p className="input-hint">
              {isAr
                ? "⌨️ Enter للإرسال · Shift+Enter للسطر الجديد"
                : "⌨️ Enter to send · Shift+Enter for new line"}
            </p>
          </div>
        </main>

        {/* ── Sources Panel ────────────────────────────────────────────────── */}
        <aside className={`sources-panel ${showSources ? "" : "hidden"}`}>
          <div className="sources-header">
            <h2>
              <span>📋</span>
              {isAr ? "المصادر" : "Sources"}
            </h2>
            {sources.length > 0 && (
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  background: "var(--bg-glass)",
                  padding: "2px 8px",
                  borderRadius: 20,
                  border: "1px solid var(--border-subtle)",
                }}
              >
                {sources.length}
              </span>
            )}
          </div>

          {sources.length === 0 ? (
            <div className="sources-empty">
              <span style={{ fontSize: 32 }}>📚</span>
              <span>
                {isAr
                  ? "ستظهر هنا المواد القانونية ذات الصلة بعد السؤال"
                  : "Relevant legal articles will appear here after asking a question"}
              </span>
            </div>
          ) : (
            <div className="sources-list">
              {sources.map((src, i) => (
                <div key={i} className="source-card" id={`source-${i}`}>
                  <div className="source-card-header">
                    <span className="source-page">
                      📄 {isAr ? "صفحة" : "Page"} {src.page}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        color: "var(--text-muted)",
                        background: "var(--bg-glass)",
                        padding: "2px 6px",
                        borderRadius: 20,
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      #{i + 1}
                    </span>
                  </div>
                  <p className="source-text">{src.excerpt}</p>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

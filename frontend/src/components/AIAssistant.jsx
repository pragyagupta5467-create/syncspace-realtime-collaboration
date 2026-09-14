import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Send,
  Sparkles,
  RefreshCw,
  Trash2,
  HelpCircle,
  FileText,
  AlertCircle,
  CheckCircle2,
  Clock,
  Flame,
  UserCheck,
} from 'lucide-react';
import { askWorkspaceAIApi, getWorkspaceSummaryApi } from '../services/api';

const QUICK_PROMPTS = [
  { label: 'What should I work on next?', icon: Flame },
  { label: 'What tasks are still pending?', icon: Clock },
  { label: 'Which tasks are high priority?', icon: AlertCircle },
  { label: 'Who is working on what?', icon: UserCheck },
  { label: 'What conflicts happened?', icon: HelpCircle },
];

/**
 * Safe Lightweight Markdown-to-React Renderer
 * Securely formats headings, lists, bold keywords, and code blocks without dangerous HTML injection.
 */
function MarkdownView({ content }) {
  if (!content) return null;

  const lines = content.split('\n');

  return (
    <div className="space-y-2 text-xs leading-relaxed">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={idx} className="h-1" />;
        }

        // Heading level 3: ### Heading
        if (trimmed.startsWith('### ')) {
          return (
            <h4
              key={idx}
              className="text-xs font-bold text-slate-900 dark:text-white pt-2 pb-1 border-b border-slate-200 dark:border-slate-800 flex items-center gap-1.5"
            >
              <Sparkles className="h-3 w-3 text-indigo-500" />
              <span>{trimmed.replace('### ', '')}</span>
            </h4>
          );
        }

        // Heading level 2 or 1
        if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
          return (
            <h3
              key={idx}
              className="text-sm font-extrabold text-slate-900 dark:text-white pt-2 pb-1"
            >
              {trimmed.replace(/^#+\s*/, '')}
            </h3>
          );
        }

        // Bullet point: - Item or • Item
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ')) {
          const itemText = trimmed.replace(/^[-*•]\s+/, '');
          return (
            <div key={idx} className="flex items-start gap-2 pl-2">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 dark:bg-indigo-400 mt-1.5 shrink-0" />
              <div className="flex-1">{renderFormattedInline(itemText)}</div>
            </div>
          );
        }

        // Sub-bullet point (indented)
        if (line.startsWith('   - ') || line.startsWith('  • ') || line.startsWith('    • ')) {
          const itemText = line.replace(/^\s+[-•]\s+/, '');
          return (
            <div key={idx} className="flex items-start gap-2 pl-6 text-slate-600 dark:text-slate-400">
              <span className="h-1 w-1 rounded-full bg-slate-400 dark:bg-slate-500 mt-1.5 shrink-0" />
              <div className="flex-1">{renderFormattedInline(itemText)}</div>
            </div>
          );
        }

        // Numbered list: 1. Item
        const numberedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
        if (numberedMatch) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-1.5">
              <span className="font-mono text-[10px] font-bold text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5">
                {numberedMatch[1]}.
              </span>
              <div className="flex-1">{renderFormattedInline(numberedMatch[2])}</div>
            </div>
          );
        }

        // Regular paragraph line
        return (
          <p key={idx} className="text-slate-700 dark:text-slate-300">
            {renderFormattedInline(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

/**
 * Format inline tokens like **bold** and `code`
 */
function renderFormattedInline(text) {
  if (!text) return null;

  // Split by bold (**...**) and inline code (`...`)
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);

  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-bold text-slate-900 dark:text-slate-100">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={i}
          className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 font-semibold border border-slate-200 dark:border-slate-700"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

/**
 * AIAssistant Component
 * Contextual AI workspace companion for SyncSpace.
 */
export default function AIAssistant({ roomId, currentUser, onClose }) {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Handle asking custom or quick question
  const handleAsk = async (queryText) => {
    const textToSend = (queryText || question).trim();
    if (!textToSend || isLoading) return;

    setError('');
    const userMsg = {
      id: `usr_${Date.now()}`,
      role: 'user',
      content: textToSend,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setQuestion('');
    setIsLoading(true);

    try {
      const data = await askWorkspaceAIApi(roomId, textToSend);
      const aiMsg = {
        id: `ai_${Date.now()}`,
        role: 'assistant',
        content: data.answer,
        provider: data.provider,
        model: data.model,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      console.warn('[AIAssistant Error]:', err.message);
      setError(
        err.message || 'AI is temporarily unavailable. Your workspace is still working normally.'
      );
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  // Handle generating one-click AI summary
  const handleGenerateSummary = async () => {
    if (isLoading) return;
    setError('');

    const userMsg = {
      id: `usr_${Date.now()}`,
      role: 'user',
      content: 'Generate AI Session Summary',
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const data = await getWorkspaceSummaryApi(roomId);
      const aiMsg = {
        id: `ai_${Date.now()}`,
        role: 'assistant',
        content: data.summary,
        provider: data.provider,
        model: data.model,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      console.warn('[AIAssistant Summary Error]:', err.message);
      setError(
        err.message || 'AI is temporarily unavailable. Your workspace is still working normally.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    setMessages([]);
    setError('');
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-950 select-text overflow-hidden">
      {/* Header */}
      <div className="p-3.5 border-b border-slate-200 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-900/50 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center text-white shadow-sm">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                SyncSpace AI
              </span>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                Workspace Companion
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono">
              Room {roomId} • Real Database Context
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={handleClear}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
              title="Clear Conversation"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white px-2 py-1 rounded bg-slate-100 dark:bg-slate-800"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Welcome Card & Quick Actions if no messages */}
        {messages.length === 0 && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="p-4 rounded-2xl bg-gradient-to-b from-indigo-50/80 to-white dark:from-indigo-950/30 dark:to-slate-900/40 border border-indigo-100 dark:border-indigo-900/40 text-center space-y-2">
              <div className="h-9 w-9 rounded-xl bg-indigo-600/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto border border-indigo-500/20">
                <Sparkles className="h-4 w-4" />
              </div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                Contextual Workspace Assistant
              </h4>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed max-w-xs mx-auto">
                Ask anything about tasks, priority recommendations, collaborator assignments, or
                session activities.
              </p>

              {/* Generate AI Summary Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleGenerateSummary}
                  disabled={isLoading}
                  className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>Generate AI Session Summary</span>
                </button>
              </div>
            </div>

            {/* Quick Prompt Suggestion Chips */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block px-1">
                Suggested Questions
              </span>
              <div className="flex flex-col gap-1.5">
                {QUICK_PROMPTS.map((item, idx) => {
                  const IconComp = item.icon;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleAsk(item.label)}
                      disabled={isLoading}
                      className="text-left px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 hover:bg-indigo-50/70 dark:hover:bg-slate-800/80 border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-500/30 transition-all text-xs text-slate-700 dark:text-slate-300 flex items-center gap-2 group"
                    >
                      <IconComp className="h-3.5 w-3.5 text-indigo-500 shrink-0 group-hover:scale-110 transition-transform" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Render Message History */}
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} animate-in fade-in duration-200`}
            >
              <div className="flex items-center gap-1.5 mb-1 px-1">
                <span className="text-[10px] font-bold text-slate-400">
                  {isUser ? currentUser?.displayName || 'You' : 'SyncSpace AI'}
                </span>
                <span className="text-[9px] text-slate-400 font-mono">
                  {new Date(msg.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>

              <div
                className={`max-w-[95%] p-3.5 rounded-2xl ${
                  isUser
                    ? 'bg-indigo-600 text-white rounded-br-xs shadow-md shadow-indigo-600/10'
                    : 'bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-xs shadow-sm'
                }`}
              >
                {isUser ? (
                  <p className="text-xs leading-relaxed">{msg.content}</p>
                ) : (
                  <MarkdownView content={msg.content} />
                )}
              </div>
            </div>
          );
        })}

        {/* Loading State Animation */}
        {isLoading && (
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200/50 dark:border-indigo-800/30 text-indigo-600 dark:text-indigo-400 text-xs animate-pulse">
            <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0" />
            <span className="font-medium">SyncSpace AI is analyzing your workspace...</span>
          </div>
        )}

        {/* Error Alert Box */}
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 text-xs flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium">{error}</p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Form Bar */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-900/60 shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAsk();
          }}
          className="flex items-center gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about this workspace..."
            disabled={isLoading}
            maxLength={500}
            className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder-slate-400 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner disabled:opacity-50"
          />

          <button
            type="submit"
            disabled={!question.trim() || isLoading}
            className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 shadow-md shadow-indigo-600/20 transition-all shrink-0 flex items-center justify-center"
            title="Ask AI"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
}

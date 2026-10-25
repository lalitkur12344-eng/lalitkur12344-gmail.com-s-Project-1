import React, { useState, useRef, useEffect } from 'react';
import { api } from '../services/api';
import {
  Sparkles,
  Send,
  X,
  Minimize2,
  Maximize2,
  Trash2,
  Wrench,
  GraduationCap,
  Zap,
  Cpu,
  Bot,
  User,
  Copy,
  Check,
  AlertCircle,
  FilePlus,
  HelpCircle,
} from 'lucide-react';

export interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  modelUsed?: string;
  roleMode?: string;
}

interface GeminiChatbotProps {
  isOpen: boolean;
  onClose: () => void;
  onPrefillComplaint?: (title: string, description: string) => void;
}

export const GeminiChatbot: React.FC<GeminiChatbotProps> = ({
  isOpen,
  onClose,
  onPrefillComplaint,
}) => {
  const [roleMode, setRoleMode] = useState<'advisor' | 'technical' | 'emergency'>('advisor');
  const [modelChoice, setModelChoice] = useState<'auto' | 'gemini-3.8-flash' | 'gemini-3.1-flash-lite' | 'gemini-4-argon'>('auto');
  const [isExpanded, setIsExpanded] = useState(false);

  const [messages, setMessages] = useState<ChatMessageItem[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: `Hello! I am your **REC Bijnor Campus Care AI Assistant** powered by Google Gemini.

I can assist you with:
• **Campus Complaints**: Helping you draft, categorize, and specify location details for maintenance requests.
• **Technical SOPs**: Diagnostic checklists for electrical, plumbing, and network issues.
• **Helpline & Emergency**: Substation, warden, and dispensary contacts.

How can I help you today?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      modelUsed: 'gemini-3.8-flash',
      roleMode: 'advisor',
    },
  ]);

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

  // Decide model to request
  const getSelectedModel = (): string | undefined => {
    if (modelChoice !== 'auto') return modelChoice;
    if (roleMode === 'emergency') return 'gemini-3.1-flash-lite';
    if (roleMode === 'technical') return 'gemini-3.8-flash';
    return 'gemini-3.8-flash';
  };

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessageItem = {
      id: 'user_' + Date.now(),
      role: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      // Format messages history for the backend
      const formattedHistory = newMessages.map((m) => ({
        role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        text: m.text,
      }));

      const model = getSelectedModel();
      const res = await api.ai.chat(formattedHistory, roleMode, model);

      const assistantMsg: ChatMessageItem = {
        id: 'asst_' + Date.now(),
        role: 'assistant',
        text: res.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        modelUsed: res.modelUsed,
        roleMode: res.roleMode,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const isQuota =
        String(err.message || '').includes('429') ||
        String(err.message || '').toLowerCase().includes('quota') ||
        String(err.message || '').toLowerCase().includes('resource_exhausted');

      const notice = isQuota
        ? `⚠️ **Gemini AI Quota Limit Exceeded:**\nThe API quota or rate limit has been reached. Non-AI features (complaint submission, tracking, admin) remain 100% active.\n\nFor immediate assistance:\n• **Substation / Electrical**: +91 98370 11223\n• **Chief Hostel Warden**: +91 94120 12345\n• **Emergency Medical**: 108 / 112`
        : `⚠️ **Service Notice:** Unable to reach Gemini inference engine (${err.message || 'Network error'}). Non-AI campus care operations remain active.`;

      const errorMsg: ChatMessageItem = {
        id: 'err_' + Date.now(),
        role: 'assistant',
        text: notice,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        modelUsed: isQuota ? 'quota_limit' : 'offline',
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClearHistory = () => {
    if (confirm('Clear chat conversation history?')) {
      setMessages([
        {
          id: 'welcome_' + Date.now(),
          role: 'assistant',
          text: `Conversation cleared. I am ready to assist with your next campus inquiry.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          modelUsed: getSelectedModel(),
          roleMode,
        },
      ]);
    }
  };

  const quickPrompts = [
    'How do I report a water cooler leak in Ramanujan Hostel?',
    'What are the campus emergency substation phone numbers?',
    'Wi-Fi AP in CS Block is offline. What is the diagnostic procedure?',
    'What are the SLA resolution hours for emergency complaints?',
  ];

  return (
    <div
      className={`fixed z-50 transition-all duration-200 flex flex-col bg-white border border-slate-200 shadow-2xl rounded-2xl overflow-hidden ${
        isExpanded
          ? 'inset-4 sm:inset-10'
          : 'bottom-4 right-4 sm:right-6 w-[94vw] sm:w-[460px] h-[620px] max-h-[88vh]'
      }`}
    >
      {/* Header */}
      <div className="bg-slate-900 text-white p-3.5 sm:px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-xs">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-white">Campus Care AI</span>
              <span className="text-[10px] font-mono bg-indigo-950 text-indigo-300 border border-indigo-700/50 px-1.5 py-0.2 rounded-sm">
                Gemini
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Multi-turn assistant · Rajkiya Engineering College, Bijnor
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleClearHistory}
            className="p-1.5 text-slate-400 hover:text-white rounded-md transition-colors"
            title="Clear Chat History"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="hidden sm:block p-1.5 text-slate-400 hover:text-white rounded-md transition-colors"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-md transition-colors"
            title="Close Chat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Role / System Instruction Selector */}
      <div className="bg-slate-50 border-b border-slate-200 px-3 py-2 shrink-0">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Assistant Persona &amp; System Instruction
          </span>
          <span className="text-[10px] text-indigo-700 font-medium">
            Active: {getSelectedModel()}
          </span>
        </div>

        {/* Segmented Role Buttons */}
        <div className="grid grid-cols-3 gap-1 p-0.5 bg-slate-200/80 rounded-lg text-[11px]">
          <button
            onClick={() => setRoleMode('advisor')}
            className={`py-1.5 px-2 rounded-md font-medium transition-colors flex items-center justify-center gap-1.5 ${
              roleMode === 'advisor'
                ? 'bg-white text-indigo-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5 text-indigo-600" />
            <span className="truncate">Advisor</span>
          </button>

          <button
            onClick={() => setRoleMode('technical')}
            className={`py-1.5 px-2 rounded-md font-medium transition-colors flex items-center justify-center gap-1.5 ${
              roleMode === 'technical'
                ? 'bg-white text-blue-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Wrench className="w-3.5 h-3.5 text-blue-600" />
            <span className="truncate">Technical SOP</span>
          </button>

          <button
            onClick={() => setRoleMode('emergency')}
            className={`py-1.5 px-2 rounded-md font-medium transition-colors flex items-center justify-center gap-1.5 ${
              roleMode === 'emergency'
                ? 'bg-white text-rose-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-rose-600" />
            <span className="truncate">Fast Helpline</span>
          </button>
        </div>

        {/* Model Selector Bar */}
        <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500">
          <span>Engine Model:</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setModelChoice('auto')}
              className={`px-1.5 py-0.5 rounded-sm ${
                modelChoice === 'auto' ? 'bg-indigo-100 text-indigo-800 font-bold' : 'hover:text-slate-800'
              }`}
            >
              Auto
            </button>
            <button
              onClick={() => setModelChoice('gemini-3.8-flash')}
              className={`px-1.5 py-0.5 rounded-sm ${
                modelChoice === 'gemini-3.8-flash' ? 'bg-indigo-100 text-indigo-800 font-bold' : 'hover:text-slate-800'
              }`}
              title="gemini-3.8-flash (General)"
            >
              3.8 Flash
            </button>
            <button
              onClick={() => setModelChoice('gemini-3.1-flash-lite')}
              className={`px-1.5 py-0.5 rounded-sm ${
                modelChoice === 'gemini-3.1-flash-lite' ? 'bg-indigo-100 text-indigo-800 font-bold' : 'hover:text-slate-800'
              }`}
              title="gemini-3.1-flash-lite (Fast)"
            >
              3.1 Lite (Fast)
            </button>
            <button
              onClick={() => setModelChoice('gemini-4-argon')}
              className={`px-1.5 py-0.5 rounded-sm ${
                modelChoice === 'gemini-4-argon' ? 'bg-indigo-100 text-indigo-800 font-bold' : 'hover:text-slate-800'
              }`}
              title="gemini-4-argon (Complex reasoning)"
            >
              4 Argon (Complex)
            </button>
          </div>
        </div>
      </div>

      {/* Messages Scrollable Thread */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs bg-slate-50/50">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            {/* Sender & Timestamp Header */}
            <div className="flex items-center gap-1.5 mb-1 px-1 text-[10px] text-slate-400">
              {m.role === 'user' ? (
                <>
                  <span>You</span>
                  <span>·</span>
                  <span>{m.timestamp}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3 h-3 text-indigo-600" />
                  <span className="font-semibold text-slate-700">Campus Care AI</span>
                  {m.modelUsed && (
                    <>
                      <span>·</span>
                      <span className="font-mono text-slate-500">{m.modelUsed}</span>
                    </>
                  )}
                  <span>·</span>
                  <span>{m.timestamp}</span>
                </>
              )}
            </div>

            {/* Bubble Content */}
            <div
              className={`p-3.5 rounded-2xl max-w-[88%] leading-relaxed ${
                m.role === 'user'
                  ? 'bg-indigo-700 text-white rounded-br-xs shadow-xs'
                  : 'bg-white text-slate-800 border border-slate-200 rounded-bl-xs shadow-xs'
              }`}
            >
              <div className="whitespace-pre-wrap">{m.text}</div>

              {/* Action buttons for assistant responses */}
              {m.role === 'assistant' && (
                <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopy(m.id, m.text)}
                      className="hover:text-indigo-700 flex items-center gap-1 text-[10px]"
                    >
                      {copiedId === m.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span className="text-emerald-600">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>

                  {onPrefillComplaint && m.text.length > 50 && (
                    <button
                      onClick={() => {
                        onPrefillComplaint('Campus Issue', m.text);
                        onClose();
                      }}
                      className="text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 text-[10px]"
                    >
                      <FilePlus className="w-3 h-3" />
                      <span>Use in Complaint Form</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex flex-col items-start">
            <div className="flex items-center gap-1.5 mb-1 px-1 text-[10px] text-slate-400">
              <Sparkles className="w-3 h-3 text-indigo-600" />
              <span>Campus Care AI is typing...</span>
            </div>
            <div className="p-3.5 bg-white border border-slate-200 rounded-2xl rounded-bl-xs shadow-xs flex items-center gap-2 text-slate-500 text-xs">
              <div className="w-2 h-2 rounded-full bg-indigo-600 animate-bounce [animation-delay:-0.3s]" />
              <div className="w-2 h-2 rounded-full bg-indigo-600 animate-bounce [animation-delay:-0.15s]" />
              <div className="w-2 h-2 rounded-full bg-indigo-600 animate-bounce" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Quick Prompt Starters */}
      {messages.length <= 2 && (
        <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 shrink-0">
          <div className="text-[10px] font-semibold text-slate-400 mb-1">Quick questions:</div>
          <div className="flex flex-wrap gap-1">
            {quickPrompts.slice(0, 2).map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(prompt)}
                disabled={isLoading}
                className="text-[10px] bg-white border border-slate-200 hover:border-indigo-300 text-slate-600 hover:text-indigo-900 px-2 py-1 rounded-md transition-colors truncate max-w-full text-left"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="p-3 bg-white border-t border-slate-200 shrink-0 flex items-center gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            roleMode === 'technical'
              ? 'Ask for technical diagnostic / SOP procedure...'
              : roleMode === 'emergency'
              ? 'Ask for emergency contacts or immediate actions...'
              : 'Ask a campus maintenance question or advice...'
          }
          disabled={isLoading}
          className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-hidden focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="p-2.5 bg-indigo-700 hover:bg-indigo-800 text-white rounded-xl shadow-xs disabled:opacity-50 transition-colors focus:outline-hidden"
          title="Send Message"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};

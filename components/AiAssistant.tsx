import Button from '@/components/ui/Button';
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 💬 AI ASSISTANT - Beautiful Chat Interface with AI Gateway Integration
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Enhanced AI chat assistant powered by Vercel AI Gateway with tier-aware
 * routing, usage tracking, and beautiful UX.
 *
 * Features:
 * ✨ Tier-aware AI routing (Basic = Gemini, Full AI = GPT-4o)
 * ✨ Real-time usage limit display
 * ✨ Automatic fallback to Gemini
 * ✨ Usage tracking and cost monitoring
 * ✨ Upgrade prompts for basic tier users
 *
 * @module components/AiAssistant
 * @version 2.0.0 - AI Gateway Edition
 */

import React, { useState, useRef, useEffect } from 'react';
import { sendChatMessage, type ChatRequest } from '../services/aiGatewayService';
import { getUserProfile } from '../services/complianceService';
import type { BillOfMaterials, InventoryItem, Vendor, PurchaseOrder, AiConfig, AiSettings } from '../types';
import { CloseIcon, SendIcon, MuRPBotIcon } from './icons';

interface AiAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  boms: BillOfMaterials[];
  inventory: InventoryItem[];
  vendors: Vendor[];
  purchaseOrders: PurchaseOrder[];
  aiConfig: AiConfig;
  aiSettings: AiSettings;
  onUpdateAiSettings: (settings: AiSettings) => void;
  userId: string; // Required for tier checking
}

type Message = {
  sender: 'user' | 'bot';
  text: string;
  cost?: number;
  tokens?: number;
};

const BASIC_CHAT_LIMIT = 100;

const AiAssistant: React.FC<AiAssistantProps> = ({
  isOpen,
  onClose,
  boms,
  inventory,
  vendors,
  purchaseOrders,
  aiConfig,
  aiSettings,
  onUpdateAiSettings,
  userId,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [userTier, setUserTier] = useState<'basic' | 'full_ai'>('basic');
  const [messagesRemaining, setMessagesRemaining] = useState<number | null>(null);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      loadUserProfile();
      setMessages([
        {
          sender: 'bot',
          text: "🤖 Hey there! I'm MB, your witty MuRPBot sidekick! 💡\n\nI'm here to help you make smart decisions within MuRP's inventory and compliance constraints. Let's keep things fun but focused on what matters:\n\n• Inventory optimization & reorder alerts\n• BOM buildability & production blockers\n• Purchase order workflows & vendor management\n• Compliance requirements & regulatory guidance\n• Production planning & forecasting\n\nTry asking: 'What's blocking our production?' or 'Which items need reordering?'\n\nRemember, I'm serious about MuRP topics only - let's crush those inventory challenges! 🚀",
        },
      ]);
    }
  }, [isOpen]);

  useEffect(scrollToBottom, [messages]);

  const loadUserProfile = async () => {
    try {
      const profile = await getUserProfile(userId);
      if (profile) {
        setUserTier(profile.compliance_tier);

        // Calculate messages remaining
        if (profile.compliance_tier === 'basic') {
          const used = profile.chat_messages_this_month || 0;
          setMessagesRemaining(Math.max(0, BASIC_CHAT_LIMIT - used));
        } else {
          setMessagesRemaining(null); // Unlimited
        }
        return;
      }

      setUserTier('basic');
      setMessagesRemaining(BASIC_CHAT_LIMIT);
    } catch (error) {
      console.error('Failed to load user profile:', error);
      setUserTier('basic');
      setMessagesRemaining(BASIC_CHAT_LIMIT);
    }
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = { sender: 'user', text: input };
    setMessages((prev) => [...prev, userMessage]);
    const question = input;
    setInput('');
    setIsLoading(true);

    try {
      const promptTemplate = aiConfig?.prompts?.find((p) => p.id === 'askAboutInventory');
      if (!promptTemplate) {
        throw new Error('Inventory assistant prompt not configured.');
      }

      // Build context for the AI
      const contextData = {
        boms: (boms || []).slice(0, aiSettings.maxContextItems || 20),
        inventory: (inventory || []).slice(0, aiSettings.maxContextItems || 20),
        vendors: (vendors || []).slice(0, Math.floor((aiSettings.maxContextItems || 20) / 2)),
        purchaseOrders: (purchaseOrders || []).slice(0, Math.floor((aiSettings.maxContextItems || 20) / 2)),
      };

      // Replace placeholders in system prompt
      let systemPrompt = promptTemplate.prompt
        .replace('{{inventory}}', JSON.stringify(contextData.inventory, null, 2))
        .replace('{{boms}}', JSON.stringify(contextData.boms, null, 2))
        .replace('{{vendors}}', JSON.stringify(contextData.vendors, null, 2))
        .replace('{{purchaseOrders}}', JSON.stringify(contextData.purchaseOrders, null, 2))
        .replace('{{buildability}}', 'See BOM data for component status')
        .replace('{{question}}', question);

      // Send message through AI Gateway
      const response = await sendChatMessage({
        userId,
        messages: [{ role: 'user', content: question }],
        systemPrompt,
        temperature: 0.3,
      });

      // Add bot response with cost tracking
      const botMessage: Message = {
        sender: 'bot',
        text: response.content,
        cost: response.usage.estimatedCost,
        tokens: response.usage.totalTokens,
      };
      setMessages((prev) => [...prev, botMessage]);

      // Update messages remaining
      if (userTier === 'basic' && messagesRemaining !== null) {
        const newRemaining = messagesRemaining - 1;
        setMessagesRemaining(newRemaining);

        // Show upgrade prompt if running low
        if (newRemaining <= 10 && newRemaining > 0) {
          setShowUpgradePrompt(true);
        }
      }
    } catch (error: any) {
      console.error('AI Gateway error:', error);

      let errorText = 'Sorry, I encountered an error. Please try again in a moment.';

      // Check for tier limit errors
      if (error.message && error.message.includes('limit')) {
        errorText = `${error.message}\n\nUpgrade to Full AI tier for unlimited chat!`;
        setShowUpgradePrompt(true);
      }

      const errorMessage: Message = {
        sender: 'bot',
        text: errorText,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      handleSend();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-0 right-0 m-4 sm:m-8 w-full max-w-lg h-full max-h-[70vh] z-50 flex flex-col">
      <div className="flex flex-col flex-grow bg-gray-800/80 backdrop-blur-xl border border-gray-700 rounded-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between p-4 bg-gray-900/50 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 via-indigo-500 to-purple-600 shadow-[0_10px_25px_rgba(15,23,42,0.45)]">
              <MuRPBotIcon className="w-6 h-6 text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.7)]" />
              <div className="absolute inset-0 rounded-2xl border border-white/20" />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight text-white">
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-200 via-indigo-200 to-purple-200 uppercase tracking-[0.35em]">
                  MB
                </span>
                <span className="ml-2 text-sm uppercase tracking-[0.35em] text-gray-300 font-semibold">
                  MuRPBot
                </span>
              </h2>
              {messagesRemaining !== null && (
                <p className="text-xs text-gray-400">
                  {messagesRemaining} messages remaining this month
                </p>
              )}
              {messagesRemaining === null && (
                <p className="text-xs text-indigo-400">Unlimited messages</p>
              )}
            </div>
          </div>
          <Button
            onClick={onClose}
            className="p-1 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
          >
            <CloseIcon className="w-6 h-6" />
          </Button>
        </header>

        {/* Upgrade Banner */}
        {showUpgradePrompt && userTier === 'basic' && (
          <div className="bg-gradient-to-r from-indigo-900 to-purple-900 p-3 border-b border-indigo-500">
            <p className="text-sm text-white font-medium">
              ✨ Running low on messages? Upgrade to Full AI for unlimited chat!
            </p>
            <Button
              onClick={() => {
                /* Navigate to upgrade page */
              }}
              className="mt-2 w-full py-1 px-3 bg-indigo-500 hover:bg-indigo-600 rounded text-white text-xs font-bold transition-colors"
            >
              Upgrade Now - $49/mo
            </Button>
          </div>
        )}

        {/* Messages */}
        <main className="flex-1 p-4 overflow-y-auto space-y-4">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.sender === 'bot' && (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 via-indigo-500 to-purple-600 flex-shrink-0 flex items-center justify-center shadow-[0_6px_15px_rgba(79,70,229,0.45)]">
                  <MuRPBotIcon className="w-4 h-4 text-white" />
                </div>
              )}
              <div className="flex flex-col gap-1 max-w-xs md:max-w-md">
                <div
                  className={`p-3 rounded-lg ${
                    msg.sender === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200'
                  }`}
                >
                  <p
                    className="text-sm prose prose-sm prose-invert whitespace-pre-wrap"
                    dangerouslySetInnerHTML={{ __html: msg.text.replace(/\n/g, '<br />') }}
                  ></p>
                </div>
                {msg.sender === 'bot' && msg.cost !== undefined && msg.cost > 0 && (
                  <p className="text-xs text-gray-500 px-2">
                    💰 ${msg.cost.toFixed(6)} • {msg.tokens?.toLocaleString()} tokens
                  </p>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 via-indigo-500 to-purple-600 flex-shrink-0 flex items-center justify-center shadow-[0_6px_15px_rgba(79,70,229,0.45)]">
                <MuRPBotIcon className="w-4 h-4 text-white" />
              </div>
              <div className="max-w-xs md:max-w-md p-3 rounded-lg bg-gray-700 text-gray-200">
                <div className="flex items-center space-x-1">
                  <span className="w-2 h-2 bg-gray-300 rounded-full animate-pulse [animation-delay:-0.3s]"></span>
                  <span className="w-2 h-2 bg-gray-300 rounded-full animate-pulse [animation-delay:-0.15s]"></span>
                  <span className="w-2 h-2 bg-gray-300 rounded-full animate-pulse"></span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </main>

        {/* Input */}
        <footer className="p-4 bg-gray-900/50 border-t border-gray-700">
          <div className="flex items-center bg-gray-700 rounded-lg">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask about inventory..."
              className="w-full bg-transparent p-3 text-gray-200 placeholder-gray-400 focus:outline-none"
              disabled={isLoading}
            />
            <Button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="p-3 text-gray-400 disabled:text-gray-600 enabled:hover:text-indigo-400 transition-colors"
            >
              <SendIcon className="w-6 h-6" />
            </Button>
          </div>
          {userTier === 'basic' && (
            <p className="text-xs text-gray-500 mt-2 text-center">
              Powered by {messagesRemaining !== null && messagesRemaining > 50 ? 'Gemini 2.0 Flash (Free Tier)' : 'AI Gateway'}
            </p>
          )}
          {userTier === 'full_ai' && (
            <p className="text-xs text-indigo-400 mt-2 text-center">
              Powered by GPT-4o via Vercel AI Gateway 🚀
            </p>
          )}
        </footer>
      </div>
    </div>
  );
};

export default AiAssistant;

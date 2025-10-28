import React, { useState, useRef, useEffect } from 'react';
import { askAboutInventory } from '../services/geminiService';
import type { BillOfMaterials, InventoryItem, Vendor, PurchaseOrder, AiConfig } from '../types';
import { BotIcon, CloseIcon, SendIcon } from './icons';

interface AiAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  boms: BillOfMaterials[];
  inventory: InventoryItem[];
  vendors: Vendor[];
  purchaseOrders: PurchaseOrder[];
  aiConfig: AiConfig;
}

type Message = {
  sender: 'user' | 'bot';
  text: string;
};

const AiAssistant: React.FC<AiAssistantProps> = ({ isOpen, onClose, boms, inventory, vendors, purchaseOrders, aiConfig }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen && messages.length === 0) {
        setMessages([{sender: 'bot', text: "Hello! How can I help you with your inventory today? You can ask things like 'Which items are below their reorder point?' or 'What is the status of PO-2024-002?'"}]);
    }
  }, [isOpen, messages]);

  useEffect(scrollToBottom, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = { sender: 'user', text: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const promptTemplate = aiConfig.prompts.find(p => p.id === 'askAboutInventory');
      if (!promptTemplate) {
        throw new Error("Inventory assistant prompt not found.");
      }
      const response = await askAboutInventory(aiConfig.model, promptTemplate.prompt, input, boms, inventory, vendors, purchaseOrders);
      const botMessage: Message = { sender: 'bot', text: response };
      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      console.error(error);
      const errorMessage: Message = { sender: 'bot', text: 'Sorry, I encountered an error. Please try again.' };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
        handleSend();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-0 right-0 m-4 sm:m-8 w-full max-w-lg h-full max-h-[70vh] z-50 flex flex-col">
      <div className="flex flex-col flex-grow bg-gray-800/80 backdrop-blur-xl border border-gray-700 rounded-lg shadow-2xl overflow-hidden">
        <header className="flex items-center justify-between p-4 bg-gray-900/50 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <BotIcon className="w-6 h-6 text-indigo-400" />
            <h2 className="text-lg font-semibold text-white">AI Inventory Assistant</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white transition-colors">
            <CloseIcon className="w-6 h-6" />
          </button>
        </header>
        
        <main className="flex-1 p-4 overflow-y-auto space-y-4">
          {messages.map((msg, index) => (
            <div key={index} className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.sender === 'bot' && <div className="w-8 h-8 rounded-full bg-indigo-500 flex-shrink-0 flex items-center justify-center"><BotIcon className="w-5 h-5 text-white"/></div>}
              <div className={`max-w-xs md:max-w-md p-3 rounded-lg ${msg.sender === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200'}`}>
                <p className="text-sm prose prose-sm prose-invert" dangerouslySetInnerHTML={{ __html: msg.text.replace(/\n/g, '<br />') }}></p>
              </div>
            </div>
          ))}
          {isLoading && (
             <div className="flex gap-3 justify-start">
               <div className="w-8 h-8 rounded-full bg-indigo-500 flex-shrink-0 flex items-center justify-center"><BotIcon className="w-5 h-5 text-white"/></div>
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
            <button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="p-3 text-gray-400 disabled:text-gray-600 enabled:hover:text-indigo-400 transition-colors"
            >
              <SendIcon className="w-6 h-6" />
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default AiAssistant;

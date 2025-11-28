import React, { useState, useRef, useEffect } from 'react';
import Button from '@/components/ui/Button';
import type { InventoryItem } from '../types';
import {
  ChatBubbleLeftRightIcon,
  PaperAirplaneIcon,
  UserIcon,
  CpuChipIcon,
  SparklesIcon,
} from './icons';

interface SkuAiAssistantProps {
  sku: string;
  inventoryItem?: InventoryItem;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const SkuAiAssistant: React.FC<SkuAiAssistantProps> = ({ sku, inventoryItem }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Add welcome message
    const welcomeMessage: ChatMessage = {
      id: 'welcome',
      role: 'assistant',
      content: `Hello! I'm your AI assistant for SKU ${sku}. I can help you with:

• Stock level analysis and forecasting
• Purchase history insights
• BOM usage and dependencies
• Pricing optimization suggestions
• Inventory management recommendations
• Vendor performance analysis

What would you like to know about this SKU?`,
      timestamp: new Date(),
    };
    setMessages([welcomeMessage]);
  }, [sku]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: inputMessage,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      // TODO: Replace with actual AI API call
      // For now, simulate AI response
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

      const aiResponse = generateMockResponse(inputMessage, sku, inventoryItem);

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: aiResponse,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('AI response error:', error);
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'Sorry, I encountered an error while processing your request. Please try again.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const generateMockResponse = (userInput: string, sku: string, inventoryItem?: InventoryItem): string => {
    const input = userInput.toLowerCase();

    if (input.includes('stock') || input.includes('inventory')) {
      const stock = inventoryItem?.stock || 0;
      const reorderPoint = inventoryItem?.reorderPoint || 0;
      const status = stock > reorderPoint ? 'healthy' : 'low';

      return `Based on current data for SKU ${sku}:

**Stock Status:** ${status === 'healthy' ? '✅ Healthy' : '⚠️ Low Stock'}
**Current Stock:** ${stock} units
**Reorder Point:** ${reorderPoint} units

${status === 'low'
        ? `Recommendation: Consider placing a purchase order soon. Current stock is below the reorder point.`
        : `Stock levels are adequate. Continue monitoring consumption trends.`}

Would you like me to analyze consumption patterns or suggest optimal order quantities?`;
    }

    if (input.includes('price') || input.includes('cost')) {
      const unitCost = inventoryItem?.unitCost || 0;
      const unitPrice = inventoryItem?.unitPrice || 0;

      return `Pricing analysis for SKU ${sku}:

**Unit Cost:** $${unitCost.toFixed(2)}
**Unit Price:** $${unitPrice.toFixed(2)}
**Gross Margin:** ${unitPrice > 0 ? (((unitPrice - unitCost) / unitPrice) * 100).toFixed(1) : 0}%

**Insights:**
• Current pricing provides ${unitPrice > unitCost * 1.5 ? 'healthy' : unitPrice > unitCost * 1.2 ? 'moderate' : 'thin'} margins
• Consider reviewing vendor pricing for potential cost reductions
• Market analysis suggests room for ${unitPrice > unitCost * 2 ? 'price increase' : 'cost optimization'}

Would you like recommendations for pricing strategy or vendor negotiation points?`;
    }

    if (input.includes('consumption') || input.includes('usage') || input.includes('trend')) {
      return `Consumption analysis for SKU ${sku}:

**Recent Trends:**
• Average daily consumption: ~12-15 units
• Peak usage days: Monday-Wednesday
• Seasonal pattern: Higher in Q4, lower in Q2

**Forecasting:**
• Next 30 days: Expected consumption of ~450 units
• Confidence level: High (based on 90-day historical data)
• Risk factors: Potential supply chain disruptions

**Recommendations:**
• Maintain safety stock of 100-150 units
• Consider weekly ordering to optimize cash flow
• Monitor for unusual consumption spikes

Would you like me to generate a detailed consumption forecast or analyze specific time periods?`;
    }

    if (input.includes('vendor') || input.includes('supplier')) {
      return `Vendor analysis for SKU ${sku}:

**Primary Vendor:** ${inventoryItem?.vendorId || 'Unknown'}
**Performance Metrics:**
• On-time delivery: 94%
• Quality rating: 4.6/5
• Lead time: ${inventoryItem?.leadTimeDays || 'Unknown'} days
• Last order: 2024-11-15

**Alternative Vendors:**
• Vendor B: 15% higher cost, 2-day lead time
• Vendor C: 8% lower cost, 7-day lead time

**Recommendations:**
• Current vendor provides best balance of cost and reliability
• Consider dual sourcing for critical periods
• Negotiate volume discounts for quarterly orders

Would you like me to compare vendor options or analyze vendor performance history?`;
    }

    if (input.includes('bom') || input.includes('recipe') || input.includes('used in')) {
      return `BOM usage analysis for SKU ${sku}:

**Products Using This SKU:**
• Premium Potting Mix (PROD-A): 5 lbs per batch
• Organic Super Soil (PROD-B): 10 lbs per batch
• Biochar Conditioner (PROD-C): 8 lbs per batch

**Impact Assessment:**
• Total dependent SKUs: 3 finished products
• Monthly consumption through BOMs: ~2,300 lbs
• Production bottleneck risk: Medium

**Recommendations:**
• Stock adjustments affect 3 product lines
• Consider buffer stock for production continuity
• Monitor BOM changes for ripple effects

Would you like me to show detailed BOM dependencies or suggest inventory optimization strategies?`;
    }

    // Default response
    return `I understand you're asking about "${userInput}" for SKU ${sku}.

Based on the available data, I can provide insights on:
• 📊 Stock levels and reorder recommendations
• 💰 Pricing analysis and margin optimization
• 📈 Consumption trends and forecasting
• 🏭 BOM usage and production impact
• 🚚 Vendor performance and alternatives

Could you please clarify what specific aspect you'd like me to analyze? For example:
- "What's the current stock status?"
- "Analyze pricing strategy"
- "Show consumption trends"
- "Compare vendor options"`;
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex flex-col h-[600px] bg-gray-900 border border-gray-700 rounded-lg">
      {/* Header */}
      <div className="flex items-center space-x-3 p-4 border-b border-gray-700">
        <div className="flex items-center space-x-2">
          <SparklesIcon className="w-6 h-6 text-blue-400" />
          <span className="text-white font-medium">AI Assistant</span>
        </div>
        <div className="text-gray-400 text-sm">
          SKU: {sku}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                message.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-100'
              }`}
            >
              <div className="flex items-center space-x-2 mb-2">
                {message.role === 'user' ? (
                  <UserIcon className="w-4 h-4" />
                ) : (
                  <CpuChipIcon className="w-4 h-4" />
                )}
                <span className="text-xs opacity-70">
                  {message.role === 'user' ? 'You' : 'AI Assistant'}
                </span>
                <span className="text-xs opacity-50">
                  {message.timestamp.toLocaleTimeString()}
                </span>
              </div>
              <div className="whitespace-pre-wrap text-sm">
                {message.content}
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-800 rounded-lg p-3 max-w-[80%]">
              <div className="flex items-center space-x-2">
                <CpuChipIcon className="w-4 h-4" />
                <span className="text-xs text-gray-400">AI Assistant is thinking...</span>
              </div>
              <div className="flex space-x-1 mt-2">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-700">
        <div className="flex space-x-2">
          <textarea
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask me anything about this SKU..."
            className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 resize-none focus:outline-none focus:border-blue-500"
            rows={2}
            disabled={isLoading}
          />
          <Button
            onClick={handleSendMessage}
            disabled={!inputMessage.trim() || isLoading}
            className="self-end"
          >
            <PaperAirplaneIcon className="w-4 h-4" />
          </Button>
        </div>
        <div className="text-xs text-gray-500 mt-2">
          Press Enter to send, Shift+Enter for new line
        </div>
      </div>
    </div>
  );
};

export { SkuAiAssistant };
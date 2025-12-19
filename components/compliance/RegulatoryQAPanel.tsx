/**
 * Regulatory Q&A Panel Component
 *
 * Allows users to ask regulatory compliance questions and get
 * AI-powered answers with citations from stored regulations.
 */

import React, { useState, useCallback } from 'react';
import Button from '@/components/ui/Button';
import {
  askRegulatoryQuestion,
  getFrequentlyAskedQuestions,
} from '@/services/regulatoryDataService';
import type { RegulatoryAnswer } from '@/services/regulatoryDataService';

interface RegulatoryQAPanelProps {
  defaultStateCode?: string;
  productType?: string;
  onAnswerReceived?: (answer: RegulatoryAnswer) => void;
}

const CATEGORIES = [
  { id: 'all', label: 'All Topics' },
  { id: 'registration', label: 'Registration' },
  { id: 'labeling', label: 'Labeling' },
  { id: 'claims', label: 'Claims' },
  { id: 'testing', label: 'Testing' },
];

const PRIORITY_STATES = ['CA', 'OR', 'WA', 'NY', 'TX', 'CO'];

export default function RegulatoryQAPanel({
  defaultStateCode,
  productType,
  onAnswerReceived,
}: RegulatoryQAPanelProps) {
  const [question, setQuestion] = useState('');
  const [selectedState, setSelectedState] = useState(defaultStateCode || '');
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<RegulatoryAnswer | null>(null);
  const [faqs, setFaqs] = useState<Array<{
    question: string;
    shortAnswer: string;
    category: string;
    states: string[];
  }>>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showFaqs, setShowFaqs] = useState(true);

  const fetchFaqs = useCallback(async () => {
    const result = await getFrequentlyAskedQuestions(
      selectedState || undefined,
      selectedCategory === 'all' ? undefined : selectedCategory
    );
    if (result.success && result.data) {
      setFaqs(result.data);
    }
  }, [selectedState, selectedCategory]);

  React.useEffect(() => {
    fetchFaqs();
  }, [fetchFaqs]);

  const handleAskQuestion = async () => {
    if (!question.trim()) return;

    setLoading(true);
    setShowFaqs(false);

    const result = await askRegulatoryQuestion({
      question: question.trim(),
      context: {
        stateCode: selectedState || undefined,
        productType,
      },
    });

    setLoading(false);

    if (result.success && result.data) {
      setAnswer(result.data);
      onAnswerReceived?.(result.data);
    }
  };

  const handleFaqClick = (faqQuestion: string) => {
    setQuestion(faqQuestion);
    setShowFaqs(false);
  };

  const handleNewQuestion = () => {
    setAnswer(null);
    setQuestion('');
    setShowFaqs(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-medium text-gray-100">Regulatory Q&A</h3>
        <p className="text-sm text-gray-400 mt-1">
          Ask questions about state regulatory compliance and get answers with citations
        </p>
      </div>

      {/* Question Input */}
      <div className="space-y-3">
        <div className="flex gap-3">
          {/* State Selector */}
          <select
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value)}
            className="bg-gray-700 border border-gray-600 text-gray-200 rounded-lg px-3 py-2"
          >
            <option value="">All Priority States</option>
            {PRIORITY_STATES.map((state) => (
              <option key={state} value={state}>{state}</option>
            ))}
          </select>

          {/* Question Input */}
          <div className="flex-1 relative">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAskQuestion()}
              placeholder="Ask a regulatory compliance question..."
              className="w-full bg-gray-700 border border-gray-600 text-gray-200 rounded-lg px-4 py-2 pr-24"
            />
            <Button
              onClick={handleAskQuestion}
              disabled={loading || !question.trim()}
              className="absolute right-1 top-1 px-4 py-1 bg-accent-600 hover:bg-accent-500 text-white rounded text-sm disabled:opacity-50"
            >
              {loading ? 'Searching...' : 'Ask'}
            </Button>
          </div>
        </div>

        {/* Example Questions */}
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-gray-500">Try:</span>
          {[
            'What heavy metal limits apply?',
            'Is registration required?',
            'What labeling is required?',
          ].map((example, idx) => (
            <button
              key={idx}
              onClick={() => setQuestion(example)}
              className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-400 rounded"
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      {/* Answer Display */}
      {answer && (
        <div className="space-y-4">
          <div className="p-4 bg-gray-800 border border-gray-700 rounded-lg">
            {/* Answer */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-gray-200">Answer</h4>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 text-xs rounded ${
                    answer.confidence >= 0.7 ? 'bg-green-900 text-green-300' :
                    answer.confidence >= 0.4 ? 'bg-yellow-900 text-yellow-300' :
                    'bg-red-900 text-red-300'
                  }`}>
                    Confidence: {Math.round(answer.confidence * 100)}%
                  </span>
                  {answer.requiresProfessionalReview && (
                    <span className="px-2 py-0.5 text-xs bg-amber-900 text-amber-300 rounded">
                      Review Recommended
                    </span>
                  )}
                </div>
              </div>
              <p className="text-gray-300">{answer.answer}</p>
            </div>

            {/* Sources */}
            {answer.sources.length > 0 && (
              <div className="mb-4">
                <h5 className="text-sm font-medium text-gray-400 mb-2">Sources</h5>
                <div className="space-y-2">
                  {answer.sources.map((source, idx) => (
                    <div key={idx} className="p-3 bg-gray-750 rounded border border-gray-700">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-1.5 py-0.5 text-xs bg-blue-900 text-blue-300 rounded">
                          {source.stateCode}
                        </span>
                        {source.regulationCode && (
                          <span className="text-xs text-gray-500">{source.regulationCode}</span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-gray-200">{source.title}</p>
                      <p className="text-xs text-gray-400 mt-1">{source.excerpt}</p>
                      {source.url && (
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-accent-400 hover:text-accent-300 mt-1 inline-block"
                        >
                          View Source
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Disclaimer */}
            <div className="p-3 bg-amber-900 bg-opacity-30 border border-amber-800 rounded text-xs text-amber-300">
              {answer.disclaimer}
            </div>

            {/* Related Questions */}
            {answer.relatedQuestions && answer.relatedQuestions.length > 0 && (
              <div className="mt-4">
                <h5 className="text-sm font-medium text-gray-400 mb-2">Related Questions</h5>
                <div className="flex flex-wrap gap-2">
                  {answer.relatedQuestions.map((relatedQ, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setQuestion(relatedQ);
                        handleAskQuestion();
                      }}
                      className="text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded"
                    >
                      {relatedQ}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Button
            onClick={handleNewQuestion}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded"
          >
            Ask Another Question
          </Button>
        </div>
      )}

      {/* FAQs */}
      {showFaqs && !answer && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-gray-200">Frequently Asked Questions</h4>
            <div className="flex gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1 text-xs rounded ${
                    selectedCategory === cat.id
                      ? 'bg-accent-600 text-white'
                      : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, idx) => (
              <div
                key={idx}
                className="p-4 bg-gray-800 border border-gray-700 rounded-lg hover:border-gray-600 cursor-pointer"
                onClick={() => handleFaqClick(faq.question)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h5 className="font-medium text-gray-200 mb-1">{faq.question}</h5>
                    <p className="text-sm text-gray-400">{faq.shortAnswer}</p>
                  </div>
                  <div className="flex gap-1 ml-4">
                    {faq.states.slice(0, 3).map((state) => (
                      <span key={state} className="px-1.5 py-0.5 text-xs bg-gray-700 text-gray-400 rounded">
                        {state}
                      </span>
                    ))}
                    {faq.states.length > 3 && (
                      <span className="text-xs text-gray-500">+{faq.states.length - 3}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

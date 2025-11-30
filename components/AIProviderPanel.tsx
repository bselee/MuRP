import React, { useState, useEffect } from 'react';
import { BotIcon, CheckCircleIcon, ExclamationCircleIcon, PencilIcon } from './icons';
import Button from '@/components/ui/Button';
import type { AiConfig, AiPrompt } from '../types';
import { defaultAiConfig } from '../types';
import AiPromptEditModal from './AiPromptEditModal';
import { 
AIProvider,
  getAIProviderSettings,
  updateAIProviderSettings,
  testAIProviderConnection,
  getAvailableModels,
  validateAPIKey,
  type AIProviderConfig
} from '../services/aiProviderService';

interface AIProviderPanelProps {
  aiConfig: AiConfig;
  setAiConfig: (config: AiConfig) => void;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

/**
 * AI Provider Configuration Panel
 * Handles multi-provider AI setup (Gemini, OpenAI, Anthropic, Azure)
 * Includes legacy Gemini model selection and prompt management
 */
const AIProviderPanel: React.FC<AIProviderPanelProps> = ({
  aiConfig,
  setAiConfig,
  addToast,
}) => {
  // AI Provider Settings state
  const [providerConfig, setProviderConfig] = useState<AIProviderConfig | null>(null);
  const [testingProvider, setTestingProvider] = useState(false);
  const [providerTestResult, setProviderTestResult] = useState<'success' | 'error' | null>(null);

  // Prompt management state
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState<AiPrompt | null>(null);

  // Load AI provider settings on mount
  useEffect(() => {
    loadProviderSettings();
  }, []);

  const loadProviderSettings = async () => {
    try {
      const settings = await getAIProviderSettings();
      setProviderConfig(settings);
    } catch (error) {
      console.error('Failed to load AI provider settings:', error);
    }
  };

  const handleProviderChange = (provider: AIProvider) => {
    if (!providerConfig) return;
    const models = getAvailableModels(provider);
    setProviderConfig({
      ...providerConfig,
      provider,
      model: models[0], // Set first model as default
    });
    setProviderTestResult(null);
  };

  const handleSaveProvider = async () => {
    if (!providerConfig) return;
    try {
      await updateAIProviderSettings(providerConfig);
      addToast('AI provider settings saved successfully', 'success');
    } catch (error: any) {
      addToast(`Failed to save: ${error.message}`, 'error');
    }
  };

  const handleTestProvider = async () => {
    if (!providerConfig) return;
    setTestingProvider(true);
    setProviderTestResult(null);
    try {
      const success = await testAIProviderConnection(providerConfig);
      setProviderTestResult(success ? 'success' : 'error');
      addToast(
        success ? 'Provider connection successful!' : 'Provider connection failed',
        success ? 'success' : 'error'
      );
    } catch (error: any) {
      setProviderTestResult('error');
      addToast(`Test failed: ${error.message}`, 'error');
    } finally {
      setTestingProvider(false);
    }
  };

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setAiConfig({ ...aiConfig, model: e.target.value });
    addToast('AI Model updated successfully.', 'success');
  };

  const handleEditPrompt = (prompt: AiPrompt) => {
    setSelectedPrompt(prompt);
    setIsPromptModalOpen(true);
  };

  const handleSavePrompt = (updatedPrompt: AiPrompt) => {
    const newPrompts = aiConfig.prompts.map((p) =>
      p.id === updatedPrompt.id ? updatedPrompt : p
    );
    setAiConfig({ ...aiConfig, prompts: newPrompts });
    addToast(`Prompt "${updatedPrompt.name}" updated successfully.`, 'success');
  };

  const handleResetPrompts = () => {
    setAiConfig({ ...aiConfig, prompts: defaultAiConfig.prompts });
    addToast('All prompts have been reset to their default values.', 'info');
  };

  return (
    <div className="space-y-6">
      {/* AI Provider Configuration */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
        <div className="flex items-center gap-4 mb-4">
          <BotIcon className="w-8 h-8 text-accent-400" />
          <div>
            <h3 className="text-lg font-semibold text-white">AI Provider Configuration</h3>
            <p className="text-sm text-gray-400 mt-1">
              Configure the AI provider for the entire application. Defaults to Gemini.
            </p>
          </div>
        </div>

        {providerConfig && (
          <div className="mt-4 pt-4 border-t border-gray-700/50 space-y-4">
            {/* Provider Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                AI Provider
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(['gemini', 'openai', 'anthropic', 'azure'] as AIProvider[]).map((provider) => (
                  <Button
                    key={provider}
                    onClick={() => handleProviderChange(provider)}
                    className={`p-3 rounded-md border-2 transition-all ${
                      providerConfig.provider === provider
                        ? 'border-accent-500 bg-accent-900/30'
                        : 'border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <div className="font-medium text-white capitalize text-sm">{provider}</div>
                    {provider === 'gemini' && (
                      <div className="text-xs text-gray-500 mt-1">Default</div>
                    )}
                  </Button>
                ))}
              </div>
            </div>

            {/* Model Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Model</label>
              <select
                value={providerConfig.model}
                onChange={(e) => setProviderConfig({ ...providerConfig, model: e.target.value })}
                className="w-full md:w-1/2 bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-accent-500 focus:border-accent-500 text-sm"
              >
                {getAvailableModels(providerConfig.provider).map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </div>

            {/* API Key */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                API Key
                {providerConfig.apiKey &&
                  validateAPIKey(providerConfig.provider, providerConfig.apiKey) && (
                    <CheckCircleIcon className="inline w-4 h-4 ml-2 text-green-400" />
                  )}
              </label>
              <input
                type="password"
                value={providerConfig.apiKey}
                onChange={(e) =>
                  setProviderConfig({ ...providerConfig, apiKey: e.target.value })
                }
                placeholder={`Enter your ${providerConfig.provider} API key`}
                className="w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-accent-500 focus:border-accent-500 text-sm"
              />
            </div>

            {/* Azure Endpoint (only for Azure) */}
            {providerConfig.provider === 'azure' && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Azure Endpoint
                </label>
                <input
                  type="text"
                  value={providerConfig.endpoint || ''}
                  onChange={(e) =>
                    setProviderConfig({ ...providerConfig, endpoint: e.target.value })
                  }
                  placeholder="https://your-resource.openai.azure.com"
                  className="w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-accent-500 focus:border-accent-500 text-sm"
                />
              </div>
            )}

            {/* Advanced Settings */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Temperature
                </label>
                <input
                  type="number"
                  min="0"
                  max="2"
                  step="0.1"
                  value={providerConfig.temperature || 0.3}
                  onChange={async (e) => {
                    const newTemp = parseFloat(e.target.value);
                    const updated = { ...providerConfig, temperature: newTemp };
                    setProviderConfig(updated);
                    try {
                      await updateAIProviderSettings(updated);
                    } catch (error: any) {
                      console.error('Auto-save temperature failed:', error);
                    }
                  }}
                  className="w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-accent-500 focus:border-accent-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Max Tokens
                </label>
                <input
                  type="number"
                  min="256"
                  max="32768"
                  step="256"
                  value={providerConfig.maxTokens || 4096}
                  onChange={async (e) => {
                    const newMax = parseInt(e.target.value);
                    const updated = { ...providerConfig, maxTokens: newMax };
                    setProviderConfig(updated);
                    try {
                      await updateAIProviderSettings(updated);
                    } catch (error: any) {
                      console.error('Auto-save maxTokens failed:', error);
                    }
                  }}
                  className="w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-accent-500 focus:border-accent-500 text-sm"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2 pt-4 border-t border-gray-700">
              <div className="flex items-center gap-3">
                <Button
                  onClick={handleTestProvider}
                  disabled={testingProvider || !providerConfig.apiKey}
                  className="bg-gray-700 text-white font-semibold py-2 px-4 rounded-md hover:bg-gray-600 transition-colors disabled:opacity-50 text-sm"
                >
                  {testingProvider ? 'Testing...' : 'Test Connection'}
                </Button>
                <Button
                  onClick={handleSaveProvider}
                  disabled={!providerConfig.apiKey}
                  className="bg-accent-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-accent-600 transition-colors disabled:opacity-50 text-sm"
                >
                  Save Provider & API Key
                </Button>
                {providerTestResult && (
                  <div
                    className={`flex items-center gap-2 text-sm ${
                      providerTestResult === 'success' ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {providerTestResult === 'success' ? (
                      <CheckCircleIcon className="w-4 h-4" />
                    ) : (
                      <ExclamationCircleIcon className="w-4 h-4" />
                    )}
                    {providerTestResult === 'success' ? 'Connected' : 'Failed'}
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500">
                Temperature and Max Tokens save automatically. Provider, Model, and API Key require clicking Save.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Legacy Gemini Model Configuration */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
        <div className="flex items-center gap-4">
          <BotIcon className="w-8 h-8 text-accent-400" />
          <div>
            <h3 className="text-lg font-semibold text-white">
              Legacy: Gemini Model Selection
            </h3>
            <p className="text-sm text-gray-400 mt-1">
              For backwards compatibility with existing features.
            </p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-700/50">
          <label htmlFor="ai-model-select" className="block text-sm font-medium text-gray-300">
            Active Model
          </label>
          <select
            id="ai-model-select"
            value={aiConfig.model}
            onChange={handleModelChange}
            className="mt-1 block w-full md:w-1/2 bg-gray-700 border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-accent-500 focus:border-accent-500 sm:text-sm"
          >
            <option value="gemini-2.5-flash">Gemini 2.5 Flash (Fast & Cost-Effective)</option>
            <option value="gemini-2.5-pro">Gemini 2.5 Pro (Advanced Reasoning)</option>
          </select>
        </div>
      </div>

      {/* AI Prompt Management */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-semibold text-white">AI Prompt Management</h3>
            <p className="text-sm text-gray-400 mt-1">
              Customize the system prompts used by the AI assistant.
            </p>
          </div>
          <Button
            onClick={handleResetPrompts}
            className="text-sm font-semibold text-gray-400 hover:text-white"
          >
            Reset all to default
          </Button>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-700/50 space-y-2">
          {aiConfig.prompts.map((prompt) => (
            <div
              key={prompt.id}
              className="flex justify-between items-center p-3 bg-gray-900/50 rounded-md"
            >
              <div>
                <p className="font-semibold text-white">{prompt.name}</p>
                <p className="text-xs text-gray-400">{prompt.description}</p>
              </div>
              <Button
                onClick={() => handleEditPrompt(prompt)}
                className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold py-1.5 px-3 rounded-md transition-colors"
              >
                <PencilIcon className="w-4 h-4" /> Edit
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Prompt Edit Modal */}
      <AiPromptEditModal
        isOpen={isPromptModalOpen}
        onClose={() => setIsPromptModalOpen(false)}
        prompt={selectedPrompt}
        onSave={handleSavePrompt}
      />
    </div>
  );
};

export default AIProviderPanel;

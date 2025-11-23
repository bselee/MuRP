import React, { useState, useEffect } from 'react';
import type { AiPrompt } from '../types';
import Modal from './Modal';

import Button from '@/components/ui/Button';
interface AiPromptEditModalProps {
  prompt: AiPrompt | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedPrompt: AiPrompt) => void;
}

const AiPromptEditModal: React.FC<AiPromptEditModalProps> = ({ prompt, isOpen, onClose, onSave }) => {
  const [editedPrompt, setEditedPrompt] = useState<AiPrompt | null>(prompt);

  useEffect(() => {
    setEditedPrompt(prompt);
  }, [prompt, isOpen]);

  if (!isOpen || !editedPrompt) {
    return null;
  }
  
  const handleSave = () => {
    onSave(editedPrompt);
    onClose();
  };

  const handlePromptTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditedPrompt(prev => prev ? { ...prev, prompt: e.target.value } : null);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Edit Prompt: ${editedPrompt.name}`}>
      <div className="space-y-4">
        <div>
            <h3 className="text-lg font-semibold text-white">{editedPrompt.name}</h3>
            <p className="text-sm text-gray-400">{editedPrompt.description}</p>
        </div>

        <div>
            <label htmlFor="prompt-text" className="block text-sm font-medium text-gray-300 mb-1">
                Prompt Text
            </label>
            <textarea
                id="prompt-text"
                value={editedPrompt.prompt}
                onChange={handlePromptTextChange}
                rows={15}
                className="w-full bg-gray-900/50 text-white font-mono text-sm rounded-md p-3 border border-gray-600 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Enter the AI prompt here..."
            />
             {/* FIX: Wrap the {{variable}} placeholder in a code tag and string expression to prevent JSX parsing errors. */}
             <p className="text-xs text-gray-500 mt-1">Use placeholders like <code>{`{{variable}}`}</code> for dynamic data insertion.</p>
        </div>

        <div className="flex justify-end pt-4 border-t border-gray-700">
            <Button onClick={onClose} className="bg-gray-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition-colors mr-3">Cancel</Button>
            <Button onClick={handleSave} className="bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors">
                Save Prompt
            </Button>
        </div>
      </div>
    </Modal>
  );
};

export default AiPromptEditModal;
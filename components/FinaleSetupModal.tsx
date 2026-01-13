import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import Button from '@/components/ui/Button';
import { useTheme } from './ThemeProvider';
import { finaleSyncService } from '../services/finaleSyncService';

interface FinaleSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

const FinaleSetupModal: React.FC<FinaleSetupModalProps> = ({ isOpen, onClose, onSave }) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const [accountPath, setAccountPath] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [inventoryUrl, setInventoryUrl] = useState('');
  const [bomUrl, setBomUrl] = useState('');

  // Styles
  const labelClass = `block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`;
  const inputClass = `w-full px-3 py-2 rounded-md transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none ${
    isDark
      ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500'
      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
  }`;
  const sectionClass = `border-t ${isDark ? 'border-gray-700' : 'border-gray-200'} pt-4 mt-4`;

  useEffect(() => {
    if (isOpen) {
      // Load saved credentials
      setAccountPath(localStorage.getItem('FINALE_ACCOUNT_PATH') || '');
      setUsername(localStorage.getItem('FINALE_USERNAME') || '');
      setPassword(localStorage.getItem('FINALE_PASSWORD') || '');
      setInventoryUrl(localStorage.getItem('finale_inventory_report_url') || '');
      setBomUrl(localStorage.getItem('finale_bom_report_url') || '');
    }
  }, [isOpen]);

  const handleSave = () => {
    // Save to localStorage
    if (accountPath) localStorage.setItem('FINALE_ACCOUNT_PATH', accountPath);
    if (username) localStorage.setItem('FINALE_USERNAME', username);
    if (password) localStorage.setItem('FINALE_PASSWORD', password);
    if (inventoryUrl) localStorage.setItem('finale_inventory_report_url', inventoryUrl);
    if (bomUrl) localStorage.setItem('finale_bom_report_url', bomUrl);

    // Initialize service
    if (accountPath && username && password) {
        finaleSyncService.setCredentials(username, password, accountPath);
    }

    onSave();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Configure Finale Inventory" size="lg">
        <div className="space-y-4 p-1 max-h-[70vh] overflow-y-auto">
            <div className={`p-3 rounded-md text-sm mb-4 ${isDark ? 'bg-blue-900/30 text-blue-200' : 'bg-blue-50 text-blue-700'}`}>
                Enter your Finale Inventory API credentials. These will be stored locally in your browser.
            </div>

            <h3 className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>API Credentials</h3>
            
            <div className="grid grid-cols-1 gap-4">
                <div>
                    <label className={labelClass}>Account Path</label>
                    <input
                        type="text"
                        value={accountPath}
                        onChange={(e) => setAccountPath(e.target.value)}
                        placeholder="/my-company"
                        className={inputClass}
                    />
                    <p className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        Your Finale account URL path (e.g. /my-company-inc)
                    </p>
                </div>
                <div>
                    <label className={labelClass}>Username</label>
                    <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="integration-user"
                        className={inputClass}
                    />
                </div>
                <div>
                    <label className={labelClass}>Password</label>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className={inputClass}
                    />
                </div>
            </div>

            <div className={sectionClass}>
                <h3 className={`font-semibold mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>Report URLs (Optional)</h3>
                <p className={`text-xs mb-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    If regular API sync fails, you can use shared Report URLs from Finale (JSON format).
                </p>

                <div className="space-y-3">
                    <div>
                        <label className={labelClass}>Inventory Report URL</label>
                        <input
                            type="text"
                            value={inventoryUrl}
                            onChange={(e) => setInventoryUrl(e.target.value)}
                            placeholder="https://app.finaleinventory.com/..."
                            className={inputClass}
                        />
                    </div>
                    <div>
                        <label className={labelClass}>BOM Report URL</label>
                        <input
                            type="text"
                            value={bomUrl}
                            onChange={(e) => setBomUrl(e.target.value)}
                            placeholder="https://app.finaleinventory.com/..."
                            className={inputClass}
                        />
                        <p className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            Required for syncing Bill of Materials structure (~68 chars).
                        </p>
                    </div>
                </div>
            </div>
            
            <div className="flex justify-end pt-4 gap-2 sticky bottom-0 bg-inherit border-t border-gray-200 dark:border-gray-700 mt-4">
                <Button variant="secondary" onClick={onClose}>Cancel</Button>
                <Button onClick={handleSave}>Save Configuration</Button>
            </div>
        </div>
    </Modal>
  );
};

export default FinaleSetupModal;

import React from 'react';
import Modal from './Modal';
import POImportPanel from './POImportPanel';

interface POImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onImportComplete?: () => void;
}

const POImportModal: React.FC<POImportModalProps> = ({
  isOpen,
  onClose,
  addToast,
  onImportComplete,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Import Purchase Orders"
      subtitle="Import POs from CSV files or directly from Finale API"
      size="large"
    >
      <POImportPanel
        addToast={addToast}
        onImportComplete={onImportComplete}
      />
    </Modal>
  );
};

export default POImportModal;
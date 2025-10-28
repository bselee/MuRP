import React, { useState, useEffect } from 'react';
import type { BillOfMaterials, BOMComponent, Artwork, Packaging } from '../types';
import Modal from './Modal';
import { TrashIcon, PlusCircleIcon } from './icons';

interface BomEditModalProps {
  bom: BillOfMaterials;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedBom: BillOfMaterials) => void;
}

const BomEditModal: React.FC<BomEditModalProps> = ({ bom, isOpen, onClose, onSave }) => {
  const [editedBom, setEditedBom] = useState<BillOfMaterials>(bom);

  useEffect(() => {
    // Reset state when the modal is opened with a new BOM
    setEditedBom(JSON.parse(JSON.stringify(bom))); // Deep copy
  }, [bom, isOpen]);

  const handleFieldChange = (field: keyof BillOfMaterials, value: any) => {
    setEditedBom(prev => ({ ...prev, [field]: value }));
  };

  const handlePackagingChange = (field: keyof Packaging, value: string) => {
    setEditedBom(prev => ({
        ...prev,
        packaging: { ...prev.packaging, [field]: value }
    }));
  };

  const handleArtworkChange = (index: number, field: keyof Artwork, value: string | number) => {
    const newArtwork = [...editedBom.artwork];
    (newArtwork[index] as any)[field] = value;
    handleFieldChange('artwork', newArtwork);
  };

  const addArtwork = () => {
    const newArtwork: Artwork = {
        id: `art-${Date.now()}`,
        fileName: 'new-file-name-WxH.pdf',
        revision: 1,
        url: '/art/new-file.pdf'
    };
    handleFieldChange('artwork', [...editedBom.artwork, newArtwork]);
  };

  const removeArtwork = (index: number) => {
    const newArtwork = editedBom.artwork.filter((_, i) => i !== index);
    handleFieldChange('artwork', newArtwork);
  };
  
  const handleSaveChanges = () => {
    onSave(editedBom);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Edit BOM: ${bom.name}`}>
      <div className="space-y-6">
        {/* Components Section - Read Only for now */}
        <div>
          <h3 className="text-lg font-medium text-gray-200 mb-2">Components</h3>
          <ul className="space-y-2 max-h-48 overflow-y-auto p-2 bg-gray-900/50 rounded-md">
            {editedBom.components.map(c => (
              <li key={c.sku} className="flex justify-between items-center p-2 bg-gray-800 rounded">
                <span className="text-sm text-gray-300">{c.name} ({c.sku})</span>
                <span className="text-sm font-semibold text-white">Qty: {c.quantity}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Artwork Section */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-lg font-medium text-gray-200">Artwork</h3>
            <button onClick={addArtwork} className="flex items-center gap-1 text-sm text-indigo-400 hover:text-indigo-300">
                <PlusCircleIcon className="w-5 h-5" /> Add Artwork
            </button>
          </div>
          <div className="space-y-3">
            {editedBom.artwork.map((art, index) => (
              <div key={art.id} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center p-2 bg-gray-900/50 rounded-md">
                <div>
                    <label className="text-xs text-gray-400">File Name</label>
                    <input type="text" value={art.fileName} onChange={e => handleArtworkChange(index, 'fileName', e.target.value)} className="w-full bg-gray-700 p-1.5 rounded-md text-sm" />
                </div>
                 <div>
                    <label className="text-xs text-gray-400">Revision</label>
                    <input type="number" value={art.revision} onChange={e => handleArtworkChange(index, 'revision', parseInt(e.target.value) || 1)} className="w-full bg-gray-700 p-1.5 rounded-md text-sm" />
                </div>
                <div className="flex items-end h-full">
                    <button onClick={() => removeArtwork(index)} className="p-2 text-red-500 hover:text-red-400">
                        <TrashIcon className="w-5 h-5"/>
                    </button>
                </div>
              </div>  
            ))}
          </div>
        </div>

        {/* Packaging Section */}
        <div>
          <h3 className="text-lg font-medium text-gray-200 mb-2">Packaging Specifications</h3>
          <div className="space-y-4 p-4 bg-gray-900/50 rounded-md">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div>
                    <label className="text-sm text-gray-400">Bag Type</label>
                    <input type="text" value={editedBom.packaging.bagType} onChange={e => handlePackagingChange('bagType', e.target.value)} className="w-full bg-gray-700 p-2 rounded-md text-sm mt-1" />
                </div>
                <div>
                    <label className="text-sm text-gray-400">Label Type</label>
                    <input type="text" value={editedBom.packaging.labelType} onChange={e => handlePackagingChange('labelType', e.target.value)} className="w-full bg-gray-700 p-2 rounded-md text-sm mt-1" />
                </div>
            </div>
            <div>
                 <label className="text-sm text-gray-400">Special Instructions</label>
                 <textarea value={editedBom.packaging.specialInstructions} onChange={e => handlePackagingChange('specialInstructions', e.target.value)} rows={3} className="w-full bg-gray-700 p-2 rounded-md text-sm mt-1"></textarea>
            </div>
          </div>
        </div>
        
        <div className="flex justify-end pt-4 border-t border-gray-700">
            <button onClick={onClose} className="bg-gray-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition-colors mr-3">Cancel</button>
            <button onClick={handleSaveChanges} className="bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors">Save Changes</button>
        </div>
      </div>
    </Modal>
  );
};

export default BomEditModal;

import React, { useState } from 'react';
import type { BillOfMaterials, User } from '../types';
import { PencilIcon } from '../components/icons';
import BomEditModal from '../components/BomEditModal';

interface BOMsProps {
  boms: BillOfMaterials[];
  currentUser: User;
  onUpdateBom: (updatedBom: BillOfMaterials) => void;
  onNavigateToArtwork: (filter: string) => void;
}

const BOMs: React.FC<BOMsProps> = ({ boms, currentUser, onUpdateBom, onNavigateToArtwork }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedBom, setSelectedBom] = useState<BillOfMaterials | null>(null);

  const canEdit = currentUser.role === 'Admin';

  const handleEditClick = (bom: BillOfMaterials) => {
    setSelectedBom(bom);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedBom(null);
  };

  const manufacturedProducts = boms.filter(b => b.finishedSku.startsWith('PROD-'));
  const subAssemblies = boms.filter(b => b.finishedSku.startsWith('SUB-'));

  const BomCard: React.FC<{ bom: BillOfMaterials }> = ({ bom }) => (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg shadow-lg border border-gray-700 overflow-hidden">
      <div className="p-4 bg-gray-800 flex justify-between items-center">
        <div>
          <h3 className="font-semibold text-white">{bom.name}</h3>
          <p className="text-sm text-gray-400">{bom.finishedSku}</p>
        </div>
        {canEdit && (
          <button onClick={() => handleEditClick(bom)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-1.5 px-3 rounded-md transition-colors">
            <PencilIcon className="w-4 h-4" />
            Edit
          </button>
        )}
      </div>
      <div className="p-4 space-y-4">
        <div>
          <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">Components</h4>
          <ul className="space-y-1 text-sm">
            {bom.components.map(c => (
              <li key={c.sku} className="flex justify-between">
                <span className="text-gray-300">{c.name}</span>
                <span className="text-gray-400 font-mono">x{c.quantity}</span>
              </li>
            ))}
          </ul>
        </div>
        {bom.artwork.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">Artwork</h4>
            <ul className="space-y-1 text-sm">
              {bom.artwork.map(art => (
                <li key={art.id} className="flex justify-between">
                  <button onClick={() => onNavigateToArtwork(art.fileName)} className="text-indigo-400 hover:underline text-left truncate">
                    {art.fileName}
                  </button>
                  <span className="text-gray-400 font-mono ml-2">Rev {art.revision}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">Packaging</h4>
          <p className="text-sm text-gray-300">{bom.packaging.bagType} w/ {bom.packaging.labelType}</p>
          <p className="text-xs text-gray-500 mt-1"><i>Instructions: {bom.packaging.specialInstructions}</i></p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-white tracking-tight">Bills of Materials (BOMs)</h1>
        <p className="text-gray-400 mt-1">Manage the recipes and specifications for all manufactured items.</p>
      </header>
      
      {!canEdit && (
        <div className="bg-yellow-900/50 border border-yellow-700 text-yellow-300 text-sm rounded-lg p-4">
            You do not have permission to edit Bills of Materials. This action is restricted to Administrators.
        </div>
      )}

      <section>
        <h2 className="text-xl font-semibold mb-4 text-gray-300">Finished Goods</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {manufacturedProducts.map(bom => <BomCard key={bom.id} bom={bom} />)}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4 text-gray-300">Sub-Assemblies</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {subAssemblies.map(bom => <BomCard key={bom.id} bom={bom} />)}
        </div>
      </section>
      
      {selectedBom && (
        <BomEditModal 
            isOpen={isModalOpen}
            onClose={handleCloseModal}
            bom={selectedBom}
            onSave={onUpdateBom}
        />
      )}
    </div>
  );
};

export default BOMs;

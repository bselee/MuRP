import React, { useState, useEffect, useMemo } from 'react';
import type { BillOfMaterials, BOMComponent, Artwork, Packaging, InventoryItem } from '../types';
import Modal from './Modal';
import { TrashIcon, PlusCircleIcon, MagnifyingGlassIcon, XCircleIcon, ExclamationTriangleIcon, ArrowDownTrayIcon, ArrowUpTrayIcon } from './icons';

interface BomEditModalProps {
  bom: BillOfMaterials;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedBom: BillOfMaterials) => void;
  inventory?: InventoryItem[];
}

const BomEditModal: React.FC<BomEditModalProps> = ({ bom, isOpen, onClose, onSave, inventory = [] }) => {
  const [editedBom, setEditedBom] = useState<BillOfMaterials>(bom);
  const [componentSearchQuery, setComponentSearchQuery] = useState('');
  const [showAddComponent, setShowAddComponent] = useState(false);
  const [selectedInventoryItem, setSelectedInventoryItem] = useState<InventoryItem | null>(null);
  const [newComponentQuantity, setNewComponentQuantity] = useState<number>(1);
  const [newComponentUnit, setNewComponentUnit] = useState<string>('lbs');
  const [duplicateWarning, setDuplicateWarning] = useState<string>('');

  useEffect(() => {
    // Reset state when the modal is opened with a new BOM
    setEditedBom(JSON.parse(JSON.stringify(bom))); // Deep copy
    setComponentSearchQuery('');
    setShowAddComponent(false);
    setSelectedInventoryItem(null);
    setNewComponentQuantity(1);
    setNewComponentUnit('lbs');
    setDuplicateWarning('');
  }, [bom, isOpen]);

  // Show all inventory items (don't exclude already-used ones)
  const availableInventory = useMemo(() => {
    return inventory;
  }, [inventory]);

  // Search filtered inventory
  const filteredInventory = useMemo(() => {
    if (!componentSearchQuery.trim()) return availableInventory;
    const query = componentSearchQuery.toLowerCase();
    return availableInventory.filter(item =>
      item.sku.toLowerCase().includes(query) ||
      item.name.toLowerCase().includes(query) ||
      item.category?.toLowerCase().includes(query)
    );
  }, [availableInventory, componentSearchQuery]);

  const handleFieldChange = (field: keyof BillOfMaterials, value: any) => {
    setEditedBom(prev => ({ ...prev, [field]: value }));
  };

  const handlePackagingChange = (field: keyof Packaging, value: string) => {
    setEditedBom(prev => ({
        ...prev,
        packaging: { ...prev.packaging, [field]: value }
    }));
  };

  const handleComponentChange = (index: number, field: keyof BOMComponent, value: any) => {
    const newComponents = [...editedBom.components];
    (newComponents[index] as any)[field] = value;
    handleFieldChange('components', newComponents);
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
        url: '/art/new-file.pdf',
        verified: false,
        fileType: 'artwork',
        uploadedAt: new Date().toISOString(),
    };
    handleFieldChange('artwork', [...editedBom.artwork, newArtwork]);
  };

  const removeArtwork = (index: number) => {
    const newArtwork = editedBom.artwork.filter((_, i) => i !== index);
    handleFieldChange('artwork', newArtwork);
  };

  const addComponent = () => {
    if (!selectedInventoryItem) return;

    // Check if component already exists in BOM
    const existingComponent = editedBom.components.find(c => c.sku === selectedInventoryItem.sku);
    if (existingComponent) {
      setDuplicateWarning(`${selectedInventoryItem.sku} is already in this BOM. Please adjust quantities in the table above instead.`);
      return;
    }

    const newComponent: BOMComponent = {
      id: `comp-${Date.now()}`,
      sku: selectedInventoryItem.sku,
      name: selectedInventoryItem.name,
      quantity: newComponentQuantity,
      unit: newComponentUnit
    };

    handleFieldChange('components', [...editedBom.components, newComponent]);
    setShowAddComponent(false);
    setSelectedInventoryItem(null);
    setComponentSearchQuery('');
    setNewComponentQuantity(1);
    setNewComponentUnit('lbs');
    setDuplicateWarning('');
  };

  const removeComponent = (index: number) => {
    const newComponents = editedBom.components.filter((_, i) => i !== index);
    handleFieldChange('components', newComponents);
  };

  const handleSaveChanges = () => {
    onSave(editedBom);
    onClose();
  };

  // Export BOM to CSV
  const exportToCSV = () => {
    const headers = ['SKU', 'Component Name', 'Quantity', 'Unit'];
    const rows = editedBom.components.map(c => [c.sku, c.name, c.quantity, c.unit]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `BOM_${bom.finishedSku}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Download CSV Template
  const downloadTemplate = () => {
    const headers = ['SKU', 'Component Name', 'Quantity', 'Unit'];
    const exampleRows = [
      ['SKU-001', 'Example Component 1', '10', 'lbs'],
      ['SKU-002', 'Example Component 2', '5.5', 'kg'],
      ['SKU-003', 'Example Component 3', '2', 'gal']
    ];

    const csvContent = [
      headers.join(','),
      ...exampleRows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `BOM_Template.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Import from CSV
  const handleImportCSV = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim());

      // Skip header row
      const dataLines = lines.slice(1);

      const importedComponents: BOMComponent[] = [];
      const errors: string[] = [];

      dataLines.forEach((line, index) => {
        // Parse CSV line (handle quoted fields)
        const matches = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g);
        if (!matches || matches.length < 4) {
          errors.push(`Row ${index + 2}: Invalid format`);
          return;
        }

        const [sku, name, quantity, unit] = matches.map(m => m.replace(/^"|"$/g, '').trim());

        if (!sku || !name || !quantity || !unit) {
          errors.push(`Row ${index + 2}: Missing required fields`);
          return;
        }

        const quantityNum = parseFloat(quantity);
        if (isNaN(quantityNum) || quantityNum <= 0) {
          errors.push(`Row ${index + 2}: Invalid quantity`);
          return;
        }

        importedComponents.push({
          id: `comp-${Date.now()}-${index}`,
          sku,
          name,
          quantity: quantityNum,
          unit
        });
      });

      if (errors.length > 0) {
        alert(`Import completed with errors:\n${errors.join('\n')}`);
      }

      if (importedComponents.length > 0) {
        // Replace existing components
        handleFieldChange('components', importedComponents);
      }
    };

    reader.readAsText(file);
    // Reset input
    event.target.value = '';
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Edit BOM: ${bom.name}`} size="large">
      <div className="space-y-6">
        {/* Basic Info Section */}
        <div className="bg-gray-900/30 rounded-lg p-4 border border-gray-700">
          <h3 className="text-lg font-medium text-gray-200 mb-4">Basic Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-400 block mb-2">Product Name</label>
              <input
                type="text"
                value={editedBom.name}
                onChange={e => handleFieldChange('name', e.target.value)}
                className="w-full bg-gray-700 p-2.5 rounded-md text-sm text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-sm text-gray-400 block mb-2">Yield Quantity</label>
              <input
                type="number"
                value={editedBom.yieldQuantity || 1}
                onChange={e => handleFieldChange('yieldQuantity', parseInt(e.target.value) || 1)}
                className="w-full bg-gray-700 p-2.5 rounded-md text-sm text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                min="1"
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="text-sm text-gray-400 block mb-2">Description</label>
            <textarea
              value={editedBom.description || ''}
              onChange={e => handleFieldChange('description', e.target.value)}
              rows={3}
              className="w-full bg-gray-700 p-2.5 rounded-md text-sm text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Product description..."
            />
          </div>
        </div>

        {/* Components Section - MRP Style */}
        <div className="bg-gray-900/30 rounded-lg p-4 border border-gray-700">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-4">
            <div>
              <h3 className="text-lg font-medium text-gray-200">Bill of Materials</h3>
              <p className="text-xs text-gray-500 mt-1">Components required to manufacture this product</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {/* Import/Export Buttons */}
              <button
                onClick={downloadTemplate}
                className="flex items-center gap-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white text-xs font-semibold rounded-lg transition-colors"
                title="Download BOM template"
              >
                <ArrowDownTrayIcon className="w-4 h-4" />
                Template
              </button>
              <button
                onClick={exportToCSV}
                className="flex items-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors"
                title="Export BOM to CSV"
              >
                <ArrowDownTrayIcon className="w-4 h-4" />
                Export CSV
              </button>
              <label className="flex items-center gap-1 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                title="Import BOM from CSV">
                <ArrowUpTrayIcon className="w-4 h-4" />
                Import CSV
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleImportCSV}
                  className="hidden"
                />
              </label>
              <button
                onClick={() => setShowAddComponent(!showAddComponent)}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                <PlusCircleIcon className="w-5 h-5" />
                Add Component
              </button>
            </div>
          </div>

          {/* Add Component Panel */}
          {showAddComponent && (
            <div className="mb-4 p-4 bg-gray-800/50 border border-gray-600 rounded-lg">
              <h4 className="text-sm font-semibold text-white mb-3">Select Component from Inventory</h4>

              {/* Search Bar */}
              <div className="relative mb-3">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search inventory by SKU or name..."
                  value={componentSearchQuery}
                  onChange={(e) => setComponentSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  autoFocus
                />
              </div>

              {/* Inventory Selection List */}
              <div className="max-h-48 overflow-y-auto mb-3 border border-gray-600 rounded-md">
                {filteredInventory.length === 0 ? (
                  <div className="p-4 text-center text-gray-500 text-sm">
                    {componentSearchQuery ? 'No matching inventory items found' : 'No available inventory items'}
                  </div>
                ) : (
                  filteredInventory.map(item => (
                    <button
                      key={item.sku}
                      onClick={() => setSelectedInventoryItem(item)}
                      className={`w-full text-left p-3 border-b border-gray-700 hover:bg-gray-700/50 transition-colors ${
                        selectedInventoryItem?.sku === item.sku ? 'bg-indigo-900/30 border-l-4 border-l-indigo-500' : ''
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="font-mono text-sm font-semibold text-indigo-400">{item.sku}</div>
                          <div className="text-sm text-gray-300 mt-0.5">{item.name}</div>
                          {item.category && (
                            <div className="text-xs text-gray-500 mt-1">{item.category}</div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-gray-500">In Stock</div>
                          <div className={`text-sm font-semibold ${item.stock > 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {item.stock}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>

              {/* Quantity and Unit Selection */}
              {selectedInventoryItem && (
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Quantity</label>
                    <input
                      type="number"
                      value={newComponentQuantity}
                      onChange={(e) => setNewComponentQuantity(parseFloat(e.target.value) || 0)}
                      className="w-full bg-gray-700 p-2 rounded-md text-sm text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Unit</label>
                    <select
                      value={newComponentUnit}
                      onChange={(e) => setNewComponentUnit(e.target.value)}
                      className="w-full bg-gray-700 p-2 rounded-md text-sm text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="lbs">lbs</option>
                      <option value="kg">kg</option>
                      <option value="oz">oz</option>
                      <option value="g">g</option>
                      <option value="gal">gal</option>
                      <option value="L">L</option>
                      <option value="units">units</option>
                      <option value="each">each</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Duplicate Warning */}
              {duplicateWarning && (
                <div className="mb-3 p-3 bg-yellow-900/20 border border-yellow-700 rounded-md">
                  <div className="flex items-start gap-2">
                    <ExclamationTriangleIcon className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-yellow-300">{duplicateWarning}</p>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={addComponent}
                  disabled={!selectedInventoryItem || newComponentQuantity <= 0}
                  className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-md transition-colors"
                >
                  Add to BOM
                </button>
                <button
                  onClick={() => {
                    setShowAddComponent(false);
                    setSelectedInventoryItem(null);
                    setComponentSearchQuery('');
                    setDuplicateWarning('');
                  }}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white text-sm font-semibold rounded-md transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Components Table */}
          {editedBom.components.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p className="text-sm">No components added yet</p>
              <p className="text-xs mt-1">Click "Add Component" to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-700">
                <thead className="bg-gray-800/50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      SKU
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Component Name
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Quantity
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Unit
                    </th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {editedBom.components.map((component, index) => (
                    <tr key={component.id || index} className="hover:bg-gray-800/30 transition-colors">
                      <td className="px-4 py-1 whitespace-nowrap">
                        <span className="text-sm font-mono text-indigo-400 font-semibold">{component.sku}</span>
                      </td>
                      <td className="px-4 py-1">
                        <span className="text-sm text-gray-300">{component.name}</span>
                      </td>
                      <td className="px-4 py-1 text-right">
                        <input
                          type="number"
                          value={component.quantity}
                          onChange={e => handleComponentChange(index, 'quantity', parseFloat(e.target.value) || 0)}
                          className="w-24 bg-gray-700 px-2 py-1 rounded text-sm text-white text-right border border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          min="0"
                          step="0.01"
                        />
                      </td>
                      <td className="px-4 py-1">
                        <select
                          value={component.unit}
                          onChange={e => handleComponentChange(index, 'unit', e.target.value)}
                          className="bg-gray-700 px-2 py-1 rounded text-sm text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="lbs">lbs</option>
                          <option value="kg">kg</option>
                          <option value="oz">oz</option>
                          <option value="g">g</option>
                          <option value="gal">gal</option>
                          <option value="L">L</option>
                          <option value="units">units</option>
                          <option value="each">each</option>
                        </select>
                      </td>
                      <td className="px-4 py-1 text-center">
                        <button
                          onClick={() => removeComponent(index)}
                          className="p-2 text-red-500 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors"
                          title="Remove component"
                        >
                          <TrashIcon className="w-5 h-5"/>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Artwork Section */}
        <div className="bg-gray-900/30 rounded-lg p-4 border border-gray-700">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-200">Artwork Files</h3>
            <button onClick={addArtwork} className="flex items-center gap-1 text-sm text-indigo-400 hover:text-indigo-300">
                <PlusCircleIcon className="w-5 h-5" /> Add Artwork
            </button>
          </div>
          <div className="space-y-3">
            {editedBom.artwork.map((art, index) => (
              <div key={art.id} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center p-2 bg-gray-800/50 rounded-md border border-gray-700">
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
        <div className="bg-gray-900/30 rounded-lg p-4 border border-gray-700">
          <h3 className="text-lg font-medium text-gray-200 mb-4">Packaging Specifications</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div>
                    <label className="text-sm text-gray-400 block mb-2">Bag Type</label>
                    <input type="text" value={editedBom.packaging.bagType} onChange={e => handlePackagingChange('bagType', e.target.value)} className="w-full bg-gray-700 p-2.5 rounded-md text-sm border border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                    <label className="text-sm text-gray-400 block mb-2">Label Type</label>
                    <input type="text" value={editedBom.packaging.labelType} onChange={e => handlePackagingChange('labelType', e.target.value)} className="w-full bg-gray-700 p-2.5 rounded-md text-sm border border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
            </div>
            <div>
                 <label className="text-sm text-gray-400 block mb-2">Special Instructions</label>
                 <textarea value={editedBom.packaging.specialInstructions} onChange={e => handlePackagingChange('specialInstructions', e.target.value)} rows={3} className="w-full bg-gray-700 p-2.5 rounded-md text-sm border border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"></textarea>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
            <button onClick={onClose} className="px-6 py-2.5 bg-gray-600 text-white font-semibold rounded-md hover:bg-gray-500 transition-colors">Cancel</button>
            <button onClick={handleSaveChanges} className="px-6 py-2.5 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 transition-colors">Save Changes</button>
        </div>
      </div>
    </Modal>
  );
};

export default BomEditModal;

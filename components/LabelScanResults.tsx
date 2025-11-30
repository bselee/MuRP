import Button from '@/components/ui/Button';
// Label Scan Results Component
// Displays AI-extracted data from label scanning with BOM comparison

import React, { useState, useEffect } from 'react';
import type { Artwork, BillOfMaterials } from '../types';
import { compareIngredientsWithBOM } from '../services/labelScanningService';
import { CheckCircleIcon, ExclamationCircleIcon, XCircleIcon, PencilSquareIcon, TrashIcon, PlusCircleIcon } from './icons';
import Barcode from './Barcode';

interface LabelScanResultsProps {
  artwork: Artwork;
  bom?: BillOfMaterials; // Optional: for comparison
  onVerify?: (artworkId: string) => void;
  onRescan?: (artworkId: string) => void;
  onSave?: (artworkId: string, updatedData: Artwork['extractedData']) => void;
}

const LabelScanResults: React.FC<LabelScanResultsProps> = ({
  artwork,
  bom,
  onVerify,
  onRescan,
  onSave
}) => {
  const [showComparison, setShowComparison] = useState(true);
  const [comparison, setComparison] = useState<Artwork['ingredientComparison']>();
  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState<Artwork['extractedData']>(artwork.extractedData);

  const extractedData = isEditing ? editedData : artwork.extractedData;

  // Sync edited data when artwork changes
  useEffect(() => {
    setEditedData(artwork.extractedData);
  }, [artwork.extractedData]);

  // Calculate comparison if BOM available and ingredients extracted
  useEffect(() => {
    if (bom && extractedData?.ingredients && extractedData.ingredients.length > 0) {
      const result = compareIngredientsWithBOM(extractedData.ingredients, bom.components);
      setComparison(result);
    }
  }, [bom, extractedData?.ingredients]);

  const handleSave = () => {
    if (onSave && editedData) {
      onSave(artwork.id, editedData);
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setEditedData(artwork.extractedData);
    setIsEditing(false);
  };

  const handleAddIngredient = () => {
    if (!editedData) return;
    const newIngredient = {
      name: '',
      percentage: '',
      order: (editedData.ingredients?.length || 0) + 1,
      confidence: 1.0
    };
    setEditedData({
      ...editedData,
      ingredients: [...(editedData.ingredients || []), newIngredient]
    });
  };

  const handleRemoveIngredient = (index: number) => {
    if (!editedData?.ingredients) return;
    const newIngredients = editedData.ingredients.filter((_, i) => i !== index);
    setEditedData({
      ...editedData,
      ingredients: newIngredients
    });
  };

  const handleIngredientChange = (index: number, field: string, value: any) => {
    if (!editedData?.ingredients) return;
    const newIngredients = [...editedData.ingredients];
    (newIngredients[index] as any)[field] = value;
    setEditedData({
      ...editedData,
      ingredients: newIngredients
    });
  };

  if (!extractedData) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <div className="text-center py-8">
          <ExclamationCircleIcon className="w-12 h-12 text-gray-500 mx-auto mb-3" />
          <p className="text-gray-400">No scan data available</p>
          {artwork.scanStatus === 'failed' && (
            <p className="text-sm text-red-400 mt-2">{artwork.scanError}</p>
          )}
          {onRescan && (
            <Button
              onClick={() => onRescan(artwork.id)}
              className="mt-4 bg-accent-500 text-white px-4 py-2 rounded-md hover:bg-accent-600 transition-colors"
            >
              Retry Scan
            </Button>
          )}
        </div>
      </div>
    );
  }

  const hasIssues = (comparison?.missingFromLabel?.length ?? 0) > 0 ||
                    (comparison?.missingFromBOM?.length ?? 0) > 0 ||
                    !comparison?.orderMatches;

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-gradient-to-r from-accent-800/30 to-purple-800/30 rounded-lg p-6 border border-accent-600">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <CheckCircleIcon className="w-8 h-8 text-green-400" />
              <h2 className="text-2xl font-bold text-white">
                Label Scan Results
              </h2>
            </div>
            <p className="text-gray-300">
              AI-extracted data from <span className="font-semibold text-accent-300">{artwork.fileName}</span>
            </p>
            {artwork.scanCompletedAt && (
              <p className="text-sm text-gray-400 mt-1">
                Scanned on {new Date(artwork.scanCompletedAt).toLocaleString()}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            {isEditing ? (
              <>
                <Button
                  onClick={handleCancel}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-md transition-colors font-semibold"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors font-semibold"
                >
                  Save Changes
                </Button>
              </>
            ) : (
              <>
                {artwork.verified ? (
                  <div className="flex items-center gap-2 bg-green-900/30 px-4 py-2 rounded-lg border border-green-700">
                    <CheckCircleIcon className="w-5 h-5 text-green-400" />
                    <span className="text-sm font-semibold text-green-300">Verified</span>
                  </div>
                ) : (
                  onVerify && (
                    <Button
                      onClick={() => onVerify(artwork.id)}
                      className="bg-accent-500 text-white px-4 py-2 rounded-md hover:bg-accent-600 transition-colors font-semibold"
                    >
                      Mark as Verified
                    </Button>
                  )
                )}
                {onSave && (
                  <Button
                    onClick={() => setIsEditing(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-colors font-semibold"
                  >
                    <PencilSquareIcon className="w-5 h-5" />
                    Edit
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Product Info */}
      {(extractedData?.productName || extractedData?.netWeight || extractedData?.barcode || isEditing) && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Product Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-gray-400 mb-2">Product Name</p>
              {isEditing ? (
                <input
                  type="text"
                  value={editedData?.productName || ''}
                  onChange={(e) => setEditedData({ ...editedData, productName: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-accent-500"
                  placeholder="Product name..."
                />
              ) : (
                <p className="text-white font-semibold">{extractedData?.productName || '-'}</p>
              )}
            </div>
            <div>
              <p className="text-sm text-gray-400 mb-2">Net Weight</p>
              {isEditing ? (
                <input
                  type="text"
                  value={editedData?.netWeight || ''}
                  onChange={(e) => setEditedData({ ...editedData, netWeight: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-accent-500"
                  placeholder="e.g., 50 lbs"
                />
              ) : (
                <p className="text-white font-semibold">{extractedData?.netWeight || '-'}</p>
              )}
            </div>
            <div>
              <p className="text-sm text-gray-400 mb-2">Barcode</p>
              {isEditing ? (
                <input
                  type="text"
                  value={editedData?.barcode || ''}
                  onChange={(e) => setEditedData({ ...editedData, barcode: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white font-mono focus:outline-none focus:ring-2 focus:ring-accent-500"
                  placeholder="e.g., 012345678901"
                />
              ) : (
                <>
                  <p className="text-white font-mono font-semibold mb-2">{extractedData?.barcode || '-'}</p>
                  {extractedData?.barcode && (
                    <div className="mt-3 p-3 bg-white rounded inline-block">
                      <Barcode value={extractedData.barcode} width={2} height={60} displayValue={false} />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          {extractedData?.barcode && !isEditing && (
            <div className="mt-4 pt-4 border-t border-gray-700">
              <p className="text-xs text-gray-400 mb-2">Visual Barcode:</p>
              <div className="flex justify-center p-4 bg-white rounded-lg">
                <Barcode value={extractedData.barcode} width={3} height={100} displayValue={true} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Ingredients */}
      {(extractedData?.ingredients && extractedData.ingredients.length > 0) || isEditing && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">
              Ingredients ({extractedData?.ingredients?.length || 0})
            </h3>
            <div className="flex items-center gap-3">
              {isEditing && (
                <Button
                  onClick={handleAddIngredient}
                  className="flex items-center gap-2 px-3 py-1 bg-accent-500 hover:bg-accent-600 text-white text-sm rounded transition-colors"
                >
                  <PlusCircleIcon className="w-4 h-4" />
                  Add Ingredient
                </Button>
              )}
              {bom && !isEditing && (
                <Button
                  onClick={() => setShowComparison(!showComparison)}
                  className="text-sm text-accent-400 hover:text-accent-300"
                >
                  {showComparison ? 'Hide' : 'Show'} BOM Comparison
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            {extractedData?.ingredients?.map((ing, idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 p-3 bg-gray-900/50 rounded-md border border-gray-700"
              >
                {isEditing ? (
                  <>
                    <input
                      type="number"
                      value={ing.order}
                      onChange={(e) => handleIngredientChange(idx, 'order', parseInt(e.target.value) || 1)}
                      className="w-16 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent-500"
                      min="1"
                    />
                    <input
                      type="text"
                      value={ing.name}
                      onChange={(e) => handleIngredientChange(idx, 'name', e.target.value)}
                      className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-1 text-white focus:outline-none focus:ring-2 focus:ring-accent-500"
                      placeholder="Ingredient name..."
                    />
                    <input
                      type="text"
                      value={ing.percentage || ''}
                      onChange={(e) => handleIngredientChange(idx, 'percentage', e.target.value)}
                      className="w-24 bg-gray-700 border border-gray-600 rounded px-3 py-1 text-accent-400 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-accent-500"
                      placeholder="%"
                    />
                    <Button
                      onClick={() => handleRemoveIngredient(idx)}
                      className="p-2 text-red-400 hover:bg-red-900/20 rounded transition-colors"
                      title="Remove ingredient"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="text-gray-400 font-mono text-sm w-8">{ing.order}.</span>
                    <span className="text-white font-medium flex-1">{ing.name}</span>
                    {ing.percentage && (
                      <span className="text-accent-400 text-sm font-semibold w-24 text-right">{ing.percentage}</span>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">
                        {Math.round(ing.confidence * 100)}%
                      </span>
                      {ing.confidence > 0.85 ? (
                        <CheckCircleIcon className="w-4 h-4 text-green-400" />
                      ) : (
                        <ExclamationCircleIcon className="w-4 h-4 text-yellow-500" />
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* BOM Comparison */}
      {showComparison && comparison && bom && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-start gap-3 mb-4">
            {hasIssues ? (
              <ExclamationCircleIcon className="w-6 h-6 text-yellow-500 flex-shrink-0" />
            ) : (
              <CheckCircleIcon className="w-6 h-6 text-green-400 flex-shrink-0" />
            )}
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-white mb-1">BOM Comparison</h3>
              <p className="text-sm text-gray-400">
                Comparing label ingredients with BOM formula
              </p>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="bg-green-900/20 border border-green-700 rounded-lg p-3">
              <p className="text-sm text-gray-400">Matched</p>
              <p className="text-2xl font-bold text-green-400">{comparison.matchedIngredients}</p>
            </div>
            <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-3">
              <p className="text-sm text-gray-400">Missing from Label</p>
              <p className="text-2xl font-bold text-yellow-400">{comparison.missingFromLabel.length}</p>
            </div>
            <div className="bg-red-900/20 border border-red-700 rounded-lg p-3">
              <p className="text-sm text-gray-400">Missing from BOM</p>
              <p className="text-2xl font-bold text-red-400">{comparison.missingFromBOM.length}</p>
            </div>
          </div>

          {/* Order Check */}
          <div className={`p-4 rounded-lg border mb-4 ${
            comparison.orderMatches
              ? 'bg-green-900/20 border-green-700'
              : 'bg-yellow-900/20 border-yellow-700'
          }`}>
            <div className="flex items-center gap-2">
              {comparison.orderMatches ? (
                <>
                  <CheckCircleIcon className="w-5 h-5 text-green-400" />
                  <span className="text-sm font-semibold text-green-300">
                    Ingredient order matches (top 5 ingredients)
                  </span>
                </>
              ) : (
                <>
                  <ExclamationCircleIcon className="w-5 h-5 text-yellow-500" />
                  <span className="text-sm font-semibold text-yellow-300">
                    Ingredient order doesn't match - verify order is correct
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Missing from Label */}
          {comparison.missingFromLabel.length > 0 && (
            <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-2 mb-2">
                <ExclamationCircleIcon className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-yellow-300">
                    In BOM but not on label ({comparison.missingFromLabel.length})
                  </p>
                  <p className="text-xs text-gray-400 mt-1">These ingredients are in your BOM but weren't found on the label</p>
                </div>
              </div>
              <ul className="space-y-1 ml-7">
                {comparison.missingFromLabel.map((ing, idx) => (
                  <li key={idx} className="text-sm text-yellow-200">• {ing}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Missing from BOM */}
          {comparison.missingFromBOM.length > 0 && (
            <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
              <div className="flex items-start gap-2 mb-2">
                <XCircleIcon className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-red-300">
                    On label but not in BOM ({comparison.missingFromBOM.length})
                  </p>
                  <p className="text-xs text-gray-400 mt-1">These ingredients are on the label but not in your BOM</p>
                </div>
              </div>
              <ul className="space-y-1 ml-7">
                {comparison.missingFromBOM.map((ing, idx) => (
                  <li key={idx} className="text-sm text-red-200">• {ing}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Guaranteed Analysis */}
      {extractedData.guaranteedAnalysis && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Guaranteed Analysis</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {extractedData.guaranteedAnalysis.nitrogen && (
              <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4 text-center">
                <p className="text-sm text-gray-400 mb-1">Nitrogen (N)</p>
                <p className="text-3xl font-bold text-blue-300">
                  {extractedData.guaranteedAnalysis.nitrogen}
                </p>
              </div>
            )}
            {extractedData.guaranteedAnalysis.phosphate && (
              <div className="bg-purple-900/20 border border-purple-700 rounded-lg p-4 text-center">
                <p className="text-sm text-gray-400 mb-1">Phosphate (P₂O₅)</p>
                <p className="text-3xl font-bold text-purple-300">
                  {extractedData.guaranteedAnalysis.phosphate}
                </p>
              </div>
            )}
            {extractedData.guaranteedAnalysis.potassium && (
              <div className="bg-green-900/20 border border-green-700 rounded-lg p-4 text-center">
                <p className="text-sm text-gray-400 mb-1">Potassium (K₂O)</p>
                <p className="text-3xl font-bold text-green-300">
                  {extractedData.guaranteedAnalysis.potassium}
                </p>
              </div>
            )}
            {extractedData.guaranteedAnalysis.otherNutrients &&
              Object.keys(extractedData.guaranteedAnalysis.otherNutrients).length > 0 && (
              <div className="bg-orange-900/20 border border-orange-700 rounded-lg p-4 text-center">
                <p className="text-sm text-gray-400 mb-1">Other Nutrients</p>
                <p className="text-2xl font-bold text-orange-300">
                  {Object.keys(extractedData.guaranteedAnalysis.otherNutrients).length}
                </p>
              </div>
            )}
          </div>

          {/* Other Nutrients Details */}
          {extractedData.guaranteedAnalysis.otherNutrients &&
            Object.keys(extractedData.guaranteedAnalysis.otherNutrients).length > 0 && (
            <div className="mt-4 p-4 bg-gray-900/50 rounded-lg">
              <p className="text-sm font-semibold text-gray-300 mb-2">Micronutrients:</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(extractedData.guaranteedAnalysis.otherNutrients).map(([name, value]) => (
                  <div key={name} className="flex justify-between items-center">
                    <span className="text-sm text-gray-400">{name}:</span>
                    <span className="text-sm font-semibold text-orange-300">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Claims & Certifications */}
      {extractedData.claims && extractedData.claims.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Claims & Certifications</h3>
          <div className="flex flex-wrap gap-2">
            {extractedData.claims.map((claim, idx) => (
              <span
                key={idx}
                className="bg-green-900/30 border border-green-700 text-green-300 px-4 py-2 rounded-full text-sm font-semibold"
              >
                ✓ {claim}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Warnings */}
      {extractedData.warnings && extractedData.warnings.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <ExclamationCircleIcon className="w-5 h-5 text-yellow-500" />
            Warnings
          </h3>
          <ul className="space-y-2">
            {extractedData.warnings.map((warning, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-gray-300">
                <span className="text-yellow-500">⚠</span>
                <span>{warning}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Directions */}
      {extractedData.directions && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Directions for Use</h3>
          <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-line">
            {extractedData.directions}
          </p>
        </div>
      )}

      {/* Other Text */}
      {extractedData.otherText && extractedData.otherText.length > 0 && (
        <details className="bg-gray-800 rounded-lg border border-gray-700">
          <summary className="p-4 cursor-pointer text-sm font-semibold text-gray-300 hover:text-white">
            Other Extracted Text ({extractedData.otherText.length} items)
          </summary>
          <div className="px-4 pb-4 space-y-2">
            {extractedData.otherText.map((text, idx) => (
              <p key={idx} className="text-xs text-gray-400 p-2 bg-gray-900/50 rounded">
                {text}
              </p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
};

export default LabelScanResults;

// Label Scan Results Component
// Displays AI-extracted data from label scanning with BOM comparison

import React, { useState, useEffect } from 'react';
import type { Artwork, BillOfMaterials } from '../types';
import { compareIngredientsWithBOM } from '../services/labelScanningService';
import { CheckCircleIcon, ExclamationCircleIcon, XCircleIcon } from './icons';

interface LabelScanResultsProps {
  artwork: Artwork;
  bom?: BillOfMaterials; // Optional: for comparison
  onVerify?: (artworkId: string) => void;
  onRescan?: (artworkId: string) => void;
}

const LabelScanResults: React.FC<LabelScanResultsProps> = ({
  artwork,
  bom,
  onVerify,
  onRescan
}) => {
  const [showComparison, setShowComparison] = useState(true);
  const [comparison, setComparison] = useState<Artwork['ingredientComparison']>();

  const extractedData = artwork.extractedData;

  // Calculate comparison if BOM available and ingredients extracted
  useEffect(() => {
    if (bom && extractedData?.ingredients && extractedData.ingredients.length > 0) {
      const result = compareIngredientsWithBOM(extractedData.ingredients, bom.components);
      setComparison(result);
    }
  }, [bom, extractedData?.ingredients]);

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
            <button
              onClick={() => onRescan(artwork.id)}
              className="mt-4 bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors"
            >
              Retry Scan
            </button>
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
      <div className="bg-gradient-to-r from-indigo-900/30 to-purple-900/30 rounded-lg p-6 border border-indigo-700">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <CheckCircleIcon className="w-8 h-8 text-green-400" />
              <h2 className="text-2xl font-bold text-white">
                Label Scan Results
              </h2>
            </div>
            <p className="text-gray-300">
              AI-extracted data from <span className="font-semibold text-indigo-300">{artwork.fileName}</span>
            </p>
            {artwork.scanCompletedAt && (
              <p className="text-sm text-gray-400 mt-1">
                Scanned on {new Date(artwork.scanCompletedAt).toLocaleString()}
              </p>
            )}
          </div>

          {artwork.verified ? (
            <div className="flex items-center gap-2 bg-green-900/30 px-4 py-2 rounded-lg border border-green-700">
              <CheckCircleIcon className="w-5 h-5 text-green-400" />
              <span className="text-sm font-semibold text-green-300">Verified</span>
            </div>
          ) : (
            onVerify && (
              <button
                onClick={() => onVerify(artwork.id)}
                className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors font-semibold"
              >
                Mark as Verified
              </button>
            )
          )}
        </div>
      </div>

      {/* Product Info */}
      {(extractedData.productName || extractedData.netWeight || extractedData.barcode) && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Product Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {extractedData.productName && (
              <div>
                <p className="text-sm text-gray-400">Product Name</p>
                <p className="text-white font-semibold mt-1">{extractedData.productName}</p>
              </div>
            )}
            {extractedData.netWeight && (
              <div>
                <p className="text-sm text-gray-400">Net Weight</p>
                <p className="text-white font-semibold mt-1">{extractedData.netWeight}</p>
              </div>
            )}
            {extractedData.barcode && (
              <div>
                <p className="text-sm text-gray-400">Barcode</p>
                <p className="text-white font-mono font-semibold mt-1">{extractedData.barcode}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ingredients */}
      {extractedData.ingredients && extractedData.ingredients.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">
              Ingredients ({extractedData.ingredients.length})
            </h3>
            {bom && (
              <button
                onClick={() => setShowComparison(!showComparison)}
                className="text-sm text-indigo-400 hover:text-indigo-300"
              >
                {showComparison ? 'Hide' : 'Show'} BOM Comparison
              </button>
            )}
          </div>

          <div className="space-y-2">
            {extractedData.ingredients.map((ing, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 bg-gray-900/50 rounded-md border border-gray-700"
              >
                <div className="flex items-center gap-3">
                  <span className="text-gray-400 font-mono text-sm">{ing.order}.</span>
                  <span className="text-white font-medium">{ing.name}</span>
                  {ing.percentage && (
                    <span className="text-indigo-400 text-sm font-semibold">{ing.percentage}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">
                    {Math.round(ing.confidence * 100)}% confident
                  </span>
                  {ing.confidence > 0.85 ? (
                    <CheckCircleIcon className="w-4 h-4 text-green-400" />
                  ) : (
                    <ExclamationCircleIcon className="w-4 h-4 text-yellow-500" />
                  )}
                </div>
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

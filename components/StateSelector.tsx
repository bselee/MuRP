import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

interface StateRating {
  id: string;
  state_code: string;
  state_name: string;
  strictness_level: 'Very Strict' | 'Strict' | 'Moderate' | 'Lenient' | 'Very Lenient';
  strictness_score: number;
  key_focus_areas: string[];
  registration_required: boolean;
}

interface StateSelectorProps {
  selectedStates: string[];
  onStatesChange: (states: string[]) => void;
  groupByStrictness?: boolean;
  showDetails?: boolean;
  maxSelections?: number;
}

const STRICTNESS_COLORS = {
  'Very Strict': 'bg-red-100 text-red-800 border-red-300',
  'Strict': 'bg-orange-100 text-orange-800 border-orange-300',
  'Moderate': 'bg-yellow-100 text-yellow-800 border-yellow-300',
  'Lenient': 'bg-green-100 text-green-800 border-green-300',
  'Very Lenient': 'bg-blue-100 text-blue-800 border-blue-300',
};

const STRICTNESS_BADGES = {
  'Very Strict': '🔴',
  'Strict': '🟠',
  'Moderate': '🟡',
  'Lenient': '🟢',
  'Very Lenient': '🔵',
};

export default function StateSelector({
  selectedStates,
  onStatesChange,
  groupByStrictness = true,
  showDetails = true,
  maxSelections,
}: StateSelectorProps) {
  const [stateRatings, setStateRatings] = useState<StateRating[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(['Very Strict', 'Strict'])
  );

  useEffect(() => {
    fetchStateRatings();
  }, []);

  const fetchStateRatings = async () => {
    try {
      const { data, error } = await supabase
        .from('state_compliance_ratings')
        .select('*')
        .order('strictness_score', { ascending: false });

      if (error) throw error;
      setStateRatings(data || []);
    } catch (error) {
      console.error('Error fetching state ratings:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleState = (stateCode: string) => {
    if (selectedStates.includes(stateCode)) {
      onStatesChange(selectedStates.filter((s) => s !== stateCode));
    } else {
      if (maxSelections && selectedStates.length >= maxSelections) {
        alert(`Maximum ${maxSelections} states can be selected`);
        return;
      }
      onStatesChange([...selectedStates, stateCode]);
    }
  };

  const toggleGroup = (level: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(level)) {
      newExpanded.delete(level);
    } else {
      newExpanded.add(level);
    }
    setExpandedGroups(newExpanded);
  };

  const selectAllInGroup = (level: string) => {
    const groupStates = stateRatings
      .filter((s) => s.strictness_level === level)
      .map((s) => s.state_code);
    
    const newSelected = new Set([...selectedStates, ...groupStates]);
    onStatesChange(Array.from(newSelected));
  };

  const clearAllInGroup = (level: string) => {
    const groupStates = stateRatings
      .filter((s) => s.strictness_level === level)
      .map((s) => s.state_code);
    
    onStatesChange(selectedStates.filter((s) => !groupStates.includes(s)));
  };

  // Filter states by search term
  const filteredStates = stateRatings.filter(
    (state) =>
      state.state_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      state.state_code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group states by strictness level
  const groupedStates = groupByStrictness
    ? {
        'Very Strict': filteredStates.filter((s) => s.strictness_level === 'Very Strict'),
        Strict: filteredStates.filter((s) => s.strictness_level === 'Strict'),
        Moderate: filteredStates.filter((s) => s.strictness_level === 'Moderate'),
        Lenient: filteredStates.filter((s) => s.strictness_level === 'Lenient'),
        'Very Lenient': filteredStates.filter((s) => s.strictness_level === 'Very Lenient'),
      }
    : { All: filteredStates };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-100">Select Target States</h3>
          <p className="text-sm text-gray-400 mt-1">
            {selectedStates.length} state{selectedStates.length !== 1 ? 's' : ''} selected
            {maxSelections && ` (max ${maxSelections})`}
          </p>
        </div>
        
        {/* Quick Actions */}
        <div className="flex gap-2">
          <button
            onClick={() => onStatesChange(stateRatings.map((s) => s.state_code))}
            className="px-3 py-1 text-sm bg-gray-700 text-gray-200 rounded hover:bg-gray-600"
          >
            Select All
          </button>
          <button
            onClick={() => onStatesChange([])}
            className="px-3 py-1 text-sm bg-gray-700 text-gray-200 rounded hover:bg-gray-600"
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search states..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />

      {/* Strictness Legend */}
      {groupByStrictness && (
        <div className="flex flex-wrap gap-3 p-4 bg-gray-800 rounded-lg border border-gray-700">
          <div className="text-sm font-medium text-gray-300">Strictness Levels:</div>
          {Object.entries(STRICTNESS_BADGES).map(([level, emoji]) => (
            <div key={level} className="flex items-center gap-1.5 text-sm">
              <span>{emoji}</span>
              <span className="text-gray-300">{level}</span>
            </div>
          ))}
        </div>
      )}

      {/* State Groups */}
      <div className="space-y-3">
        {Object.entries(groupedStates).map(([level, states]) => {
          if (states.length === 0) return null;
          
          const isExpanded = expandedGroups.has(level);
          const selectedInGroup = states.filter((s) =>
            selectedStates.includes(s.state_code)
          ).length;

          return (
            <div
              key={level}
              className="border border-gray-700 rounded-lg overflow-hidden bg-gray-800"
            >
              {/* Group Header */}
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-750"
                onClick={() => toggleGroup(level)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{STRICTNESS_BADGES[level as keyof typeof STRICTNESS_BADGES]}</span>
                  <div>
                    <h4 className="font-medium text-gray-100">
                      {level}
                      <span className="ml-2 text-sm font-normal text-gray-400">
                        ({states.length} state{states.length !== 1 ? 's' : ''})
                      </span>
                    </h4>
                    {selectedInGroup > 0 && (
                      <p className="text-sm text-indigo-400 mt-0.5">
                        {selectedInGroup} selected
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Group Actions */}
                  {isExpanded && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          selectAllInGroup(level);
                        }}
                        className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
                      >
                        Select All
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          clearAllInGroup(level);
                        }}
                        className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
                      >
                        Clear
                      </button>
                    </>
                  )}
                  
                  {/* Expand/Collapse Icon */}
                  <svg
                    className={`w-5 h-5 text-gray-400 transform transition-transform ${
                      isExpanded ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
              </div>

              {/* State List */}
              {isExpanded && (
                <div className="border-t border-gray-700 p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {states.map((state) => {
                    const isSelected = selectedStates.includes(state.state_code);

                    return (
                      <div
                        key={state.state_code}
                        onClick={() => toggleState(state.state_code)}
                        className={`
                          p-3 rounded-lg border-2 cursor-pointer transition-all
                          ${
                            isSelected
                              ? 'bg-indigo-900 border-indigo-500'
                              : 'bg-gray-750 border-gray-700 hover:border-gray-600'
                          }
                        `}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-gray-100">
                                {state.state_code}
                              </span>
                              <span className="text-sm text-gray-300">
                                {state.state_name}
                              </span>
                            </div>

                            {showDetails && (
                              <div className="mt-2 space-y-1">
                                {state.registration_required && (
                                  <div className="text-xs text-amber-400">
                                    📋 Registration required
                                  </div>
                                )}
                                {state.key_focus_areas.length > 0 && (
                                  <div className="text-xs text-gray-400">
                                    Focus: {state.key_focus_areas[0]}
                                    {state.key_focus_areas.length > 1 &&
                                      ` +${state.key_focus_areas.length - 1} more`}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Checkbox */}
                          <div
                            className={`
                              w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0
                              ${
                                isSelected
                                  ? 'bg-indigo-600 border-indigo-500'
                                  : 'bg-gray-700 border-gray-600'
                              }
                            `}
                          >
                            {isSelected && (
                              <svg
                                className="w-3 h-3 text-white"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={3}
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pro Tip */}
      {groupByStrictness && selectedStates.length > 0 && (
        <div className="p-4 bg-indigo-900 bg-opacity-20 border border-indigo-700 rounded-lg">
          <div className="flex gap-3">
            <span className="text-2xl">💡</span>
            <div>
              <h4 className="font-medium text-indigo-300 mb-1">Pro Tip</h4>
              <p className="text-sm text-gray-300">
                Focus on meeting the strictest state's requirements first. Compliance with states
                like California, Oregon, or Washington typically satisfies requirements for less
                strict states.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

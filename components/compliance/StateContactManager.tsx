/**
 * State Contact Manager Component
 *
 * Allows viewing, searching, and updating state regulatory agency contact info.
 */

import React, { useState, useCallback, useEffect } from 'react';
import Button from '@/components/ui/Button';
import {
  searchStateContactInfo,
  updateStateContactInfo,
  upsertStateRegulatorySource,
} from '@/services/regulatoryDataService';

interface StateContactManagerProps {
  stateCode?: string;
  onContactUpdated?: () => void;
}

const PRIORITY_STATES = [
  { code: 'CA', name: 'California' },
  { code: 'OR', name: 'Oregon' },
  { code: 'WA', name: 'Washington' },
  { code: 'NY', name: 'New York' },
  { code: 'TX', name: 'Texas' },
  { code: 'CO', name: 'Colorado' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'FL', name: 'Florida' },
  { code: 'MI', name: 'Michigan' },
  { code: 'PA', name: 'Pennsylvania' },
];

export default function StateContactManager({
  stateCode: initialStateCode,
  onContactUpdated,
}: StateContactManagerProps) {
  const [selectedState, setSelectedState] = useState(initialStateCode || 'CA');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchingWeb, setSearchingWeb] = useState(false);
  const [contactData, setContactData] = useState<{
    currentContact: {
      email?: string;
      phone?: string;
      address?: string;
      contactUrl?: string;
    };
    searchResults: Array<{
      source: string;
      email?: string;
      phone?: string;
      address?: string;
      url: string;
      confidence: number;
    }>;
    lastVerified?: string;
  } | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editedContact, setEditedContact] = useState({
    email: '',
    phone: '',
    address: '',
    contactUrl: '',
  });
  const [verificationNotes, setVerificationNotes] = useState('');

  const fetchContactInfo = useCallback(async () => {
    setLoading(true);
    const result = await searchStateContactInfo(selectedState);
    if (result.success && result.data) {
      setContactData(result.data);
      setEditedContact({
        email: result.data.currentContact.email || '',
        phone: result.data.currentContact.phone || '',
        address: result.data.currentContact.address || '',
        contactUrl: result.data.currentContact.contactUrl || '',
      });
    }
    setLoading(false);
  }, [selectedState]);

  useEffect(() => {
    fetchContactInfo();
  }, [fetchContactInfo]);

  const handleWebSearch = async () => {
    setSearchingWeb(true);
    // Would trigger MCP web search for contact info
    // For now, simulate by re-fetching
    await fetchContactInfo();
    setSearchingWeb(false);
  };

  const handleSaveContact = async () => {
    setSaving(true);
    const result = await updateStateContactInfo(selectedState, editedContact, verificationNotes);
    if (result.success) {
      setEditMode(false);
      await fetchContactInfo();
      onContactUpdated?.();
    }
    setSaving(false);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-100">State Contact Manager</h3>
          <p className="text-sm text-gray-400 mt-1">
            View and update state regulatory agency contact information
          </p>
        </div>
      </div>

      {/* State Selector */}
      <div className="flex gap-3">
        <select
          value={selectedState}
          onChange={(e) => setSelectedState(e.target.value)}
          className="flex-1 bg-gray-700 border border-gray-600 text-gray-200 rounded-lg px-4 py-2"
        >
          {PRIORITY_STATES.map((state) => (
            <option key={state.code} value={state.code}>
              {state.name} ({state.code})
            </option>
          ))}
        </select>
        <Button
          onClick={handleWebSearch}
          disabled={searchingWeb}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-50"
        >
          {searchingWeb ? 'Searching...' : 'Search Web for Updates'}
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-500"></div>
        </div>
      ) : contactData ? (
        <div className="space-y-4">
          {/* Current Contact Info */}
          <div className="p-4 bg-gray-800 border border-gray-700 rounded-lg">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-medium text-gray-200">Current Contact Information</h4>
              <div className="flex items-center gap-4">
                <span className="text-xs text-gray-500">
                  Last verified: {formatDate(contactData.lastVerified)}
                </span>
                <Button
                  onClick={() => setEditMode(!editMode)}
                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-sm"
                >
                  {editMode ? 'Cancel' : 'Edit'}
                </Button>
              </div>
            </div>

            {editMode ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Email</label>
                    <input
                      type="email"
                      value={editedContact.email}
                      onChange={(e) => setEditedContact({ ...editedContact, email: e.target.value })}
                      className="w-full bg-gray-700 border border-gray-600 text-gray-200 rounded px-3 py-2"
                      placeholder="agency@state.gov"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Phone</label>
                    <input
                      type="tel"
                      value={editedContact.phone}
                      onChange={(e) => setEditedContact({ ...editedContact, phone: e.target.value })}
                      className="w-full bg-gray-700 border border-gray-600 text-gray-200 rounded px-3 py-2"
                      placeholder="(555) 555-5555"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm text-gray-400 mb-1">Address</label>
                    <input
                      type="text"
                      value={editedContact.address}
                      onChange={(e) => setEditedContact({ ...editedContact, address: e.target.value })}
                      className="w-full bg-gray-700 border border-gray-600 text-gray-200 rounded px-3 py-2"
                      placeholder="123 State St, City, State ZIP"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm text-gray-400 mb-1">Contact Page URL</label>
                    <input
                      type="url"
                      value={editedContact.contactUrl}
                      onChange={(e) => setEditedContact({ ...editedContact, contactUrl: e.target.value })}
                      className="w-full bg-gray-700 border border-gray-600 text-gray-200 rounded px-3 py-2"
                      placeholder="https://..."
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm text-gray-400 mb-1">Verification Notes</label>
                    <textarea
                      value={verificationNotes}
                      onChange={(e) => setVerificationNotes(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 text-gray-200 rounded px-3 py-2"
                      rows={2}
                      placeholder="How was this information verified?"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    onClick={() => setEditMode(false)}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveContact}
                    disabled={saving}
                    className="px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-500 mb-1">Email</div>
                  {contactData.currentContact.email ? (
                    <a
                      href={`mailto:${contactData.currentContact.email}`}
                      className="text-accent-400 hover:text-accent-300"
                    >
                      {contactData.currentContact.email}
                    </a>
                  ) : (
                    <span className="text-gray-500 italic">Not set</span>
                  )}
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">Phone</div>
                  {contactData.currentContact.phone ? (
                    <a
                      href={`tel:${contactData.currentContact.phone}`}
                      className="text-accent-400 hover:text-accent-300"
                    >
                      {contactData.currentContact.phone}
                    </a>
                  ) : (
                    <span className="text-gray-500 italic">Not set</span>
                  )}
                </div>
                <div className="md:col-span-2">
                  <div className="text-xs text-gray-500 mb-1">Address</div>
                  {contactData.currentContact.address ? (
                    <span className="text-gray-300">{contactData.currentContact.address}</span>
                  ) : (
                    <span className="text-gray-500 italic">Not set</span>
                  )}
                </div>
                <div className="md:col-span-2">
                  <div className="text-xs text-gray-500 mb-1">Contact Page</div>
                  {contactData.currentContact.contactUrl ? (
                    <a
                      href={contactData.currentContact.contactUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent-400 hover:text-accent-300 flex items-center gap-1"
                    >
                      {contactData.currentContact.contactUrl}
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  ) : (
                    <span className="text-gray-500 italic">Not set</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Search Results (if any) */}
          {contactData.searchResults.length > 0 && (
            <div className="p-4 bg-blue-900 bg-opacity-20 border border-blue-700 rounded-lg">
              <h4 className="font-medium text-blue-300 mb-3">Web Search Results</h4>
              <div className="space-y-3">
                {contactData.searchResults.map((result, idx) => (
                  <div key={idx} className="p-3 bg-gray-800 rounded border border-gray-700">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-300">{result.source}</span>
                      <span className={`px-2 py-0.5 text-xs rounded ${
                        result.confidence >= 0.8 ? 'bg-green-900 text-green-300' :
                        result.confidence >= 0.5 ? 'bg-yellow-900 text-yellow-300' :
                        'bg-red-900 text-red-300'
                      }`}>
                        {Math.round(result.confidence * 100)}% confident
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {result.email && <div><span className="text-gray-500">Email:</span> {result.email}</div>}
                      {result.phone && <div><span className="text-gray-500">Phone:</span> {result.phone}</div>}
                    </div>
                    <Button
                      onClick={() => {
                        setEditedContact({
                          email: result.email || editedContact.email,
                          phone: result.phone || editedContact.phone,
                          address: result.address || editedContact.address,
                          contactUrl: result.url || editedContact.contactUrl,
                        });
                        setEditMode(true);
                      }}
                      className="mt-2 px-3 py-1 bg-blue-700 hover:bg-blue-600 text-blue-100 rounded text-xs"
                    >
                      Use This Contact Info
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-12 text-gray-500">
          No contact information found for this state
        </div>
      )}
    </div>
  );
}

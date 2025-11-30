import Button from '@/components/ui/Button';
// Add/Edit Registration Modal
// Form for adding or editing state product registrations

import React, { useState, useEffect, useRef } from 'react';
import type { ProductRegistration } from '../types';
import Modal from './Modal';
import {
  STATE_GUIDELINES,
  getAllStates,
  validateRegistration,
  calculateRenewalStatus
} from '../services/stateRegistrationService';
import { InformationCircleIcon, CloudUploadIcon } from './icons';

interface AddRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (registration: Omit<ProductRegistration, 'id'> | ProductRegistration) => void;
  bomId: string;
  existingRegistration?: ProductRegistration | null;
  currentUserId?: string;
}

const AddRegistrationModal: React.FC<AddRegistrationModalProps> = ({
  isOpen,
  onClose,
  onSave,
  bomId,
  existingRegistration,
  currentUserId
}) => {
  const isEditing = !!existingRegistration;
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [formData, setFormData] = useState<Partial<ProductRegistration>>({
    bomId,
    stateCode: '',
    stateName: '',
    registrationNumber: '',
    registeredDate: '',
    expirationDate: '',
    registrationFee: undefined,
    renewalFee: undefined,
    currency: 'USD',
    certificateUrl: '',
    certificateFileName: '',
    notes: ''
  });

  const [errors, setErrors] = useState<string[]>([]);
  const [showGuidelines, setShowGuidelines] = useState(false);
  const [certificateFile, setCertificateFile] = useState<File | null>(null);

  // Populate form when editing
  useEffect(() => {
    if (existingRegistration) {
      setFormData(existingRegistration);
    } else {
      // Reset for new registration
      setFormData({
        bomId,
        stateCode: '',
        stateName: '',
        registrationNumber: '',
        registeredDate: '',
        expirationDate: '',
        registrationFee: undefined,
        renewalFee: undefined,
        currency: 'USD',
        certificateUrl: '',
        certificateFileName: '',
        notes: ''
      });
    }
    setErrors([]);
    setCertificateFile(null);
  }, [existingRegistration, bomId, isOpen]);

  const handleStateChange = (stateCode: string) => {
    const state = getAllStates().find(s => s.code === stateCode);
    const guidelines = STATE_GUIDELINES[stateCode];

    setFormData(prev => ({
      ...prev,
      stateCode,
      stateName: state?.name || '',
      registrationFee: guidelines?.averageFee,
      renewalFee: guidelines?.averageRenewalFee
    }));

    if (guidelines) {
      setShowGuidelines(true);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (file.type !== 'application/pdf') {
      alert('Please upload a PDF file');
      return;
    }

    // Convert to base64 for storage (in production, upload to cloud storage)
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      setCertificateFile(file);
      setFormData(prev => ({
        ...prev,
        certificateUrl: base64,
        certificateFileName: file.name
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = () => {
    // Validate
    const validation = validateRegistration(formData);
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    // Calculate renewal status
    const renewalStatus = calculateRenewalStatus(formData.expirationDate!);

    const registrationData: Partial<ProductRegistration> = {
      ...formData,
      renewalStatus,
      dueSoonAlertSent: false,
      urgentAlertSent: false,
      lastUpdated: new Date().toISOString(),
      updatedBy: currentUserId
    };

    if (!isEditing) {
      registrationData.createdAt = new Date().toISOString();
      registrationData.createdBy = currentUserId;
    }

    onSave(registrationData as any);
    onClose();
  };

  const selectedGuidelines = formData.stateCode ? STATE_GUIDELINES[formData.stateCode] : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Registration' : 'Add State Registration'}
      subtitle={isEditing ? `Update registration for ${formData.stateName}` : 'Register product in a new state'}
      size="large"
    >
      <div className="space-y-6">
        {/* Error Display */}
        {errors.length > 0 && (
          <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
            <h4 className="text-sm font-medium text-red-400 mb-2">Please fix the following errors:</h4>
            <ul className="list-disc list-inside space-y-1 text-sm text-red-300">
              {errors.map((error, idx) => (
                <li key={idx}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-6">
            {/* State Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                State <span className="text-red-400">*</span>
              </label>
              <select
                value={formData.stateCode}
                onChange={(e) => handleStateChange(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-accent-500"
                disabled={isEditing}
              >
                <option value="">Select a state...</option>
                {getAllStates().map(state => (
                  <option key={state.code} value={state.code}>
                    {state.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Registration Number */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Registration Number <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={formData.registrationNumber}
                onChange={(e) => setFormData(prev => ({ ...prev, registrationNumber: e.target.value }))}
                placeholder="e.g., CA-12345-2025"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-accent-500"
              />
            </div>

            {/* Registration Date */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Registration Date <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                value={formData.registeredDate}
                onChange={(e) => setFormData(prev => ({ ...prev, registeredDate: e.target.value }))}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-accent-500"
              />
            </div>

            {/* Expiration Date */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Expiration Date <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                value={formData.expirationDate}
                onChange={(e) => setFormData(prev => ({ ...prev, expirationDate: e.target.value }))}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-accent-500"
              />
              {selectedGuidelines?.renewalMonth && (
                <p className="text-xs text-gray-400 mt-1">
                  {selectedGuidelines.stateName} renewals typically due in {selectedGuidelines.renewalMonth}
                </p>
              )}
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Fees */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Registration Fee
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-400">$</span>
                  <input
                    type="number"
                    value={formData.registrationFee || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, registrationFee: parseFloat(e.target.value) || undefined }))}
                    placeholder="0.00"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-8 pr-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-accent-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Renewal Fee
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-400">$</span>
                  <input
                    type="number"
                    value={formData.renewalFee || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, renewalFee: parseFloat(e.target.value) || undefined }))}
                    placeholder="0.00"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-8 pr-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-accent-500"
                  />
                </div>
              </div>
            </div>

            {/* Certificate Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Registration Certificate (PDF)
              </label>
              <div className="mt-1">
                <Button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-600 rounded-lg hover:border-accent-500 hover:bg-gray-700/30 transition-colors"
                >
                  <CloudUploadIcon className="w-5 h-5 text-gray-400" />
                  <span className="text-sm text-gray-400">
                    {certificateFile ? certificateFile.name : formData.certificateFileName || 'Upload Certificate PDF'}
                  </span>
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Notes
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Additional information about this registration..."
                rows={4}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-accent-500"
              />
            </div>
          </div>
        </div>

        {/* State Guidelines (if state selected) */}
        {showGuidelines && selectedGuidelines && (
          <div className="bg-accent-900/20 border border-accent-600 rounded-lg p-6">
            <div className="flex items-start gap-3 mb-4">
              <InformationCircleIcon className="w-6 h-6 text-accent-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-lg font-semibold text-white mb-2">
                  {selectedGuidelines.stateName} Registration Requirements
                </h4>
                <p className="text-sm text-gray-300 mb-3">
                  <span className="font-medium">Agency:</span> {selectedGuidelines.agency}
                </p>
                <p className="text-sm text-gray-300 mb-3">
                  <span className="font-medium">Processing Time:</span> {selectedGuidelines.processingTime}
                </p>

                <div className="mt-4">
                  <p className="text-sm font-medium text-accent-300 mb-2">Required Documents:</p>
                  <ul className="list-disc list-inside space-y-1 text-sm text-gray-400">
                    {selectedGuidelines.requirements.map((req, idx) => (
                      <li key={idx}>{req}</li>
                    ))}
                  </ul>
                </div>

                {selectedGuidelines.notes && (
                  <div className="mt-4 pt-4 border-t border-accent-700">
                    <p className="text-xs text-gray-400">{selectedGuidelines.notes}</p>
                  </div>
                )}

                <div className="mt-4">
                  <a
                    href={selectedGuidelines.agencyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-accent-400 hover:text-accent-300 underline"
                  >
                    Visit {selectedGuidelines.agency} Website →
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
          <Button
            onClick={onClose}
            className="px-6 py-2 bg-gray-600 hover:bg-gray-500 text-white font-semibold rounded-lg transition-colors"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            className="px-6 py-2 bg-accent-500 hover:bg-accent-600 text-white font-semibold rounded-lg transition-colors"
          >
            {isEditing ? 'Update Registration' : 'Add Registration'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default AddRegistrationModal;

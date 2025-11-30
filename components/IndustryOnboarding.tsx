import Button from '@/components/ui/Button';
/**
 * Industry Onboarding Component
 * Collects user industry, states, and product info for targeted compliance
 */

import React, { useState, useEffect } from 'react';
import complianceService, { type IndustrySettings, type UserComplianceProfile } from '../services/complianceService';

interface IndustryOnboardingProps {
  userId: string;
  userEmail: string;
  onComplete: (profile: UserComplianceProfile) => void;
}

const US_STATES = [
  { code: 'CA', name: 'California' },
  { code: 'OR', name: 'Oregon' },
  { code: 'WA', name: 'Washington' },
  { code: 'CO', name: 'Colorado' },
  { code: 'NY', name: 'New York' },
  { code: 'TX', name: 'Texas' },
  { code: 'FL', name: 'Florida' },
  // Add more states as needed
];

export const IndustryOnboarding: React.FC<IndustryOnboardingProps> = ({ userId, userEmail, onComplete }) => {
  const [step, setStep] = useState(1);
  const [industries, setIndustries] = useState<IndustrySettings[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Form state
  const [selectedIndustry, setSelectedIndustry] = useState('');
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedCertifications, setSelectedCertifications] = useState<string[]>([]);
  const [complianceTier, setComplianceTier] = useState<'basic' | 'full_ai'>('basic');

  useEffect(() => {
    loadIndustries();
  }, []);

  const loadIndustries = async () => {
    try {
      const data = await complianceService.getIndustrySettings();
      setIndustries(data);
    } catch (error) {
      console.error('Failed to load industries:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectedIndustryData = industries.find(i => i.industry === selectedIndustry);

  const handleSubmit = async () => {
    try {
      const profile = await complianceService.upsertUserProfile({
        user_id: userId,
        email: userEmail,
        industry: selectedIndustry,
        target_states: selectedStates,
        certifications_held: selectedCertifications,
        compliance_tier: complianceTier,
        onboarding_completed: true,
        product_types: selectedIndustryData?.default_product_types || [],
      });

      onComplete(profile);
    } catch (error) {
      console.error('Failed to save profile:', error);
      alert('Failed to save profile. Please try again.');
    }
  };

  const toggleState = (stateCode: string) => {
    setSelectedStates(prev =>
      prev.includes(stateCode)
        ? prev.filter(s => s !== stateCode)
        : [...prev, stateCode]
    );
  };

  const toggleCertification = (cert: string) => {
    setSelectedCertifications(prev =>
      prev.includes(cert)
        ? prev.filter(c => c !== cert)
        : [...prev, cert]
    );
  };

  if (loading) {
    return <div className="p-8 text-center">Loading...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          {[1, 2, 3].map(num => (
            <div
              key={num}
              className={`flex items-center justify-center w-10 h-10 rounded-full font-bold ${
                step >= num ? 'bg-accent-500 text-white' : 'bg-gray-700 text-gray-400'
              }`}
            >
              {num}
            </div>
          ))}
        </div>
        <div className="h-2 bg-gray-700 rounded-full">
          <div
            className="h-full bg-accent-500 rounded-full transition-all duration-300"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>
      </div>

      {/* Step 1: Industry Selection */}
      {step === 1 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">What's your industry?</h2>
            <p className="text-gray-400">We'll customize compliance checks for your products</p>
          </div>

          <div className="space-y-3">
            {industries.map(industry => (
              <Button
                key={industry.industry}
                onClick={() => setSelectedIndustry(industry.industry)}
                className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                  selectedIndustry === industry.industry
                    ? 'border-accent-500 bg-accent-800/50'
                    : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                }`}
              >
                <div className="font-bold text-white mb-1">{industry.display_name}</div>
                <div className="text-sm text-gray-400">{industry.description}</div>
                {selectedIndustry === industry.industry && (
                  <div className="mt-3 text-xs text-accent-300">
                    Focus areas: {industry.focus_areas.slice(0, 3).join(', ')}
                  </div>
                )}
              </Button>
            ))}
          </div>

          <Button
            onClick={() => setStep(2)}
            disabled={!selectedIndustry}
            className="w-full bg-accent-500 hover:bg-accent-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium py-3 rounded-lg transition-all"
          >
            Continue
          </Button>
        </div>
      )}

      {/* Step 2: States & Certifications */}
      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Where do you sell?</h2>
            <p className="text-gray-400">Select all states where your products are sold</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {US_STATES.map(state => (
              <Button
                key={state.code}
                onClick={() => toggleState(state.code)}
                className={`p-3 rounded-lg border-2 font-medium transition-all ${
                  selectedStates.includes(state.code)
                    ? 'border-accent-500 bg-accent-800/50 text-white'
                    : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-600'
                }`}
              >
                {state.name}
              </Button>
            ))}
          </div>

          {selectedIndustryData && selectedIndustryData.common_certifications.length > 0 && (
            <div>
              <h3 className="text-lg font-bold text-white mb-3">Certifications (optional)</h3>
              <div className="space-y-2">
                {selectedIndustryData.common_certifications.map(cert => (
                  <label key={cert} className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-750">
                    <input
                      type="checkbox"
                      checked={selectedCertifications.includes(cert)}
                      onChange={() => toggleCertification(cert)}
                      className="w-5 h-5 rounded border-gray-600 text-accent-500 focus:ring-accent-500"
                    />
                    <span className="text-white">{cert.replace(/_/g, ' ')}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              onClick={() => setStep(1)}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-medium py-3 rounded-lg transition-all"
            >
              Back
            </Button>
            <Button
              onClick={() => setStep(3)}
              disabled={selectedStates.length === 0}
              className="flex-1 bg-accent-500 hover:bg-accent-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium py-3 rounded-lg transition-all"
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Choose Tier */}
      {step === 3 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Choose your plan</h2>
            <p className="text-gray-400">Start free, upgrade anytime</p>
          </div>

          <div className="space-y-3">
            {/* Basic */}
            <Button
              onClick={() => setComplianceTier('basic')}
              className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                complianceTier === 'basic'
                  ? 'border-accent-500 bg-accent-800/50'
                  : 'border-gray-700 bg-gray-800 hover:border-gray-600'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-white text-xl">Basic Mode</span>
                <span className="text-2xl font-bold text-green-500">$0/mo</span>
              </div>
              <p className="text-gray-400 text-sm mb-2">
                Organize regulatory links, manual checklists, compliance tracking
              </p>
              <p className="text-accent-300 text-xs">
                ✨ Includes 5 free AI checks to try Full AI Mode
              </p>
            </Button>

            {/* Full AI */}
            <Button
              onClick={() => setComplianceTier('full_ai')}
              className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                complianceTier === 'full_ai'
                  ? 'border-accent-500 bg-accent-800/50'
                  : 'border-gray-700 bg-gray-800 hover:border-gray-600'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-white text-xl">Full AI Mode</span>
                <span className="text-2xl font-bold text-accent-400">$49/mo</span>
              </div>
              <p className="text-gray-400 text-sm mb-2">
                AI-powered analysis, OCR extraction, automated recommendations, 50 checks/month
              </p>
              <p className="text-yellow-400 text-xs font-medium">
                ⭐ Recommended for growing businesses
              </p>
            </Button>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={() => setStep(2)}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-medium py-3 rounded-lg transition-all"
            >
              Back
            </Button>
            <Button
              onClick={handleSubmit}
              className="flex-1 bg-accent-500 hover:bg-accent-500 text-white font-medium py-3 rounded-lg transition-all"
            >
              Get Started
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default IndustryOnboarding;

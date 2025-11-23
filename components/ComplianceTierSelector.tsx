import Button from '@/components/ui/Button';
/**
 * Compliance Tier Selector Component
 * Helps users choose between Basic (free) and Full AI ($49/mo) modes
 */

import React, { useState, useEffect } from 'react';
import { CheckCircleIcon, SparklesIcon, XCircleIcon } from './icons';
import complianceService, { type UserComplianceProfile } from '../services/complianceService';

interface ComplianceTierSelectorProps {
  userId: string;
  onTierSelected: (tier: 'basic' | 'full_ai') => void;
}

export const ComplianceTierSelector: React.FC<ComplianceTierSelectorProps> = ({ userId, onTierSelected }) => {
  const [profile, setProfile] = useState<UserComplianceProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfile();
  }, [userId]);

  const loadProfile = async () => {
    try {
      const data = await complianceService.getUserProfile(userId);
      setProfile(data);
    } catch (error) {
      console.error('Failed to load profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectTier = async (tier: 'basic' | 'full_ai') => {
    if (tier === 'full_ai') {
      // In production, integrate with Stripe here
      await complianceService.upgradeToFullAI(userId);
    }
    onTierSelected(tier);
  };

  if (loading) {
    return <div className="animate-pulse">Loading...</div>;
  }

  const FeatureRow = ({ included, text }: { included: boolean; text: string }) => (
    <div className="flex items-start gap-2 text-sm">
      {included ? (
        <CheckCircleIcon className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
      ) : (
        <XCircleIcon className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
      )}
      <span className={included ? 'text-white' : 'text-gray-500'}>{text}</span>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-white mb-3">Choose Your Compliance Plan</h2>
        <p className="text-gray-400 text-lg">Start free, upgrade when you need automation</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Basic Mode - Free */}
        <div className="bg-gray-800 rounded-lg border-2 border-gray-700 p-6 hover:border-gray-600 transition-all">
          <div className="mb-6">
            <h3 className="text-2xl font-bold text-white mb-2">Basic Mode</h3>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-4xl font-bold text-white">$0</span>
              <span className="text-gray-400">/month</span>
            </div>
            <p className="text-gray-400">Perfect for getting started</p>
          </div>

          <div className="space-y-3 mb-6">
            <FeatureRow included text="Organize regulatory website links" />
            <FeatureRow included text="Manual verification checklists" />
            <FeatureRow included text="Compliance history tracking" />
            <FeatureRow included text="State-by-state organization" />
            <FeatureRow included text="Unlimited products" />
            <FeatureRow included text="Community support" />
            <FeatureRow included={false} text="AI-powered analysis" />
            <FeatureRow included={false} text="OCR text extraction" />
            <FeatureRow included={false} text="Automated recommendations" />
            <FeatureRow included={false} text="Industry-specific intelligence" />
          </div>

          <Button
            onClick={() => selectTier('basic')}
            disabled={profile?.compliance_tier === 'basic'}
            className={`w-full py-3 px-4 rounded-lg font-medium transition-all ${
              profile?.compliance_tier === 'basic'
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-gray-700 hover:bg-gray-600 text-white'
            }`}
          >
            {profile?.compliance_tier === 'basic' ? 'Current Plan' : 'Start Free'}
          </Button>
        </div>

        {/* Full AI Mode - $49/mo */}
        <div className="bg-gradient-to-br from-indigo-900 to-purple-900 rounded-lg border-2 border-indigo-500 p-6 hover:border-indigo-400 transition-all relative">
          <div className="absolute top-4 right-4">
            <span className="bg-indigo-500 text-white text-xs font-bold px-3 py-1 rounded-full">
              RECOMMENDED
            </span>
          </div>

          <div className="mb-6">
            <h3 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
              <SparklesIcon className="w-6 h-6 text-yellow-400" />
              Full AI Mode
            </h3>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-4xl font-bold text-white">$49</span>
              <span className="text-gray-300">/month</span>
            </div>
            <p className="text-gray-300">Everything automated</p>
            {profile?.compliance_tier === 'basic' && profile.trial_checks_remaining > 0 && (
              <p className="text-yellow-400 text-sm mt-2 font-medium">
                🎉 {profile.trial_checks_remaining} free AI checks remaining!
              </p>
            )}
          </div>

          <div className="space-y-3 mb-6">
            <FeatureRow included text="✨ All Basic Mode features" />
            <FeatureRow included text="✨ AI-powered compliance analysis" />
            <FeatureRow included text="✨ OCR label text extraction" />
            <FeatureRow included text="✨ Automated issue detection" />
            <FeatureRow included text="✨ Specific fix recommendations" />
            <FeatureRow included text="✨ Industry-specific intelligence" />
            <FeatureRow included text="✨ 50 checks/month included" />
            <FeatureRow included text="✨ Priority email support" />
            <FeatureRow included text="✨ State-by-state reports" />
            <FeatureRow included text="✨ Export compliance PDFs" />
          </div>

          <Button
            onClick={() => selectTier('full_ai')}
            disabled={profile?.compliance_tier === 'full_ai'}
            className={`w-full py-3 px-4 rounded-lg font-medium transition-all ${
              profile?.compliance_tier === 'full_ai'
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-indigo-500 hover:bg-indigo-600 text-white shadow-lg hover:shadow-xl'
            }`}
          >
            {profile?.compliance_tier === 'full_ai' ? 'Current Plan ✓' : 'Upgrade to Full AI'}
          </Button>

          {profile?.compliance_tier === 'basic' && (
            <p className="text-center text-gray-300 text-xs mt-3">
              Cancel anytime • No long-term contracts
            </p>
          )}
        </div>
      </div>

      <div className="mt-8 text-center">
        <p className="text-gray-400 text-sm">
          💡 <strong>Tip:</strong> Start with Basic Mode to organize your regulations, then upgrade when you're ready for AI automation
        </p>
      </div>
    </div>
  );
};

export default ComplianceTierSelector;

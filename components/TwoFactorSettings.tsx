import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import { supabase } from '../lib/supabase/client';
import { ShieldCheckIcon, QrCodeIcon, XMarkIcon } from './icons';

interface TwoFactorSettingsProps {
  addToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

type TotpFactor = {
  id: string;
  friendly_name?: string | null;
  factor_type?: string;
  status?: 'verified' | 'unverified';
  created_at?: string;
};

type PendingEnrollment = {
  factorId: string;
  qrCode?: string | null;
  uri?: string | null;
  secret?: string | null;
};

const TwoFactorSettings: React.FC<TwoFactorSettingsProps> = ({ addToast }) => {
  const [loading, setLoading] = useState(true);
  const [factors, setFactors] = useState<TotpFactor[]>([]);
  const [pending, setPending] = useState<PendingEnrollment | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [unenrollingId, setUnenrollingId] = useState<string | null>(null);

  const mfaClient = useMemo(() => (supabase.auth as any)?.mfa, []);

  const normalizeTotpFactors = (payload: any): TotpFactor[] => {
    if (!payload) return [];
    const candidates = Array.isArray(payload.factors)
      ? payload.factors
      : Array.isArray(payload.totp?.factors)
        ? payload.totp.factors
        : [];
    return candidates.filter((factor: any) => factor?.factor_type === 'totp' || factor?.type === 'totp');
  };

  const refreshFactors = useCallback(async () => {
    if (!mfaClient) {
      setError('Multi-factor auth is not available in this environment.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data, error: listError } = await mfaClient.listFactors();
      if (listError) {
        throw listError;
      }
      setFactors(normalizeTotpFactors(data));
    } catch (err) {
      console.error('[TwoFactorSettings] Failed to list factors', err);
      setError('Unable to load your authentication factors. Please refresh and try again.');
    } finally {
      setLoading(false);
    }
  }, [mfaClient]);

  useEffect(() => {
    void refreshFactors();
  }, [refreshFactors]);

  const handleStartEnrollment = async () => {
    if (!mfaClient || pending) return;
    setEnrolling(true);
    setError(null);
    try {
      const friendlyName = `Authenticator ${factors.length + 1}`;
      const { data, error: enrollError } = await mfaClient.enroll({
        factorType: 'totp',
        friendlyName,
      });
      if (enrollError) {
        throw enrollError;
      }
      setPending({
        factorId: data.id,
        qrCode: data.totp?.qr_code ?? null,
        uri: data.totp?.uri ?? null,
        secret: data.totp?.secret ?? null,
      });
      setVerificationCode('');
      addToast?.('Scan the QR code with your authenticator app, then enter the 6-digit code to finish.', 'info');
    } catch (err) {
      console.error('[TwoFactorSettings] Failed to enroll factor', err);
      setError('Unable to start enrollment. Please ensure you recently signed in and try again.');
    } finally {
      setEnrolling(false);
    }
  };

  const handleVerifyEnrollment = async () => {
    if (!mfaClient || !pending || verificationCode.trim().length === 0) return;
    setVerifying(true);
    setError(null);
    try {
      const { data: challenge, error: challengeError } = await mfaClient.challenge({
        factorId: pending.factorId,
      });
      if (challengeError) {
        throw challengeError;
      }
      const { error: verifyError } = await mfaClient.verify({
        factorId: pending.factorId,
        challengeId: challenge.id,
        code: verificationCode.trim(),
      });
      if (verifyError) {
        throw verifyError;
      }
      addToast?.('Two-factor authentication is now enabled for your account.', 'success');
      setPending(null);
      setVerificationCode('');
      await refreshFactors();
    } catch (err) {
      console.error('[TwoFactorSettings] Verification failed', err);
      setError('Verification code was invalid or expired. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  const handleCancelEnrollment = () => {
    setPending(null);
    setVerificationCode('');
    setError(null);
  };

  const handleDisableFactor = async (factorId: string) => {
    if (!mfaClient) return;
    setUnenrollingId(factorId);
    setError(null);
    try {
      const { error: unenrollError } = await mfaClient.unenroll({ factorId });
      if (unenrollError) {
        throw unenrollError;
      }
      addToast?.('Authenticator removed from your account.', 'info');
      await refreshFactors();
    } catch (err) {
      console.error('[TwoFactorSettings] Failed to remove factor', err);
      setError('Could not remove the selected authenticator. Please try again.');
    } finally {
      setUnenrollingId(null);
    }
  };

  const hasVerifiedFactor = factors.some((factor) => factor.status === 'verified');
  const inProgress = Boolean(pending);

  return (
    <div className="space-y-5">
      <div className="bg-gray-900/40 border border-gray-700 rounded-xl p-5">
        <div className="flex items-center gap-3">
          <ShieldCheckIcon className={`${hasVerifiedFactor ? 'text-emerald-300' : 'text-gray-400'} w-6 h-6`} />
          <div>
            <p className="text-sm font-semibold text-white">
              {hasVerifiedFactor ? 'Two-factor authentication is enabled.' : 'Two-factor authentication is off.'}
            </p>
            <p className="text-xs text-gray-400">
              Keep authenticator apps user-specific. Admins can encourage usage but it remains optional per user.
            </p>
          </div>
        </div>
        {loading ? (
          <p className="mt-4 text-sm text-gray-400">Checking your enrolled authenticators…</p>
        ) : factors.length === 0 ? (
          <p className="mt-4 text-sm text-gray-400">
            No authenticators are currently linked to your profile. Enable TFA to protect purchasing workflows with a
            one-time code during login.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {factors.map((factor) => (
              <li
                key={factor.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-700 bg-gray-800/40 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-white">{factor.friendly_name || 'Authenticator'}</p>
                  <p className="text-xs text-gray-400">
                    Status: {factor.status === 'verified' ? 'Verified' : 'Pending verification'}
                    {factor.created_at && (
                      <>
                        {' '}
                        · Added {new Date(factor.created_at).toLocaleDateString()}
                      </>
                    )}
                  </p>
                </div>
                <Button
                  onClick={() => handleDisableFactor(factor.id)}
                  disabled={unenrollingId === factor.id}
                  className="text-xs text-red-300 border border-red-500/40 rounded-md px-3 py-1 hover:bg-red-500/10 disabled:opacity-60"
                >
                  {unenrollingId === factor.id ? 'Removing…' : 'Remove'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pending ? (
        <div className="bg-gray-900/40 border border-indigo-500/40 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-base font-semibold text-white">Finish enrolling your authenticator</p>
              <p className="text-xs text-gray-400">
                Scan the QR code below (or enter the manual secret) and type the 6-digit code from your authenticator app.
              </p>
            </div>
            <Button onClick={handleCancelEnrollment} className="text-xs text-gray-300 hover:text-white flex items-center gap-1">
              <XMarkIcon className="w-4 h-4" /> Cancel
            </Button>
          </div>
          <div className="flex flex-wrap gap-4 items-center">
            {pending.qrCode ? (
              <div className="bg-white rounded-lg p-3 shadow-inner">
                {/* Supabase delivers SVG markup for the QR code */}
                <div
                  className="qr-code-display"
                  dangerouslySetInnerHTML={{ __html: pending.qrCode }}
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-gray-300 text-sm min-w-[160px] border border-gray-700 rounded-lg p-3">
                <QrCodeIcon className="w-10 h-10 text-gray-500" />
                QR code unavailable
              </div>
            )}
            <div className="flex-1 space-y-3 min-w-[220px]">
              {pending.secret && (
                <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-3">
                  <p className="text-xs text-gray-400 uppercase">Manual secret</p>
                  <p className="font-mono text-sm text-white break-all">{pending.secret}</p>
                </div>
              )}
              {pending.uri && (
                <a
                  href={pending.uri}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center text-sm font-semibold text-indigo-300 hover:text-indigo-100"
                >
                  Open TOTP URI &rarr;
                </a>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              placeholder="Enter 6-digit code"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              className="flex-1 rounded-md border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:ring-2 focus:ring-indigo-500"
            />
            <Button
              onClick={handleVerifyEnrollment}
              disabled={verifying || verificationCode.trim().length < 6}
              className="bg-indigo-600 text-white font-semibold px-4 py-2 rounded-md hover:bg-indigo-500 disabled:bg-gray-600"
            >
              {verifying ? 'Verifying…' : 'Verify & Activate'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-400">
            Two-factor stays optional per user. Enable it here whenever you’re ready—no admin ticket required.
          </p>
          <Button
            onClick={handleStartEnrollment}
            disabled={enrolling || Boolean(pending) || !mfaClient}
            className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-500 disabled:bg-gray-600"
          >
            {enrolling ? 'Preparing…' : 'Enable Authenticator'}
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
};

export default TwoFactorSettings;

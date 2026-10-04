/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  KeyRound,
  Flame,
  AlertTriangle,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';
import { AuthenticatedUser } from '../services/authService';
import { 
  auth, 
  googleProvider, 
  signInWithPopup, 
  signInWithCredential,
  GoogleAuthProvider,
} from '../services/firebase';interface AuthModalProps {
  isOpen: boolean;
  onSuccess: (user: AuthenticatedUser) => void;
  onClose?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onSuccess,
  onClose,
}) => {
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [isFirebaseLoading, setIsFirebaseLoading] = useState(false);
  const [copiedDomain, setCopiedDomain] = useState(false);

  if (!isOpen) return null;

  const currentHost =
    typeof window !== 'undefined' ? window.location.hostname : '';

  const handleCopyHost = async () => {
    if (!navigator.clipboard || !currentHost) return;

    try {
      await navigator.clipboard.writeText(currentHost);
      setCopiedDomain(true);
      setTimeout(() => setCopiedDomain(false), 2000);
    } catch {
      setCopiedDomain(false);
    }
  };

  const handleGoogleSignIn = async () => {
  setIsFirebaseLoading(true);
  setError(null);
  setErrorCode(null);

  try {
   const userCredential = await window.controllerDesktop.signInWithGoogle();
    const credential = GoogleAuthProvider.credential(
  userCredential.idToken,
  userCredential.accessToken || undefined
);

const firebaseResult = await signInWithCredential(auth, credential);
const user = firebaseResult.user;

    if (!user.uid) {
      throw new Error('Firebase did not return a valid user identity.');
    }

    const token = await user.getIdToken();

    if (!token) {
      throw new Error('Firebase did not return a valid ID token.');
    }

    const authenticatedUser: AuthenticatedUser = {
      id: user.uid,
      name:
        user.displayName ||
        user.email?.split('@')[0] ||
        'Firebase Operator',
      role: 'operator',
      signedInAt: Date.now(),
      token,
    };

    onSuccess(authenticatedUser);
  } catch (err: any) {
    console.warn('Firebase Google Auth error:', err);

    const code = err?.code || '';
    setErrorCode(code);

    if (code === 'auth/operation-not-allowed') {
      setError(
        'Google Sign-In is not enabled in Firebase Authentication for this project.'
      );
    } else if (
      code === 'auth/invalid-credential' ||
      code === 'auth/invalid-id-token'
    ) {
      setError(
        'Google authentication was completed, but Firebase rejected the returned credential.'
      );
    } else {
      setError(
        err?.message ||
          'Firebase authentication failed. No local authentication is available.'
      );
    }
  } finally {
    setIsFirebaseLoading(false);
  }
};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative my-auto">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-800/50 flex items-center justify-center text-cyan-400">
            <KeyRound className="w-5 h-5" />
          </div>

          <div>
            <h2 className="text-base font-semibold text-neutral-100">
              Firebase Authentication
            </h2>

            <p className="text-xs text-neutral-400">
              Sign in with your authorized Firebase Google account
            </p>
          </div>
        </div>

        {window.controllerAndroid && (
          <div className="mb-4 rounded-lg border border-amber-800/60 bg-amber-950/30 p-3 text-[11px] leading-relaxed text-amber-200">
            Android Google sign-in requires a native OAuth configuration.
            Google does not allow this embedded authentication flow until that
            configuration is provided.
          </div>
        )}

        {errorCode === 'auth/unauthorized-domain' && (
          <div className="mb-5 p-4 rounded-xl bg-amber-950/40 border border-amber-600/50 text-amber-200 text-xs space-y-3">
            <div className="flex items-center gap-2 font-bold text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Firebase Authorized Domain Required</span>
            </div>

            <p className="text-neutral-300 leading-relaxed">
              Firebase rejected the current application domain. Add this
              domain to Firebase Authentication → Authorized Domains.
            </p>

            <div className="flex items-center gap-2 bg-neutral-950 p-2 rounded-lg border border-neutral-800 font-mono text-[11px] text-amber-300">
              <span className="truncate flex-1 select-all">
                {currentHost || '(unknown domain)'}
              </span>

              <button
                type="button"
                onClick={handleCopyHost}
                className="p-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 cursor-pointer"
                title="Copy domain"
              >
                {copiedDomain ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            <a
              href="https://console.firebase.google.com/project/the-controller-982de/authentication/settings"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 text-neutral-950 font-semibold text-[11px] transition-colors cursor-pointer"
            >
              <span>Open Firebase Authorized Domains</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}

        {errorCode === 'auth/operation-not-allowed' && (
          <div className="mb-5 p-4 rounded-xl bg-amber-950/40 border border-amber-600/50 text-amber-200 text-xs space-y-3">
            <div className="flex items-center gap-2 font-bold text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Google Sign-In Is Disabled</span>
            </div>

            <p className="text-neutral-300 leading-relaxed">
              Enable Google as a sign-in provider in Firebase Authentication.
            </p>

            <a
              href="https://console.firebase.google.com/project/the-controller-982de/authentication/providers"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 text-neutral-950 font-semibold text-[11px] transition-colors cursor-pointer"
            >
              <span>Open Firebase Sign-In Providers</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}

        {error && !errorCode?.includes('unauthorized') && !errorCode?.includes('operation-not-allowed') && (
          <div className="mb-4 p-3 rounded-lg bg-rose-950/40 border border-rose-800 text-rose-300 text-xs">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isFirebaseLoading}
          className="w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl bg-neutral-950 hover:bg-neutral-800 border border-neutral-700/80 text-neutral-100 text-xs font-medium transition-all shadow-sm cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <Flame className="w-4 h-4 text-amber-500" />

          <span>
            {isFirebaseLoading
              ? 'Authenticating with Firebase...'
              : 'Sign in with Google'}
          </span>
        </button>

        <p className="mt-4 text-center text-[11px] text-neutral-500">
          Access is granted only after Firebase authentication succeeds.
        </p>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            disabled={isFirebaseLoading}
            className="w-full mt-3 px-4 py-2 text-xs font-medium text-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
};
import React, { useEffect, useState } from 'react';
import { getDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebaseClient';
import { format } from 'date-fns';
import { ProjectContext } from '../types';

interface AgreementSignoffPageProps {
  token: string;
}

export default function AgreementSignoffPage({ token }: AgreementSignoffPageProps) {
  const [loading, setLoading] = useState(true);
  const [projectContext, setProjectContext] = useState<any>(null);
  const [projectId, setProjectId] = useState<string>('');
  const [isExpired, setIsExpired] = useState(false);
  const [successState, setSuccessState] = useState<'signed' | null>(null);
  const [signoffTypeState, setSignoffTypeState] = useState<'contract' | 'execution'>('contract');

  // Form states
  const [clientName, setClientName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const STUDIO_NAME = import.meta.env.VITE_STUDIO_NAME || 'Form Factors Design Studio';
  const STUDIO_PHONE = import.meta.env.VITE_STUDIO_PHONE || '+91 98765 43210';
  const STUDIO_LOGO_URL = import.meta.env.VITE_STUDIO_LOGO_URL || '';

  useEffect(() => {
    const fetchAgreement = async () => {
      try {
        const parts = token.split('_');
        let pid = '';
        if (parts[0] === 'AGREEMENT' && parts.length >= 3) {
            pid = parts[1];
        } else if (parts[0] === 'EXEC' && parts[1] === 'AGREEMENT' && parts.length >= 4) {
            pid = parts[2];
        } else {
            setIsExpired(true);
            setLoading(false);
            return;
        }

        setProjectId(pid);

        const projectRef = doc(db, 'projects', pid);
        const projectSnap = await getDoc(projectRef);

        if (!projectSnap.exists()) {
            setIsExpired(true);
            setLoading(false);
            return;
        }

        const pData = projectSnap.data();
        const ctx = (pData.context || pData.projectContext) as any;

        let signoffType: 'contract' | 'execution' | null = null;
        if (ctx?.contractSignoff?.token === token) {
            signoffType = 'contract';
        } else if (ctx?.executionSignoff?.token === token) {
            signoffType = 'execution';
        }

        if (!signoffType) {
            setIsExpired(true);
            setLoading(false);
            return;
        }

        setProjectContext(ctx);
        setSignoffTypeState(signoffType); // We'll need a state for this
        if (ctx.clientName) {
            setClientName(ctx.clientName);
        }
      } catch (err) {
        console.error("Signoff error:", err);
        setIsExpired(true);
      } finally {
        setLoading(false);
      }
    };
    fetchAgreement();
  }, [token]);

  const handleApprove = async () => {
    if (!clientName.trim()) {
        setError("Please provide your name.");
        return;
    }
    setSubmitting(true);
    setError(null);
    try {
        const projectRef = doc(db, 'projects', projectId);
        if (signoffTypeState === 'execution') {
            await updateDoc(projectRef, {
                'context.executionSignoff.status': 'signed',
                'context.executionSignoff.signedAt': new Date().toISOString(),
                'context.executionSignoff.clientName': clientName,
                'context.executionSignoff.ipAddress': window.location.hostname,
                'context.executionSignoff.refId': 'Digital Signature'
            });
        } else {
            await updateDoc(projectRef, {
                'context.contractSignoff.status': 'signed',
                'context.contractSignoff.signedAt': new Date().toISOString(),
                'context.contractSignoff.clientName': clientName,
                'context.contractSignoff.ipAddress': window.location.hostname,
                'context.contractSignoff.refId': 'Digital Signature',
                'context.contractStatus': 'executed'
            });
        }

      setSuccessState('signed');
      // notification to studio could be sent here
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to sumbit signature.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="flex flex-col items-center gap-4 text-center">
            <svg className="animate-spin h-8 w-8 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-slate-600 font-medium">Loading agreement...</p>
        </div>
      </div>
    );
  }

  if (isExpired || !projectContext) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
          <div className="max-w-md bg-white p-6 rounded-xl shadow-sm border border-slate-200 text-center">
             <p className="text-slate-700 font-medium">This agreement link is invalid or has expired. Please contact {STUDIO_NAME}.</p>
          </div>
      </div>
    );
  }

  const isAlreadySigned = (signoffTypeState === 'execution' ? projectContext.executionSignoff?.status === 'signed' : projectContext.contractSignoff?.status === 'signed') || successState === 'signed';

  if (isAlreadySigned) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 text-center">
                <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-sm border border-emerald-200">
                    <div className="mx-auto w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <h2 className="text-xl font-semibold text-indigo-900 mb-2">Agreement Executed</h2>
                    <p className="text-slate-600">The execution agreement has been digitally signed and recorded successfully.</p>
                </div>
            </div>
        )
  }

  return (
      <div className="min-h-screen bg-slate-50 flex justify-center py-8 px-4 font-sans">
          <div className="w-full max-w-[540px] flex flex-col gap-6">
              {/* Header */}
              <div className="text-center">
                  {STUDIO_LOGO_URL ? (
                      <img src={STUDIO_LOGO_URL} alt={STUDIO_NAME} className="h-12 mx-auto mb-4" />
                  ) : (
                      <h1 className="text-2xl font-bold text-indigo-950 mb-4">{STUDIO_NAME}</h1>
                  )}
                  <h2 className="text-xl font-semibold text-indigo-900">Review {signoffTypeState === 'execution' ? 'Execution' : 'Contract'} Agreement</h2>
                  <p className="text-slate-500 text-sm mt-1">{projectContext.name}</p>
              </div>

              {/* Action Box */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="p-6">
                      <h3 className="font-semibold text-indigo-900 mb-4">Digital Signature Request</h3>
                      <p className="text-sm text-slate-600 mb-6 leading-relaxed">
                          By entering your name and clicking "Sign Agreement", you digitally authorize and accept the {signoffTypeState === 'execution' ? 'execution' : 'contract'} agreement, finalized scope, and commercials for the project. Make sure you have reviewed the details sent to you.
                      </p>

                      {error && (
                          <div className="mb-6 bg-red-50 text-red-700 p-3 rounded-lg text-sm flex items-start gap-2">
                              <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                              <span>{error}</span>
                          </div>
                      )}

                      <div className="space-y-4">
                          <div>
                              <label className="block text-sm font-medium text-slate-700 mb-1">Your Name</label>
                              <input 
                                  type="text" 
                                  value={clientName}
                                  onChange={(e) => setClientName(e.target.value)}
                                  placeholder="Enter your full name to sign"
                                  className="w-full border border-slate-300 rounded-lg px-4 py-3 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors outline-none"
                              />
                          </div>

                          <div className="pt-2">
                              <button 
                                  onClick={handleApprove}
                                  disabled={submitting}
                                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-4 rounded-lg shadow-sm transition-colors flex justify-center items-center gap-2 relative overflow-hidden group"
                              >
                                  {submitting ? (
                                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                      </svg>
                                  ) : (
                                      <>I Agree and Sign <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg></>
                                  )}
                              </button>
                          </div>
                      </div>
                  </div>
              </div>

              {/* Footer */}
              <div className="text-center text-slate-500 text-xs">
                  <p>Powered by {STUDIO_NAME}</p>
              </div>
          </div>
      </div>
  );
}

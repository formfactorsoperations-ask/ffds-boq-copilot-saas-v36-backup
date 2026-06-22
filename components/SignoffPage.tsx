import React, { useEffect, useState } from 'react';
import { getDecisionByToken, recordClientSignoff, DecisionData } from '../services/decisionsService';
import { sendDesignerNotification } from '../services/emailService';
import { format } from 'date-fns';

interface SignoffPageProps {
  token: string;
}

export default function SignoffPage({ token }: SignoffPageProps) {
  const [loading, setLoading] = useState(true);
  const [decision, setDecision] = useState<DecisionData | null>(null);
  const [isExpired, setIsExpired] = useState(false);
  const [successState, setSuccessState] = useState<'approved' | 'queried' | null>(null);
  const [successName, setSuccessName] = useState('');

  // Form states
  const [clientName, setClientName] = useState('');
  const [showConcernForm, setShowConcernForm] = useState(false);
  const [queryText, setQueryText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const STUDIO_NAME = import.meta.env.VITE_STUDIO_NAME || 'Form Factors Design Studio';
  const STUDIO_PHONE = import.meta.env.VITE_STUDIO_PHONE || '+91 98765 43210';
  const STUDIO_LOGO_URL = import.meta.env.VITE_STUDIO_LOGO_URL || '';

  useEffect(() => {
    const fetchDecision = async () => {
      try {
        const data = await getDecisionByToken(token);
        if (!data) {
          setIsExpired(true);
          setLoading(false);
          return;
        }

        // Check expiration
        if (data.tokenExpiresAt && data.tokenExpiresAt.toDate() < new Date()) {
          setIsExpired(true);
          setLoading(false);
          return;
        }

        setDecision(data);
        if (data.clientName) {
            setClientName(data.clientName);
        }
      } catch (err) {
        console.error("Signoff error:", err);
        setIsExpired(true); // Treat fetch errors as expired/invalid for safety
      } finally {
        setLoading(false);
      }
    };
    fetchDecision();
  }, [token]);

  const handleApprove = async () => {
    if (!clientName.trim()) {
        setError("Please provide your name.");
        return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await recordClientSignoff(token, 'approved', clientName, '', window.location.hostname);
      setSuccessName(clientName);
      setSuccessState('approved');
      if (decision && decision.id && decision.projectId) {
          await sendDesignerNotification(decision.id, decision.projectId, 'approved').catch(console.error);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to submit approval.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitConcern = async () => {
    if (!clientName.trim()) {
        setError("Please provide your name.");
        return;
    }
    if (!queryText.trim()) {
        setError("Please describe your concern.");
        return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await recordClientSignoff(token, 'queried', clientName, queryText, window.location.hostname);
      setSuccessName(clientName);
      setSuccessState('queried');
      if (decision && decision.id && decision.projectId) {
          await sendDesignerNotification(decision.id, decision.projectId, 'queried').catch(console.error);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to submit concern.');
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
            <p className="text-slate-600 font-medium">Loading your approval request...</p>
        </div>
      </div>
    );
  }

  if (isExpired || !decision) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
          <div className="max-w-md bg-white p-6 rounded-xl shadow-sm border border-slate-200 text-center">
             <p className="text-slate-700 font-medium">This approval link has expired or is no longer valid. Please contact {STUDIO_NAME} for a new link.</p>
          </div>
      </div>
    );
  }

  // ALREADY RESPONDED or SUCCESS states
  const hasRespondedInitially = decision.signoff?.type !== null || ['signed', 'disputed'].includes(decision.status);
  const showRespondedState = hasRespondedInitially || successState !== null;

  if (showRespondedState) {
      let finalState = successState || decision.signoff?.type;
      let dateResponded = decision.signoff?.respondedAt 
        ? format(decision.signoff.respondedAt.toDate(), "dd MMM yyyy, p") 
        : 'recently';

      if (successState) {
        if (successState === 'approved') {
            return (
                <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 text-center">
                    <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-sm border border-emerald-200">
                        <div className="mx-auto w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        </div>
                        <h2 className="text-xl font-semibold text-slate-800 mb-2">Thank you, {successName}.</h2>
                        <p className="text-slate-600">Your approval has been recorded. {STUDIO_NAME} will be notified.</p>
                    </div>
                </div>
            )
        } else {
             return (
                <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 text-center">
                    <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-sm border border-amber-200">
                        <div className="mx-auto w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-4">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                        </div>
                        <h2 className="text-xl font-semibold text-slate-800 mb-2">Your concern has been submitted.</h2>
                        <p className="text-slate-600">{STUDIO_NAME} will get back to you within 24 hours.</p>
                    </div>
                </div>
            )
        }
      }

      // Initial already-responded state fallback
      return (
         <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
            <div className="max-w-md bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-lg font-semibold text-slate-800 mb-2">Sign-off Complete</h3>
                <p className="text-slate-600 mb-4">You have already responded to this request on {dateResponded}. Thank you.</p>
                <div className={`px-4 py-3 rounded-lg text-sm font-medium ${finalState === 'approved' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
                    Your response: {finalState === 'approved' ? 'Approved' : 'Raised a Concern'}
                </div>
            </div>
         </div>
      );
  }

  // Active Signoff Request Layout
  const formattedCreationDate = decision.createdAt?.toDate 
        ? format(decision.createdAt.toDate(), "dd MMM yyyy") 
        : 'recent date';
        
  const isImageFile = decision.drawingURL ? decision.drawingURL.match(/\.(jpeg|jpg|gif|png)/i) != null : false;

  return (
      <div className="min-h-screen bg-slate-50 flex justify-center py-8 px-4 font-sans">
          <div className="w-full max-w-[540px] flex flex-col gap-6">
              {/* Header */}
              <div className="text-center">
                  {STUDIO_LOGO_URL ? (
                      <img src={STUDIO_LOGO_URL} alt={STUDIO_NAME} className="h-12 mx-auto mb-4" />
                  ) : (
                      <h1 className="text-2xl font-bold text-slate-900 mb-4">{STUDIO_NAME}</h1>
                  )}
                  <h2 className="text-xl font-semibold text-slate-800">Design approval request</h2>
                  <p className="text-slate-500 mt-1">{decision.projectName} · {decision.clientName || 'Client'}</p>
              </div>

              {/* Decision Card */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="p-5 bg-slate-50 border-b border-slate-200">
                     <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">What was discussed and agreed</h3>
                     <p className="text-slate-800 text-[15px] leading-relaxed whitespace-pre-wrap">{decision.decisionText}</p>
                     
                     <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium">
                         <span className="bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-md">{decision.roomName}</span>
                         <span className="bg-slate-200 text-slate-700 px-2.5 py-1 rounded-md">{formattedCreationDate}</span>
                         <span className="bg-slate-200 text-slate-700 px-2.5 py-1 rounded-md">{decision.category}</span>
                     </div>
                  </div>

                  {/* Site Photo */}
                  {decision.photoURL && (
                      <div className="p-5 border-b border-slate-100">
                          <img src={decision.photoURL} alt="Site capture" className="w-full h-auto rounded-lg mb-2" />
                          <p className="text-xs text-slate-500 text-center">Photo from site visit</p>
                      </div>
                  )}

                  {/* Updated Drawing */}
                  {decision.drawingURL && (
                      <div className="p-5 border-b border-slate-100 bg-blue-50/30">
                          <h4 className="text-sm font-semibold text-slate-800 mb-3">Updated Drawing</h4>
                          {isImageFile ? (
                              <img src={decision.drawingURL} alt="Updated Drawing" className="w-full h-auto rounded border border-slate-200" />
                          ) : (
                              <a href={decision.drawingURL} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 transition py-3 rounded-lg font-medium shadow-sm w-full">
                                  <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                  View updated drawing or link
                              </a>
                          )}
                      </div>
                  )}

                  {/* Interaction Form */}
                  <div className="p-5 bg-white">
                      <div className="mb-5 border-b border-slate-100 pb-5">
                          <label className="block text-sm font-medium text-slate-700 mb-1">Your name</label>
                          <input 
                              type="text" 
                              value={clientName}
                              onChange={(e) => setClientName(e.target.value)}
                              className="w-full border-slate-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 py-2.5 px-3"
                              placeholder="Enter your name"
                              disabled={submitting}
                          />
                      </div>

                      {error && (
                          <div className="mb-4 bg-red-50 text-red-600 text-sm p-3 rounded-md border border-red-100">
                              {error}
                          </div>
                      )}

                      {!showConcernForm ? (
                          <div className="flex flex-col gap-3">
                              <button 
                                  onClick={handleApprove}
                                  disabled={submitting}
                                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3.5 rounded-lg font-bold shadow-sm transition disabled:opacity-70"
                              >
                                  I approve this design change
                              </button>
                              <button 
                                  onClick={() => setShowConcernForm(true)}
                                  className="w-full bg-white border-2 border-amber-500 hover:bg-amber-50 text-amber-700 py-3 rounded-lg font-semibold transition"
                              >
                                  Send back to FFDS for review
                              </button>
                          </div>
                      ) : (
                          <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                              <label className="block text-sm font-bold text-slate-800">Please describe your concern:</label>
                              <textarea
                                  value={queryText}
                                  onChange={(e) => setQueryText(e.target.value)}
                                  className="w-full border-slate-300 rounded-md shadow-sm p-3 min-h-[120px] focus:ring-amber-500 focus:border-amber-500"
                                  placeholder="e.g. Can we move the switchboard to the left instead?"
                                  disabled={submitting}
                              />
                              <div className="flex gap-2">
                                  <button 
                                      onClick={() => setShowConcernForm(false)}
                                      disabled={submitting}
                                      className="w-1/3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 py-3 rounded-lg font-medium transition"
                                  >
                                      Cancel
                                  </button>
                                  <button 
                                      onClick={handleSubmitConcern}
                                      disabled={submitting}
                                      className="w-2/3 bg-amber-500 hover:bg-amber-600 text-white py-3 rounded-lg font-bold shadow-sm transition disabled:opacity-70"
                                  >
                                      {submitting ? 'Submitting...' : 'Submit concern'}
                                  </button>
                              </div>
                          </div>
                      )}

                      <p className="mt-6 text-[12px] text-slate-400 leading-relaxed text-center">
                          By approving, you confirm this design change was agreed during the site visit. Your name, {window.location.hostname}, and timestamp will be recorded as confirmation.
                      </p>
                  </div>
              </div>

              {/* Footer */}
              <div className="text-center flex flex-col gap-2 mt-4 text-sm text-slate-500">
                  <p>Questions? Contact us at <br/>
                    {STUDIO_PHONE}
                  </p>
                  <p className="mt-8 text-xs font-semibold text-slate-400 tracking-wider">POWERED BY BOQ COPILOT</p>
              </div>
          </div>
      </div>
  );
}

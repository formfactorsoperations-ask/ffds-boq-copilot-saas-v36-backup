import React, { useEffect, useState } from 'react';
import { getDoc, doc, updateDoc, collection, getDocs } from 'firebase/firestore';
import { db as firestore } from '../services/firebaseClient';
import { db as dbService } from '../services/dbService';
import { formatINR } from '../lib/utils';
import { DigitalSignatureDocket, ProjectContext, SignoffRecord, FullProjectData } from '../types';
import DigitalSignaturePad from './common/DigitalSignaturePad';
import DigitalSignatureDocketView from './common/DigitalSignatureDocket';
import { buildSignoffPatch, AgreementKind } from '../services/clientApprovalEngine';
import pako from 'pako';
import { 
  Building2, 
  FileText, 
  CheckCircle2, 
  ShieldCheck, 
  MapPin, 
  Calendar, 
  Printer, 
  Download, 
  AlertCircle, 
  HelpCircle, 
  Clock, 
  Sparkles 
} from 'lucide-react';

interface AgreementSignoffPageProps {
  token: string;
}

type SignoffDocType = 'execution' | 'design' | 'terms' | 'proposal' | 'handover' | 'contract';

function decompressProjectData(data: any): any {
  if (!data) return null;
  if (typeof data === 'string') {
    try {
      const cleanBase64 = data.startsWith('COMPRESSED:') ? data.replace('COMPRESSED:', '') : data;
      const binary = atob(cleanBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const decompressed = pako.inflate(bytes, { to: 'string' });
      return JSON.parse(decompressed);
    } catch (e) {
      try {
        return JSON.parse(data);
      } catch (jsonErr) {
        console.warn('Decompress warning in signoff:', e);
        return null;
      }
    }
  }
  if (data && (Array.isArray(data) || typeof data === 'object')) {
    try {
      const bytes = new Uint8Array(Object.values(data));
      const decompressed = pako.inflate(bytes, { to: 'string' });
      return JSON.parse(decompressed);
    } catch (e) {
      return data;
    }
  }
  return data;
}

export default function AgreementSignoffPage({ token: initialToken }: AgreementSignoffPageProps) {
  const [token, setToken] = useState(initialToken);
  const [loading, setLoading] = useState(true);
  const [projectContext, setProjectContext] = useState<any>(null);
  const [fullProjectData, setFullProjectData] = useState<FullProjectData | null>(null);
  const [projectId, setProjectId] = useState<string>('');
  const [isExpired, setIsExpired] = useState(false);
  const [docType, setDocType] = useState<SignoffDocType>('execution');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingDocket, setExistingDocket] = useState<DigitalSignatureDocket | null>(null);
  const [studioSettings, setStudioSettings] = useState<any>(null);
  
  // PIN Verification / Zero-Click Lookup State
  const [pinLookupInput, setPinLookupInput] = useState('');
  const [isSearchingPin, setIsSearchingPin] = useState(false);
  const [pinLookupError, setPinLookupError] = useState<string | null>(null);

  const resolveProjectFromTokenOrPin = async (lookupKey: string) => {
    try {
      setLoading(true);
      const cleanKey = lookupKey.trim();
      let detectedType: SignoffDocType = 'execution';

      const upperKey = cleanKey.toUpperCase();
      if (upperKey.includes('DESIGN')) detectedType = 'design';
      else if (upperKey.includes('TERMS')) detectedType = 'terms';
      else if (upperKey.includes('PROPOSAL')) detectedType = 'proposal';
      else if (upperKey.includes('HANDOVER')) detectedType = 'handover';
      else if (upperKey.includes('CONTRACT')) detectedType = 'contract';
      else if (upperKey.includes('EXEC')) detectedType = 'execution';

      // Build comprehensive list of candidate project IDs
      const candidateIds: string[] = [];
      if (cleanKey) candidateIds.push(cleanKey);

      // Strip known prefixes
      const strippedPrefix = cleanKey.replace(
        /^(EXECUTION_AGREEMENT_|EXEC_AGREEMENT_|EXEC_|DESIGN_AGREEMENT_|DESIGN_|TERMS_AGREEMENT_|TERMS_|PROPOSAL_AGREEMENT_|PROPOSAL_|HANDOVER_AGREEMENT_|HANDOVER_|AGREEMENT_)/i,
        ''
      );
      if (strippedPrefix && strippedPrefix !== cleanKey) {
        candidateIds.push(strippedPrefix);
        const lastIdx = strippedPrefix.lastIndexOf('_');
        if (lastIdx > 0) {
          candidateIds.push(strippedPrefix.substring(0, lastIdx));
        }
      }

      // Slices for underscore-delimited tokens
      const parts = cleanKey.split('_');
      if (parts.length >= 2) {
        for (let i = 0; i < parts.length; i++) {
          for (let j = i + 1; j <= parts.length; j++) {
            const sliceStr = parts.slice(i, j).join('_');
            if (sliceStr && sliceStr.length >= 3 && !candidateIds.includes(sliceStr)) {
              candidateIds.push(sliceStr);
            }
          }
        }
      }

      let resolvedProject: FullProjectData | null = null;

      const hydrateRawProject = (docId: string, pData: any): FullProjectData => {
        let decompressed = pData;
        if (pData.compressedData) {
          const dec = decompressProjectData(pData.compressedData);
          if (dec) decompressed = dec;
        }
        const ctx = decompressed.context || decompressed.projectContext || pData.context || {};
        return {
          id: decompressed.id || pData.id || docId,
          lastModified: decompressed.lastModified || pData.lastModified || Date.now(),
          context: ctx,
          tiers: decompressed.tiers || pData.tiers || [],
          activeTierId: decompressed.activeTierId || pData.activeTierId || null,
          activeProject: decompressed.activeProject || pData.activeProject || null,
          materials: decompressed.materials || pData.materials || [],
          timeline: decompressed.timeline || pData.timeline || [],
          tenantId: decompressed.tenantId || pData.tenantId,
          leadProfile: decompressed.leadProfile || pData.leadProfile,
          decisionBrainOutput: decompressed.decisionBrainOutput || pData.decisionBrainOutput
        } as FullProjectData;
      };

      const projectMatches = (p: FullProjectData | null): boolean => {
        if (!p || !p.context) return false;
        const ctx = (p.context || {}) as any;
        const matchToken = (
          ctx.executionSignoff?.token === cleanKey ||
          ctx.designAgreementSignoff?.token === cleanKey ||
          ctx.termsSignoff?.token === cleanKey ||
          ctx.proposalSignoff?.token === cleanKey ||
          ctx.handoverSignoff?.token === cleanKey ||
          ctx.contractSignoff?.token === cleanKey
        );
        const matchPin = (
          ctx.executionSignoff?.accessPin?.toUpperCase() === cleanKey.toUpperCase() ||
          ctx.designAgreementSignoff?.accessPin?.toUpperCase() === cleanKey.toUpperCase() ||
          ctx.termsSignoff?.accessPin?.toUpperCase() === cleanKey.toUpperCase() ||
          ctx.proposalSignoff?.accessPin?.toUpperCase() === cleanKey.toUpperCase() ||
          ctx.handoverSignoff?.accessPin?.toUpperCase() === cleanKey.toUpperCase()
        );
        const matchEmail = ctx.clientEmail && ctx.clientEmail.toLowerCase() === cleanKey.toLowerCase();
        const matchId = candidateIds.includes(p.id);
        return Boolean(matchToken || matchPin || matchEmail || matchId);
      };

      // 1. Direct Firestore Document Lookups for candidate IDs
      if (firestore) {
        try {
          for (const candId of candidateIds) {
            if (!candId) continue;
            try {
              const projectRef = doc(firestore, 'projects', candId);
              const snap = await getDoc(projectRef);
              if (snap.exists()) {
                const parsed = hydrateRawProject(snap.id, snap.data());
                if (parsed) {
                  resolvedProject = parsed;
                  break;
                }
              }
            } catch (candErr) {
              console.warn(`Direct fetch for ${candId} failed:`, candErr);
            }
          }
        } catch (e) {
          console.warn("Direct candidates lookup failed:", e);
        }
      }

      // 2. Direct Firestore Collection Scan (cross-tenant project match for tokens/PINs)
      if (!resolvedProject && firestore) {
        try {
          const snapshot = await getDocs(collection(firestore, 'projects'));
          for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            const hydrated = hydrateRawProject(docSnap.id, data);
            if (projectMatches(hydrated)) {
              resolvedProject = hydrated;
              break;
            }
          }
        } catch (colErr) {
          console.warn("Firestore collection scan warning:", colErr);
        }
      }

      // 3. Fetch via dbService
      if (!resolvedProject) {
        try {
          const allProjects = await dbService.getProjects();
          resolvedProject = allProjects.find(p => projectMatches(p)) || null;
        } catch (dbErr) {
          console.warn("dbService fetch warning:", dbErr);
        }
      }

      // 4. Fallback: LocalStorage / IndexedDB scan
      if (!resolvedProject) {
        try {
          const raw = localStorage.getItem('ffds_projects') || localStorage.getItem('boq_projects_backup');
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              resolvedProject = parsed.find((p: any) => projectMatches(p)) || null;
            }
          }
        } catch (lsErr) {
          console.warn("Local storage project scan warning:", lsErr);
        }
      }

      if (!resolvedProject || !resolvedProject.context) {
        setIsExpired(true);
        setLoading(false);
        return false;
      }

      // Auto-detect document type from PIN or context
      const ctx = (resolvedProject.context || {}) as any;
      if (ctx.executionSignoff?.accessPin?.toUpperCase() === cleanKey.toUpperCase() || ctx.executionSignoff?.token === cleanKey) {
        detectedType = 'execution';
      } else if (ctx.designAgreementSignoff?.accessPin?.toUpperCase() === cleanKey.toUpperCase() || ctx.designAgreementSignoff?.token === cleanKey) {
        detectedType = 'design';
      } else if (ctx.termsSignoff?.accessPin?.toUpperCase() === cleanKey.toUpperCase() || ctx.termsSignoff?.token === cleanKey) {
        detectedType = 'terms';
      } else if (ctx.proposalSignoff?.accessPin?.toUpperCase() === cleanKey.toUpperCase() || ctx.proposalSignoff?.token === cleanKey) {
        detectedType = 'proposal';
      } else if (ctx.handoverSignoff?.accessPin?.toUpperCase() === cleanKey.toUpperCase() || ctx.handoverSignoff?.token === cleanKey) {
        detectedType = 'handover';
      } else if (upperKey.includes('EXEC')) {
        detectedType = 'execution';
      } else if (upperKey.includes('DESIGN')) {
        detectedType = 'design';
      } else if (upperKey.includes('TERMS')) {
        detectedType = 'terms';
      } else if (upperKey.includes('PROPOSAL')) {
        detectedType = 'proposal';
      } else if (upperKey.includes('HANDOVER')) {
        detectedType = 'handover';
      }

      setProjectId(resolvedProject.id);
      setDocType(detectedType);
      setFullProjectData(resolvedProject);
      setProjectContext(ctx);

      // Check matching signoff record
      let targetSignoff: SignoffRecord | undefined;
      if (detectedType === 'execution') targetSignoff = ctx.executionSignoff;
      else if (detectedType === 'design') targetSignoff = ctx.designAgreementSignoff;
      else if (detectedType === 'terms') targetSignoff = ctx.termsSignoff;
      else if (detectedType === 'proposal') targetSignoff = ctx.proposalSignoff;
      else if (detectedType === 'handover') targetSignoff = ctx.handoverSignoff;
      else targetSignoff = ctx.contractSignoff;

      if (targetSignoff?.status === 'signed') {
        if (targetSignoff.docket) {
          setExistingDocket(targetSignoff.docket);
        } else {
          setExistingDocket({
            signatoryName: targetSignoff.clientName || ctx.clientName || 'Client',
            signatoryEmail: targetSignoff.clientEmail || ctx.clientEmail,
            signedAt: targetSignoff.signedAt || new Date().toISOString(),
            signatureType: targetSignoff.signatureType || 'draw',
            signatureDataUrl: targetSignoff.signatureDataUrl,
            ipAddress: targetSignoff.ipAddress || 'Client Portal Web',
            docketHash: `SHA256:${targetSignoff.refId || 'SEALED_VERIFIED_SIGNATURE'}`,
            verified: true,
            legalAffirmation: true
          });
        }
      } else {
        setExistingDocket(null);
      }

      // Fetch Studio Settings
      try {
        const tenantId = resolvedProject.tenantId || ctx.tenantId || 'demo-tenant-01';
        if (firestore) {
          const settingsRef = doc(firestore, 'studioSettings', tenantId);
          const settingsSnap = await getDoc(settingsRef);
          if (settingsSnap.exists()) {
            setStudioSettings(settingsSnap.data());
          }
        }
      } catch (settingsErr) {
        console.warn("Error fetching studio settings:", settingsErr);
      }

      setIsExpired(false);
      setLoading(false);
      return true;
    } catch (err: any) {
      console.error("Resolution error:", err);
      setIsExpired(true);
      setLoading(false);
      return false;
    }
  };

  useEffect(() => {
    resolveProjectFromTokenOrPin(token);
  }, [token]);

  const handleManualPinLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinLookupInput.trim()) return;
    setIsSearchingPin(true);
    setPinLookupError(null);
    try {
      const found = await resolveProjectFromTokenOrPin(pinLookupInput.trim());
      if (!found) {
        setPinLookupError('No matching document found for this PIN or Email. Please check the code and try again.');
      } else {
        setToken(pinLookupInput.trim());
      }
    } catch (err: any) {
      setPinLookupError(err.message || 'Lookup failed.');
    } finally {
      setIsSearchingPin(false);
    }
  };

  const studioName = studioSettings?.companyName || studioSettings?.studioName || import.meta.env.VITE_STUDIO_NAME || 'The Studio';
  const studioPhone = studioSettings?.phone || import.meta.env.VITE_STUDIO_PHONE || '';
  const studioLogo = studioSettings?.logoUrl || import.meta.env.VITE_STUDIO_LOGO_URL || '';

  const getDocTitle = () => {
    switch (docType) {
      case 'execution': return 'Integrated Interior Execution Agreement';
      case 'design': return 'Comprehensive Design Agreement';
      case 'terms': return 'Terms & Conditions Governance Docket';
      case 'proposal': return 'Client Commercial Proposal & Scope Authorization';
      case 'handover': return 'Project Handover & Warranty Docket';
      default: return 'Contract & Execution Agreement';
    }
  };

  const handleSignatureSubmit = async (docket: DigitalSignatureDocket) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const signoffUpdate: SignoffRecord = {
        status: 'signed',
        token: token,
        signedAt: docket.signedAt || new Date().toISOString(),
        clientName: docket.signatoryName || projectContext?.clientName || 'Client',
        clientEmail: docket.signatoryEmail || projectContext?.clientEmail,
        ipAddress: docket.ipAddress || 'Client Portal Web',
        refId: docket.docketHash || `SHA256:${Date.now()}`,
        signatureType: docket.signatureType,
        signatureDataUrl: docket.signatureDataUrl,
        docket: docket
      };

      const now = Date.now();
      const currentProject = fullProjectData || {
        id: projectId,
        lastModified: now,
        context: projectContext || {}
      } as FullProjectData;

      // The external signature link historically wrote a single field per doc
      // type, which left the studio workspace and the client portal reading
      // different keys. Everything now goes through the canonical writer, which
      // updates every alias plus engagement.status and the lifecycle gate.
      const agreementKind: AgreementKind =
        docType === 'execution' || docType === 'contract' ? 'contract'
        : docType === 'handover' ? 'handover'
        : 'terms';

      const canonicalContext = buildSignoffPatch(agreementKind, docket, { surface: 'signoff_link' })(
        (currentProject.context || {}) as ProjectContext
      );

      const updatedContext: ProjectContext = {
        ...canonicalContext,
        // preserve the token so the link stays resolvable for re-viewing
        ...(docType === 'execution' ? { executionSignoff: { ...signoffUpdate } } : {}),
        ...(docType === 'design' ? { designAgreementSignoff: { ...signoffUpdate } } : {}),
        ...(docType === 'terms' ? { termsSignoff: { ...signoffUpdate } } : {}),
        ...(docType === 'proposal' ? { proposalSignoff: { ...signoffUpdate } } : {}),
        ...(docType === 'handover' ? { handoverSignoff: { ...signoffUpdate } } : {}),
        ...(docType === 'contract' ? { contractSignoff: { ...signoffUpdate } } : {}),
      };

      const defaultGates = {
        proposalAccepted: { done: false, at: null, reference: null },
        contractSigned: { done: false, at: null, reference: null },
        designGateActive: { done: false, at: null, reference: null },
        handoverComplete: { done: false, at: null, reference: null }
      };

      // Ensure lifecycle stage updates appropriately on client signoff
      if (!updatedContext.lifecycle) {
        updatedContext.lifecycle = {
          stage: 1,
          subState: 'Active',
          enteredStageAt: now,
          gates: { ...defaultGates },
          updatedAt: now
        };
      }
      if (!updatedContext.lifecycle.gates) {
        updatedContext.lifecycle.gates = { ...defaultGates };
      }

      if (docType === 'execution' || docType === 'contract') {
        updatedContext.lifecycle.gates.contractSigned = {
          done: true,
          at: now,
          reference: docket.docketHash
        };
        if (updatedContext.lifecycle.stage < 4) {
          updatedContext.lifecycle.stage = 4;
        }
      } else if (docType === 'design' || docType === 'proposal') {
        updatedContext.lifecycle.gates.proposalAccepted = {
          done: true,
          at: now,
          reference: docket.docketHash
        };
        if (updatedContext.lifecycle.stage < 2) {
          updatedContext.lifecycle.stage = 2;
        }
      } else if (docType === 'handover') {
        updatedContext.lifecycle.gates.handoverComplete = {
          done: true,
          at: now,
          reference: docket.docketHash
        };
        updatedContext.lifecycle.stage = 7;
      }

      const updatedProject: FullProjectData = {
        ...currentProject,
        lastModified: now,
        context: updatedContext
      };

      // 1. Save via unified dbService (IndexedDB + Cloud with compression & multi-tenant isolation)
      await dbService.saveProject(updatedProject);

      // 2. Direct cloud sync fallback for external viewers
      if (firestore && projectId) {
        try {
          const tenantId = updatedProject.tenantId || 'demo-tenant-01';
          const fieldKey = docType === 'execution' ? 'context.executionSignoff'
            : docType === 'design' ? 'context.designAgreementSignoff'
            : docType === 'terms' ? 'context.termsSignoff'
            : docType === 'proposal' ? 'context.proposalSignoff'
            : docType === 'handover' ? 'context.handoverSignoff'
            : 'context.contractSignoff';

          const directPayload: any = {
            [fieldKey]: signoffUpdate,
            lastModified: now
          };

          // Mirror the canonical fields so a studio session that only reads
          // Firestore (never IndexedDB) also sees the signature.
          if (agreementKind === 'terms') {
            directPayload['context.termsSignoff'] = signoffUpdate;
            directPayload['context.designAgreementSignoff'] = signoffUpdate;
            directPayload['context.termsDockets'] = updatedContext.termsDockets || [];
            directPayload['context.engagement'] = (updatedContext as any).engagement || null;
          } else if (agreementKind === 'contract') {
            directPayload['context.executionSignoff'] = signoffUpdate;
            directPayload['context.executionAgreementSignoff'] = signoffUpdate;
            directPayload['context.contractSignoff'] = signoffUpdate;
            directPayload['context.contractStatus'] = 'executed';
          } else {
            directPayload['context.handoverSignoff'] = signoffUpdate;
            directPayload['context.handoverDocketSignoff'] = signoffUpdate;
            directPayload['context.handoverDate'] = updatedContext.handoverDate || now;
          }
          directPayload['context.lifecycle'] = updatedContext.lifecycle;

          await updateDoc(doc(firestore, 'organizations', tenantId, 'projects', projectId), directPayload).catch(() => {});
          await updateDoc(doc(firestore, 'projects', projectId), directPayload).catch(() => {});
        } catch (cloudErr) {
          console.warn("Direct firestore background sync bypassed:", cloudErr);
        }
      }

      setFullProjectData(updatedProject);
      setProjectContext(updatedContext);
      setExistingDocket(docket);
    } catch (err: any) {
      console.error("Signature save error:", err);
      setError(err.message || 'Failed to record signature. Please check connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-10 h-10 border-3 border-[#3D52A0] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-600 font-bold text-sm">Loading secure digital agreement...</p>
        </div>
      </div>
    );
  }

  if (isExpired || !projectContext) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-sm border border-slate-200 text-center space-y-6">
          <div className="w-12 h-12 bg-sky-50 text-[#3D52A0] rounded-full flex items-center justify-center mx-auto">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#3D52A0] block mb-1">
              Zero-Click Anti-Phishing Portal
            </span>
            <h2 className="text-xl font-black text-slate-900">Verify Document by Access PIN</h2>
            <p className="text-xs text-slate-600 leading-relaxed mt-1">
              If you received a document notification from <strong className="text-slate-800">{studioName}</strong>, enter your Document Access PIN or registered email address below to open and sign securely.
            </p>
          </div>

          <form onSubmit={handleManualPinLookup} className="space-y-3 text-left">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                Document Access PIN or Email
              </label>
              <input
                type="text"
                value={pinLookupInput}
                onChange={(e) => setPinLookupInput(e.target.value)}
                placeholder="e.g. SEC-8492 or client@email.com"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-900 focus:outline-none focus:border-[#3D52A0] focus:ring-1 focus:ring-[#3D52A0]"
              />
            </div>

            {pinLookupError && (
              <p className="text-[11px] text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-200">
                {pinLookupError}
              </p>
            )}

            <button
              type="submit"
              disabled={isSearchingPin || !pinLookupInput.trim()}
              className="w-full py-2.5 bg-[#3D52A0] hover:bg-[#334486] disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
            >
              {isSearchingPin ? 'Verifying Credentials...' : 'Verify & Open Document →'}
            </button>
          </form>

          {studioPhone && (
            <div className="pt-3 border-t border-slate-100 text-xs text-slate-500">
              Need verbal confirmation? Studio Contact: <strong className="text-slate-800">{studioPhone}</strong>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-800 py-8 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Top Studio Brand Header */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            {studioLogo ? (
              <img src={studioLogo} alt={studioName} className="h-10 object-contain" />
            ) : (
              <div className="p-2.5 bg-slate-900 text-white rounded-2xl">
                <Building2 className="w-6 h-6" />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#3D52A0]">
                  Digital Document Authorization
                </span>
                <span className="text-[10px] font-bold text-slate-400 font-mono">256-BIT SSL ENCRYPTED</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900">
                {studioName}
              </h1>
            </div>
          </div>

          <div className="text-left sm:text-right text-xs">
            <span className="text-slate-400 block font-medium">Project Site</span>
            <span className="font-bold text-slate-800 text-sm">
              {projectContext.name || 'Interior Design Project'}
            </span>
            {projectContext.location && (
              <span className="text-slate-500 block text-[11px] mt-0.5">
                {projectContext.location}
              </span>
            )}
          </div>
        </div>

        {/* ALREADY SIGNED / EXECUTED STATE */}
        {existingDocket ? (
          <div className="space-y-6">
            <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-6 text-center space-y-2">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-black text-emerald-900">
                Document Digitally Executed & Sealed
              </h2>
              <p className="text-xs text-emerald-800 max-w-xl mx-auto">
                This document has been authorized and digitally signed. A legal audit certificate is attached below for your records.
              </p>
            </div>

            <DigitalSignatureDocketView
              docket={existingDocket}
              documentTitle={getDocTitle()}
              projectId={projectId}
              projectName={projectContext.name}
              studioName={studioName}
            />

            <div className="flex justify-center gap-3 pt-2 no-print">
              <button
                onClick={() => window.print()}
                className="px-6 py-2.5 bg-[#3D52A0] hover:bg-[#334486] text-white text-xs font-bold rounded-xl shadow-md flex items-center gap-2 transition cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print Certificate / Save PDF</span>
              </button>
            </div>
          </div>
        ) : (
          /* AWAITING SIGNATURE STATE */
          <div className="space-y-6">
            
            {/* Document Summary Docket */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6 text-left">
              <div className="border-b border-slate-100 pb-4">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#3D52A0]">
                  Document Review
                </span>
                <h2 className="text-2xl font-serif font-bold text-slate-900 mt-1">
                  {getDocTitle()}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Please review the project summary and core commercial terms below prior to affixing your digital signature.
                </p>
              </div>

              {/* Key Project Information Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200/80 text-xs">
                <div>
                  <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] block mb-0.5">
                    Client Signatory
                  </span>
                  <strong className="text-slate-900 text-sm font-extrabold block">
                    {projectContext.clientName || 'Client Party'}
                  </strong>
                  {projectContext.clientEmail && (
                    <span className="text-slate-500 text-[11px] block">{projectContext.clientEmail}</span>
                  )}
                </div>

                <div>
                  <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] block mb-0.5">
                    Project Scope & Site
                  </span>
                  <strong className="text-slate-800 font-bold block">
                    {projectContext.name}
                  </strong>
                  <span className="text-slate-500 text-[11px] block">
                    {projectContext.location || 'Site Location'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] block mb-0.5">
                    Scope Governance
                  </span>
                  <strong className="text-slate-800 font-bold block">
                    GFC Drawings & Approved BOQ
                  </strong>
                  <span className="text-slate-500 text-[11px] block">
                    Turnkey Fitout Standard
                  </span>
                </div>
              </div>

              {/* Document Key Terms Box */}
              <div className="space-y-3 text-xs text-slate-700 leading-relaxed">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                  Key Clauses & Milestone Obligations
                </h4>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/70 space-y-2">
                  <p>
                    <strong>1. Scope of Works:</strong> The Studio agrees to execute interior works strictly matching the agreed BOQ and GFC drawing specifications.
                  </p>
                  <p>
                    <strong>2. Milestone Governance:</strong> Material procurement and site mobilization commence strictly upon receipt of the initial advance payment. Subsequent phases trigger according to physical stage gates.
                  </p>
                  <p>
                    <strong>3. Electronic Signature Validity:</strong> Under the Information Technology Act, electronic acceptance via digital signature holds full legal enforceability.
                  </p>
                </div>
              </div>

              {error && (
                <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            {/* Interactive Digital Signature Pad */}
            <DigitalSignaturePad
              initialName={projectContext.clientName || ''}
              initialEmail={projectContext.clientEmail || ''}
              documentTitle={getDocTitle()}
              projectTitle={projectContext.name}
              onSignComplete={handleSignatureSubmit}
              isSubmitting={isSubmitting}
            />

          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-slate-400 pt-4 pb-8 space-y-1">
          <p>Powered by BOQ Copilot Enterprise • Multi-Tenant Studio Suite</p>
          <p>© {new Date().getFullYear()} {studioName}. All Rights Reserved.</p>
        </div>

      </div>
    </div>
  );
}

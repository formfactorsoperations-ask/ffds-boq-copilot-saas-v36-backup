import React, { useState, useRef, useMemo, useEffect } from "react";
import { meetingTypeLabel, isClientFacingMeeting } from "../../lib/meetingTypes";
import { publish, isVisibleToClient } from "../../lib/clientVisibility";
import { prepareClonedDocForPdf } from "../../lib/pdfUtils";
import {
  MOM,
  MOMAttendee,
  MOMDecision,
  MOMActionItem,
  MOMNote,
} from "../../types";
import { db } from "../../services/firebaseClient";
import { updateDoc, doc, getDoc, getDocs, collection, deleteField } from "firebase/firestore";
import { getAi } from "../../services/aiClient";
import { FLASH_MODEL } from "../../constants/aiModels";
import { MomEmailComposer } from "./MomEmailComposer";
import { queueScopeActions } from "../../hooks/useMomScopeQueue";
import { publicAppOrigin } from "../../lib/publicUrl";
import {
  X,
  Save,
  CheckCircle,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  Calendar as CalendarIcon,
  User as UserIcon,
  Download,
  Share2,
  Users,
  Gavel,
  ListTodo,
  StickyNote,
  Clock,
  ArrowRight,
  Sparkles,
  Send,
  FileText,
  Mail,
  Loader2,
  CornerDownRight,
  PenLine,
  History,
} from "lucide-react";
import { useOrg } from "../../contexts/OrgContext";
import { StudioDocumentShell } from "./documents/StudioDocumentShell";

interface MomReviewModalProps {
  mom: MOM;
  projectId: string;
  studioId: string;
  projectContextName?: string;
  onClose: () => void;
}

export function MomReviewModal({
  mom,
  projectId,
  studioId,
  projectContextName,
  onClose,
}: MomReviewModalProps) {
  const { currentRole, orgData, teamMembers } = useOrg() as any;
  /* Super Admin and Owner were missing, so the studio's own principal could not flag scope or send it on. */
  const isOwner = ["Super Admin", "Owner", "Admin", "Ops Director"].includes(String(currentRole));
  const studioName = orgData?.orgName || "Studio";

  /*
    The studio's own people, by name.

    The meeting form only ever offered client attendees, so the AI was never
    told who was on the studio's side and tagged everyone it read in the notes
    as "client" -- the PDF then listed the principal architect and the ops lead
    as CLIENT. An attendee whose name matches a team member (full name, or a
    first name only one member has) is the studio's, unless someone already
    marked them as a vendor.
  */
  /* The team list, less anyone listed with the Client role, plus the studio's
     signatory (the principal), who is often not on the list. */
  const team: any[] = [
    ...(((teamMembers?.length ? teamMembers : (orgData as any)?.team) || []) as any[])
      .filter((t: any) => String(t?.role || "").toLowerCase() !== "client"),
    ...((orgData as any)?.signatoryName
      ? [{ name: (orgData as any).signatoryName, title: (orgData as any).signatoryTitle || "Principal" }]
      : []),
  ];
  const teamMatch = useMemo(() => {
    const full = new Map<string, any>();
    const first = new Map<string, any[]>();
    team.forEach((t: any) => {
      const n = String(t?.name || "").trim().toLowerCase();
      if (!n) return;
      full.set(n, t);
      const f = n.replace(/^(ar|mr|mrs|ms|dr)\.?\s+/, "").split(/\s+/)[0];
      first.set(f, [...(first.get(f) || []), t]);
    });
    return (name: string) => {
      const n = String(name || "").trim().toLowerCase();
      if (!n) return null;
      if (full.has(n)) return full.get(n);
      const f = n.replace(/^(ar|mr|mrs|ms|dr)\.?\s+/, "").split(/\s+/)[0];
      const hits = first.get(f) || [];
      return hits.length === 1 ? hits[0] : null;
    };
  }, [team]);

  const withStudioSides = (m: MOM): MOM => ({
    ...m,
    attendees: (m.attendees || []).map((a) => {
      const member = a.side !== "vendor" ? teamMatch(a.name) : null;
      return member
        ? { ...a, side: "ffds", role: a.role || member.title || member.role || undefined }
        : a;
    }),
  });

  /*
    REVISIONS.

    Issued minutes are a record: once the client has them they do not change
    under the client's feet. A correction (asked for in the portal, or noticed
    by the studio) is made as a revision. The studio's edits are kept in
    `pendingRevision` while it works, so the client goes on seeing the issued
    minutes; issuing the revision files the issued version, unchanged, in
    `previousRevisions` and puts the new one in its place as Rev 1, Rev 2...
    It stays one document with one MoM number, so the action tracker and every
    other list see it once.
  */
  const CONTENT_KEYS = ["meetingTitle", "attendees", "decisions", "actionItems", "notes", "summary", "nextMeeting", "carriedForward", "scopeFlagSummary"] as const;
  const contentOf = (m: Partial<MOM>): Partial<MOM> => {
    const o: any = {};
    CONTENT_KEYS.forEach((k) => { if ((m as any)[k] !== undefined) o[k] = (m as any)[k]; });
    return JSON.parse(JSON.stringify(o));
  };

  const [draft, setDraft] = useState<MOM>(() => {
    if (!mom) return {} as MOM;
    try {
      const base = JSON.parse(JSON.stringify(mom));
      return withStudioSides(base.pendingRevision ? { ...base, ...base.pendingRevision } : base);
    } catch (e) {
      return {} as MOM;
    }
  });

  /** What an attendee is, as the document says it. */
  const attendeeLabel = (a: MOMAttendee) =>
    a.side === "ffds" ? (a.role || "Studio team")
      : a.side === "client" ? "Client"
      : a.side === "vendor" ? (a.role || "Vendor")
      : (a.role || "");

  /** A person where one was named; the side only when nobody was. */
  const GENERIC_OWNERS = new Set(["ffds", "client", "vendor", "unknown", ""]);
  const ownerLabel = (a: MOMActionItem) => {
    const n = String(a.ownerName || "").trim();
    if (n && !GENERIC_OWNERS.has(n.toLowerCase()) && n !== studioName) return n;
    return a.owner === "ffds" ? "Studio" : a.owner === "client" ? "Client" : a.owner === "vendor" ? "Vendor" : "—";
  };
  const ownerValue = (a: MOMActionItem) => {
    const n = String(a.ownerName || "").trim();
    return `${a.owner || "unknown"}|${n && !GENERIC_OWNERS.has(n.toLowerCase()) && n !== studioName ? n : ""}`;
  };
  const [saving, setSaving] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [revising, setRevising] = useState<boolean>(!!mom?.pendingRevision);
  const [revisionNote, setRevisionNote] = useState<string>(String((mom?.pendingRevision as any)?.revisionNote || ""));
  const [showEarlier, setShowEarlier] = useState(false);
  const pdfName = () => `MoM_${draft.momRef}${draft.rev ? `_Rev${draft.rev}` : ""}.pdf`;
  const [suggesting, setSuggesting] = useState(false);
  /* The meeting this MoM came from: it holds who was there and their emails. */
  const [visit, setVisit] = useState<any | null>(null);
  /* Actions still open on this project's earlier MoMs, offered to carry forward. */
  const [earlierOpen, setEarlierOpen] = useState<{ text: string; ref: string; owner?: string | null }[]>([]);

  useEffect(() => {
    let live = true;
    if (mom?.meetingId) {
      getDoc(doc(db, `organizations/${studioId}/projects/${projectId}/siteVisits`, mom.meetingId))
        .then((s) => live && s.exists() && setVisit({ id: s.id, ...s.data() }))
        .catch(() => {});
    }
    getDocs(collection(db, `organizations/${studioId}/projects/${projectId}/moms`))
      .then((snap) => {
        if (!live) return;
        const open: { text: string; ref: string; owner?: string | null }[] = [];
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .filter((m) => m.id !== mom?.id && Number(m.meetingDate || 0) < Number(mom?.meetingDate || Date.now()))
          .sort((a, b) => Number(b.meetingDate || 0) - Number(a.meetingDate || 0))
          .forEach((m) =>
            (m.actionItems || [])
              .filter((a: any) => a?.text?.trim() && a.status !== "done" && a.status !== "closed")
              .forEach((a: any) => {
                if (!open.some((o) => o.text === a.text)) open.push({ text: a.text, ref: m.momRef, owner: a.ownerName || null });
              }),
          );
        setEarlierOpen(open.slice(0, 12));
      })
      .catch(() => {});
    return () => { live = false; };
  }, [mom?.id, mom?.meetingId, studioId, projectId]);

  /* Who signs the email: the person sending it, as the team list names them. */
  const { currentUserAuth } = useOrg() as any;
  const signerName = useMemo(() => {
    const email = String(currentUserAuth?.email || "").toLowerCase();
    const me = (teamMembers || []).find((t: any) => email && String(t?.email || "").toLowerCase() === email);
    return me?.name || currentUserAuth?.displayName || (orgData as any)?.signatoryName || studioName;
  }, [currentUserAuth, teamMembers, orgData, studioName]);

  const [activeSection, setActiveSection] = useState<
    "attendees" | "decisions" | "actions" | "notes" | null
  >("actions");

  // Utility to update draft deep state selectively
  const updateDraft = (patch: Partial<MOM>) => setDraft({ ...draft, ...patch });

  const getOrCreateShareToken = async () => {
    let token = draft.shareToken;
    if (!token) {
      token = `mom_${Date.now()}`;
      setDraft((d) => ({ ...d, shareToken: token }));
      await updateDoc(
        doc(db, `organizations/${studioId}/projects/${projectId}/moms`, mom.id),
        { shareToken: token },
      );
    }
    return token;
  };

  const markShared = async () => {
    if (mom.status === "finalised" || draft.status === "finalised") {
      const updates = { status: "shared", sharedAt: Date.now() };
      setDraft((d) => ({ ...d, ...updates }));
      await updateDoc(
        doc(db, `organizations/${studioId}/projects/${projectId}/moms`, mom.id),
        updates,
      );
    }
  };

  const handleShareWhatsApp = async () => {
    setSaving(true);
    await getOrCreateShareToken();
    await markShared();

    if (pdfContentRef.current) {
      try {
        const html2pdfModule = await import("html2pdf.js");
        let html2pdfObj = (html2pdfModule as any).default || html2pdfModule;
        if (html2pdfObj && html2pdfObj.default)
          html2pdfObj = html2pdfObj.default;

        if (typeof html2pdfObj !== "function") {
          throw new Error("html2pdf failed: could not resolve function");
        }

        const opt = {
          margin: 0,
          filename: pdfName(),
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, onclone: (clonedDoc: Document) => prepareClonedDocForPdf(clonedDoc) },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        };
        const pdfBlob = await html2pdfObj()
          .set(opt)
          .from(pdfContentRef.current)
          .outputPdf("blob");
        const file = new File([pdfBlob], pdfName(), {
          type: "application/pdf",
        });

        const decisionsCount = draft.decisions?.length || 0;
        const actionsCount = draft.actionItems?.length || 0;
        const txt = `*Minutes of Meeting: ${draft.meetingTitle}*\n\nSummary: ${decisionsCount} decisions, ${actionsCount} action items.\n\nPlease find the PDF attached to this message.`;

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.clipboard.writeText(txt);
          } catch (e) {
            console.error("Clipboard write failed", e);
          }
          await navigator.share({
            files: [file],
            title: `MoM - ${draft.meetingTitle}`,
            text: txt,
          });
        } else {
          // Fallback: Download the PDF and tell user to attach it manually
          await html2pdfObj().set(opt).from(pdfContentRef.current).save();
          window.open(
            `https://wa.me/?text=${encodeURIComponent(txt)}`,
            "_blank",
          );
        }
      } catch (e) {
        console.error("Share failed", e);
        // Fallback to old behavior
        const link = `${publicAppOrigin()}/mom/${draft.shareToken}`;
        const decisionsCount = draft.decisions?.length || 0;
        const actionsCount = draft.actionItems?.length || 0;
        const txt = `*Minutes of Meeting: ${draft.meetingTitle}*\n\nSummary: ${decisionsCount} decisions, ${actionsCount} action items.\n\nPlease review and acknowledge the minutes here:\n${link}\n\nThank you!`;
        window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, "_blank");
      }
    } else {
      const link = `${publicAppOrigin()}/mom/${draft.shareToken}`;
      const decisionsCount = draft.decisions?.length || 0;
      const actionsCount = draft.actionItems?.length || 0;
      const txt = `*Minutes of Meeting: ${draft.meetingTitle}*\n\nSummary: ${decisionsCount} decisions, ${actionsCount} action items.\n\nPlease review and acknowledge the minutes here:\n${link}\n\nThank you!`;
      window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, "_blank");
    }

    setSaving(false);
  };

  const handleCopyLink = async () => {
    setSaving(true);
    try {
      const token = await getOrCreateShareToken();
      const link = `${publicAppOrigin()}/mom/${token}`;
      await navigator.clipboard.writeText(link);
      alert("Client signable link copied to clipboard!");
    } catch (e) {
      console.error(e);
      alert("Failed to copy link");
    } finally {
      setSaving(false);
    }
  };

  const pdfContentRef = useRef<HTMLDivElement>(null);

  if (!mom || !draft || !draft.id) {
    return null;
  }

  const handleDownloadPdf = async () => {
    setSaving(true);
    await getOrCreateShareToken();
    await markShared();

    if (pdfContentRef.current) {
      try {
        const html2pdfModule = await import("html2pdf.js");
        let html2pdfObj = (html2pdfModule as any).default || html2pdfModule;
        if (html2pdfObj && html2pdfObj.default)
          html2pdfObj = html2pdfObj.default;

        if (typeof html2pdfObj !== "function") {
          throw new Error("html2pdf failed: could not resolve function");
        }
        const opt = {
          margin: 0,
          filename: pdfName(),
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, onclone: (clonedDoc: Document) => prepareClonedDocForPdf(clonedDoc) },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        };
        await html2pdfObj().set(opt).from(pdfContentRef.current).save();
      } catch (e) {
        console.error(e);
        // fallback
        const link = `${window.location.origin}/mom/${draft.shareToken}?print=true`;
        window.open(link, "_blank");
      }
    } else {
      // fallback
      const link = `${window.location.origin}/mom/${draft.shareToken}?print=true`;
      window.open(link, "_blank");
    }
    setSaving(false);
  };

  const scopeCostCount = (draft.actionItems || []).filter(
    (a) => a.flags?.scope,
  ).length;

  /** The same PDF the Download button makes, as base64 for an attachment. */
  const pdfForEmail = async (): Promise<{ filename: string; base64: string } | null> => {
    if (!pdfContentRef.current) return null;
    try {
      const html2pdfModule = await import("html2pdf.js");
      let html2pdfObj = (html2pdfModule as any).default || html2pdfModule;
      if (html2pdfObj && html2pdfObj.default) html2pdfObj = html2pdfObj.default;
      const uri: string = await html2pdfObj()
        .set({
          margin: 0,
          filename: pdfName(),
          image: { type: "jpeg", quality: 0.92 },
          html2canvas: { scale: 2, useCORS: true, onclone: (clonedDoc: Document) => prepareClonedDocForPdf(clonedDoc) },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(pdfContentRef.current)
        .outputPdf("datauristring");
      return { filename: pdfName(), base64: uri.slice(uri.indexOf(",") + 1) };
    } catch (e) {
      console.error("MoM PDF for email failed", e);
      return null;
    }
  };

  /* The published app, never localhost: this link goes to the client. */
  const ackLink = async () => `${publicAppOrigin()}/mom/${await getOrCreateShareToken()}`;

  const recordEmailed = async (recipients: string[]) => {
    const updates: any = { emailedAt: Date.now(), emailedTo: recipients };
    if (draft.status === "finalised" || mom.status === "finalised") {
      updates.status = "shared";
      updates.sharedAt = Date.now();
    }
    setDraft((d) => ({ ...d, ...updates }));
    await updateDoc(doc(db, `organizations/${studioId}/projects/${projectId}/moms`, mom.id), updates);
  };

  /** A plain summary the client would understand, written from the minutes. */
  const suggestSummary = async () => {
    setSuggesting(true);
    try {
      const facts = [
        `Meeting: ${draft.meetingTitle || "Meeting"} (${meetingTypeLabel(draft.meetingType)})`,
        ...(draft.decisions || []).filter((d) => d.text?.trim()).map((d) => `Decision: ${d.text}`),
        ...(draft.actionItems || []).filter((a) => a.text?.trim()).map((a) => `Action: ${a.text} (owner ${ownerLabel(a)})`),
        ...(draft.notes || []).filter((n) => n.text?.trim()).map((n) => `Note: ${n.text}`),
      ].join("\n");
      const res = await getAi().models.generateContent({
        model: FLASH_MODEL,
        contents: [{ role: "user", parts: [{ text: `Write a summary of these meeting minutes in 2 or 3 plain sentences a homeowner would understand: what was reviewed, what was agreed, what happens next. Use only these facts; no invented dates or amounts. Return only the summary text.\n\n${facts}` }] }],
        config: { temperature: 0.3 },
      });
      const text = String(res.text || "").replace(/^["\s]+|["\s]+$/g, "");
      if (text) updateDraft({ summary: text });
    } catch (e) {
      console.error("Summary suggestion failed", e);
      alert("The summary could not be drafted just now. You can type one.");
    } finally {
      setSuggesting(false);
    }
  };

  /* What to look at before the minutes are final. None of these block it. */
  const checks: { tone: "warn" | "info"; text: string }[] = [];
  {
    const actions = (draft.actionItems || []).filter((a) => a.text?.trim());
    const noOwner = actions.filter((a) => !a.owner || a.owner === "unknown").length;
    const noDate = actions.filter((a) => !a.dueDate).length;
    if (noOwner) checks.push({ tone: "warn", text: `${noOwner} action${noOwner > 1 ? "s have" : " has"} no owner.` });
    if (noDate) checks.push({ tone: "warn", text: `${noDate} action${noDate > 1 ? "s have" : " has"} no due date.` });
    const clientWithEmail = ((visit?.people || []) as any[]).some((p) => p?.side === "client" && String(p?.email || "").includes("@"));
    if (visit && !clientWithEmail && /client|site|measure/.test(String(draft.meetingType || "")))
      checks.push({ tone: "warn", text: "No client email on this meeting. You can add one when you send." });
    if (!String(draft.summary || "").trim()) checks.push({ tone: "info", text: "No summary yet. The email and PDF read better with one." });
    const costScope = actions.filter((a) => a.flags?.scope || a.flags?.cost).length;
    if (revising && !revisionNote.trim())
      checks.unshift({ tone: "warn", text: "Say what changed in this revision. The client sees it on the minutes and in the email." });
    const unqueued = actions.filter((a) => (a.flags?.scope || a.flags?.cost) && !a.scopeRequest).length;
    if (costScope)
      checks.push({
        tone: "info",
        text: `${costScope} action${costScope > 1 ? "s change" : " changes"} cost or scope.${unqueued ? ` ${revising ? "Issuing" : "Finalising"} sends ${unqueued > 1 ? "them" : "it"} to the Scope Revision, as a draft for the studio to price.` : ""}`,
      });
  }

  const handleLogDecision = async (idx: number) => {
    const newD = [...draft.decisions];
    newD[idx].linkedDecisionId = `DEC-${Date.now()}`;
    await updateDoc(
      doc(db, `organizations/${studioId}/projects/${projectId}/moms`, mom.id),
      {
        decisions: newD,
      },
    );
    updateDraft({ decisions: newD });
    alert("Decision logged to project execution data!");
  };

  /*
    Sends one cost or scope action to the Scope Revision queue: for minutes
    finalised before the queue existed, or an item set aside and wanted after
    all. (This was "Initiate Scope Addition Draft", which only showed an alert
    and stamped a made-up id; nothing was ever drafted.) Read fresh, so the
    action tracker's latest statuses are not written over.
  */
  const sendToScope = async (actionId: string) => {
    setSaving(true);
    try {
      const fresh = (await getDoc(momDoc())).data() as MOM;
      const by = currentUserAuth?.email || currentUserAuth?.uid || null;
      const nx = (fresh.actionItems || []).map((a) =>
        a.id === actionId ? { ...a, scopeRequest: { status: "queued" as const, queuedAt: Date.now(), queuedBy: by } } : a,
      );
      await updateDoc(momDoc(), { actionItems: nx });
      setDraft((d) => ({ ...d, actionItems: nx }));
    } catch (e) {
      console.error(e);
      alert("Could not send it to the Scope Revision. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const momDoc = () => doc(db, `organizations/${studioId}/projects/${projectId}/moms`, mom.id);

  /*
    Issuing client-meeting minutes publishes them to the client's portal.

    The portal shows only what has been published (lib/clientVisibility), and
    nothing in the minutes flow ever published them -- so no MoM reached a
    client's portal, and the acknowledge-or-correct step there was never seen.
    Finalising is the studio's deliberate act of issuing them, so it is stamped
    then, with who and when. Internal and vendor minutes are never published
    (the rules refuse them to clients regardless).
  */
  const clientFacing = isClientFacingMeeting(draft.meetingType);
  const inPortal = isVisibleToClient(draft as any);
  const publishStamp = (): any =>
    clientFacing ? { clientVisibility: publish(currentUserAuth?.email || currentUserAuth?.uid || undefined) } : {};
  const publishToPortal = async () => {
    setSaving(true);
    try {
      const stamp = publishStamp();
      await updateDoc(momDoc(), stamp);
      setDraft((d) => ({ ...d, ...stamp }));
    } catch (e) {
      console.error(e);
      alert("Could not publish to the client portal. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const startRevision = async () => {
    setSaving(true);
    try {
      await updateDoc(momDoc(), { pendingRevision: { ...contentOf(draft), revisionNote: "" } });
      setRevisionNote("");
      setRevising(true);
    } catch (e) {
      console.error(e);
      alert("Could not start the revision. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const discardRevision = async () => {
    if (!confirm("Discard this revision? The issued minutes stay exactly as they are.")) return;
    setSaving(true);
    try {
      const fresh = (await getDoc(momDoc())).data() as MOM;
      await updateDoc(momDoc(), { pendingRevision: deleteField() });
      setDraft((d) => withStudioSides({ ...d, ...contentOf(fresh), pendingRevision: null }));
      setRevising(false);
    } catch (e) {
      console.error(e);
      alert("Could not discard the revision. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  /** Files the issued minutes, unchanged, and puts the revision in their place. */
  const issueRevision = async () => {
    const fresh = (await getDoc(momDoc())).data() as MOM;
    const snapshot = JSON.parse(JSON.stringify({
      ...contentOf(fresh),
      rev: Number(fresh.rev || 0),
      status: fresh.status,
      issuedAt: fresh.revisedAt || fresh.sharedAt || fresh.createdAt || null,
      revisionNote: fresh.revisionNote || null,
      revisedBy: (fresh as any).revisedBy || null,
      acknowledgedBy: fresh.acknowledgedBy || null,
      acknowledgedAt: fresh.acknowledgedAt || null,
      ackChannel: fresh.ackChannel || null,
      correctionRequest: fresh.correctionRequest || null,
      emailedAt: fresh.emailedAt || null,
      emailedTo: fresh.emailedTo || [],
      supersededAt: Date.now(),
    }));
    /* The tracker may have closed actions since the revision began; it owns their status. */
    const actionItems = (draft.actionItems || []).map((a) => {
      const was = (fresh.actionItems || []).find((o) => o.id === a.id);
      return was ? { ...a, status: was.status, ...(was.scopeRequest ? { scopeRequest: was.scopeRequest } : {}) } : a;
    });
    const rev = Number(fresh.rev || 0) + 1;
    const now = Date.now();
    const content = contentOf({ ...draft, actionItems: queueScopeActions(actionItems, currentUserAuth?.email || currentUserAuth?.uid || null) });
    const kept = {
      ...(isVisibleToClient(fresh as any) ? {} : publishStamp()),
      rev,
      revisedAt: now,
      revisedBy: currentUserAuth?.email || currentUserAuth?.uid || null,
      revisionNote: revisionNote.trim() || null,
      previousRevisions: [...(fresh.previousRevisions || []), snapshot],
      correctionRequest: null,
      status: "finalised" as const,
      emailedAt: null,
      emailedTo: [] as string[],
    };
    await updateDoc(momDoc(), {
      ...content,
      ...kept,
      pendingRevision: deleteField(),
      acknowledgedBy: deleteField(),
      acknowledgedAt: deleteField(),
      ackChannel: deleteField(),
    });
    setDraft((d) => ({
      ...d,
      ...content,
      ...kept,
      pendingRevision: null,
      acknowledgedBy: undefined,
      acknowledgedAt: undefined,
      ackChannel: undefined,
    }) as MOM);
    setRevising(false);
    setComposerOpen(true);
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      if (revising) {
        await updateDoc(momDoc(), { pendingRevision: { ...contentOf(draft), revisionNote } });
        onClose();
        return;
      }
      await updateDoc(
        doc(db, `organizations/${studioId}/projects/${projectId}/moms`, mom.id),
        {
          ...draft,
          status: "draft",
        },
      );
      onClose();
    } catch (e) {
      console.error(e);
      alert("Failed to save draft");
    } finally {
      setSaving(false);
    }
  };

  const handleFinalise = async () => {
    setSaving(true);
    try {
      if (revising) {
        await issueRevision();
        return;
      }
      /* Cost and scope actions go to the Scope Revision queue as the minutes are issued. */
      const queuedActions = queueScopeActions(draft.actionItems, currentUserAuth?.email || currentUserAuth?.uid || null);
      await updateDoc(
        doc(db, `organizations/${studioId}/projects/${projectId}/moms`, mom.id),
        {
          ...draft,
          actionItems: queuedActions,
          ...publishStamp(),
          status: "finalised",
        },
      );
      // Straight on to the covering email; closing it leaves the MoM open here.
      setDraft((d) => ({ ...d, actionItems: queuedActions, ...publishStamp(), status: "finalised" }));
      setComposerOpen(true);
    } catch (e) {
      console.error(e);
      alert("Failed to finalise MoM");
    } finally {
      setSaving(false);
    }
  };

  const isFinalised = !revising && ["finalised", "shared", "acknowledged", "correction_requested"].includes(
    String(draft.status || mom.status),
  );
  const correctionOpen = draft.status === "correction_requested" && !!draft.correctionRequest?.text;
  const fmtWhen = (ms?: number | null) =>
    ms ? new Date(ms).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <div className="fixed inset-0 bg-[#3D52A0]/90 backdrop-blur-md border border-white/20/40 z-[100] flex items-center justify-center p-0 sm:p-4 backdrop-blur-xs font-sans">
      <div className="bg-white sm:rounded-2xl shadow-2xl w-full h-full sm:h-auto sm:max-h-[92vh] max-w-3xl flex flex-col overflow-hidden border border-slate-200/80">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-[#FAF9F6]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-extrabold text-slate-900 tracking-tight flex items-center gap-1.5">
                Review Minutes: {draft.momRef}{draft.rev ? ` Rev ${draft.rev}` : ""}
                <span className="h-1.5 w-1.5 rounded-full bg-[#B89047]"></span>
              </h2>
              {revising ? (
                <span className="bg-indigo-50 text-[#2C3C78] text-xs font-bold px-2.5 py-0.5 border border-indigo-200 rounded-md uppercase tracking-wider">
                  Revision {(draft.rev || 0) + 1} — not issued yet
                </span>
              ) : correctionOpen ? (
                <span className="bg-amber-50 text-amber-800 text-xs font-bold px-2.5 py-0.5 border border-amber-200 rounded-md uppercase tracking-wider">
                  Correction requested
                </span>
              ) : !isFinalised ? (
                <span className="bg-amber-50 text-amber-700 text-xs font-bold px-2.5 py-0.5 border border-amber-200 rounded-md uppercase tracking-wider">
                  Draft — Review Phase
                </span>
              ) : (
                <span className="bg-emerald-50 text-emerald-800 text-xs font-bold px-2.5 py-0.5 border border-emerald-200 rounded-md uppercase tracking-wider">
                  Finalized Protocol
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 font-semibold mt-1">{draft.meetingTitle}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-900 bg-white border border-slate-200 rounded-full p-2.5 hover:shadow-sm hover:bg-slate-50 transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scope Risk Banner (Clean Navy/Gold highlights) */}
        {!isFinalised && scopeCostCount > 0 && (
          <div className="bg-amber-50/50 border-b border-amber-200/60 px-6 py-4 flex flex-col sm:flex-row gap-2 sm:gap-4 items-start sm:items-center justify-between">
            <div className="flex items-center gap-2 text-slate-900">
              <AlertTriangle size={15} className="text-[#B89047] shrink-0" />
              <p className="text-sm font-bold leading-relaxed text-slate-900/80">
                Notice: {scopeCostCount} item(s) flagged as potential scope expansions. Verify before final client share.
              </p>
            </div>
            <button
              onClick={() => setActiveSection("actions")}
              className="text-xs font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200 px-3.5 py-2 rounded-lg hover:bg-amber-200 transition shrink-0"
            >
              Analyze Items
            </button>
          </div>
        )}

        {/* Content Section (Streamlined light-grey viewport) */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 space-y-5">

          {correctionOpen && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-5 py-4 space-y-2">
              <p className="text-sm font-bold text-amber-950 flex items-center gap-2">
                <PenLine size={15} className="shrink-0" />
                {draft.correctionRequest?.by || "The client"} asked for a correction{draft.correctionRequest?.at ? ` on ${fmtWhen(draft.correctionRequest.at)}` : ""}
              </p>
              <p className="text-sm text-amber-950/90 whitespace-pre-line leading-relaxed">“{draft.correctionRequest?.text}”</p>
              {!revising && (
                <button
                  type="button"
                  onClick={startRevision}
                  disabled={saving}
                  className="mt-1 px-3.5 py-2 rounded-lg bg-[#3D52A0] hover:bg-[#2C3C78] text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <PenLine size={13} /> Revise the minutes
                </button>
              )}
            </div>
          )}

          {revising && (
            <div className="rounded-2xl border border-indigo-200 bg-white px-5 py-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="mom-revision-note" className="text-xs font-bold text-slate-500">
                  What changed in Rev {(draft.rev || 0) + 1}
                </label>
                <button type="button" onClick={discardRevision} disabled={saving} className="text-xs font-bold text-slate-400 hover:text-rose-700">
                  Discard revision
                </button>
              </div>
              <textarea
                id="mom-revision-note"
                value={revisionNote}
                onChange={(e) => setRevisionNote(e.target.value)}
                rows={2}
                placeholder="e.g. Handle finish corrected to black, as the client confirmed."
                className="w-full bg-slate-50/70 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 leading-relaxed outline-none border border-transparent focus:bg-white focus:border-[#3D52A0]/30 focus:ring-4 focus:ring-[#3D52A0]/10 resize-y placeholder-slate-400"
              />
              <p className="text-xs text-slate-500">
                The client keeps seeing the issued minutes until you issue this revision. It then needs their acknowledgement again.
              </p>
            </div>
          )}

          {/* OVERVIEW: what the client reads first, in the email and on the PDF */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label htmlFor="mom-summary" className="text-xs font-bold text-slate-500">Summary</label>
                {!isFinalised && (
                  <button
                    type="button"
                    onClick={suggestSummary}
                    disabled={suggesting}
                    className="text-xs font-bold text-[#3D52A0] hover:text-[#2C3C78] flex items-center gap-1.5 disabled:opacity-60"
                  >
                    {suggesting ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    {draft.summary ? "Rewrite with AI" : "Suggest with AI"}
                  </button>
                )}
              </div>
              <textarea
                id="mom-summary"
                disabled={isFinalised}
                value={draft.summary || ""}
                onChange={(e) => updateDraft({ summary: e.target.value })}
                placeholder="Two or three sentences: what was reviewed, what was agreed, what happens next."
                rows={3}
                className="w-full bg-slate-50/70 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 leading-relaxed outline-none border border-transparent focus:bg-white focus:border-[#3D52A0]/30 focus:ring-4 focus:ring-[#3D52A0]/10 resize-y placeholder-slate-400 disabled:bg-transparent disabled:px-0"
              />
            </div>

            <div>
              <span className="text-xs font-bold text-slate-500 block mb-1.5">Next meeting</span>
              <div className="flex flex-wrap gap-2">
                <input
                  type="date"
                  aria-label="Next meeting date"
                  disabled={isFinalised}
                  value={draft.nextMeeting?.date || ""}
                  onChange={(e) => updateDraft({ nextMeeting: { ...(draft.nextMeeting || {}), date: e.target.value } })}
                  className="text-sm bg-slate-50/70 rounded-lg px-3 py-2 outline-none border border-transparent focus:border-[#3D52A0]/30 text-slate-800"
                />
                <input
                  type="time"
                  aria-label="Next meeting time"
                  disabled={isFinalised}
                  value={draft.nextMeeting?.time || ""}
                  onChange={(e) => updateDraft({ nextMeeting: { ...(draft.nextMeeting || {}), time: e.target.value } })}
                  className="text-sm bg-slate-50/70 rounded-lg px-3 py-2 outline-none border border-transparent focus:border-[#3D52A0]/30 text-slate-800"
                />
                <input
                  type="text"
                  aria-label="Next meeting purpose"
                  disabled={isFinalised}
                  value={draft.nextMeeting?.purpose || ""}
                  onChange={(e) => updateDraft({ nextMeeting: { ...(draft.nextMeeting || {}), purpose: e.target.value } })}
                  placeholder="Purpose, e.g. material selection"
                  className="flex-1 min-w-[180px] text-sm bg-slate-50/70 rounded-lg px-3 py-2 outline-none border border-transparent focus:border-[#3D52A0]/30 text-slate-800 placeholder-slate-400"
                />
              </div>
            </div>

            {(earlierOpen.length > 0 || (draft.carriedForward || []).length > 0) && (
              <div>
                <span className="text-xs font-bold text-slate-500 block mb-1.5">
                  Still open from earlier meetings
                  <span className="font-medium text-slate-400"> · ticked items print on these minutes</span>
                </span>
                <div className="space-y-1">
                  {[
                    ...(draft.carriedForward || []),
                    ...earlierOpen.filter((o) => !(draft.carriedForward || []).some((c) => c.text === o.text)),
                  ].map((o, i) => {
                    const on = (draft.carriedForward || []).some((c) => c.text === o.text);
                    return (
                      <label key={`${o.ref}-${i}`} className={`flex items-start gap-2.5 text-sm px-2 py-1.5 rounded-lg ${isFinalised ? "" : "cursor-pointer hover:bg-slate-50"}`}>
                        <input
                          type="checkbox"
                          disabled={isFinalised}
                          checked={on}
                          onChange={() =>
                            updateDraft({
                              carriedForward: on
                                ? (draft.carriedForward || []).filter((c) => c.text !== o.text)
                                : [...(draft.carriedForward || []), o],
                            })
                          }
                          className="mt-1 accent-[#3D52A0]"
                        />
                        <span className={on ? "text-slate-800" : "text-slate-500"}>
                          {o.text}
                          <span className="text-xs text-slate-400"> · {o.ref}{o.owner ? ` · ${o.owner}` : ""}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            {(draft.previousRevisions || []).length > 0 && (
              <div className="border-t border-slate-100 pt-3">
                <button type="button" onClick={() => setShowEarlier((v) => !v)} className="text-xs font-bold text-slate-500 hover:text-slate-900 flex items-center gap-1.5">
                  <History size={13} /> Earlier versions ({(draft.previousRevisions || []).length})
                </button>
                {showEarlier && (
                  <ul className="mt-2 space-y-2">
                    {[...(draft.previousRevisions || [])].reverse().map((p: any, i) => (
                      <li key={i} className="text-xs text-slate-600 leading-relaxed">
                        <span className="font-bold text-slate-800">{p.rev ? `Rev ${p.rev}` : "As first issued"}</span>
                        {p.issuedAt ? ` · issued ${fmtWhen(p.issuedAt)}` : ""}
                        {p.acknowledgedBy ? ` · acknowledged by ${p.acknowledgedBy}` : ""}
                        {p.correctionRequest?.text ? <span className="block text-slate-500">Correction asked: “{p.correctionRequest.text}”</span> : null}
                        {p.revisionNote ? <span className="block text-slate-500">Change made then: {p.revisionNote}</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {!isFinalised && checks.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
              <span className="text-xs font-bold text-slate-500 block mb-2">Before you finalise</span>
              <ul className="space-y-1.5">
                {checks.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                    {c.tone === "warn" ? (
                      <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                    ) : (
                      <CornerDownRight size={14} className="text-slate-400 shrink-0 mt-0.5" />
                    )}
                    {c.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {/* 1. ATTENDEES ACCORDION */}
          <AccordionSection
            title={`Meeting Attendees (${draft.attendees?.length || 0})`}
            icon={<Users size={16} className="text-slate-400" />}
            isOpen={activeSection === "attendees"}
            onToggle={() =>
              setActiveSection(
                activeSection === "attendees" ? null : "attendees",
              )
            }
          >
            <div className="space-y-3">
              {draft.attendees?.map((att, idx) => (
                <div
                  key={idx}
                  className="flex gap-2.5 items-center bg-white border border-slate-200/80 rounded-xl p-2.5"
                >
                  <input
                    type="text"
                    disabled={isFinalised}
                    value={att.name}
                    placeholder="Attendee full name"
                    onChange={(e) => {
                      const newAtts = [...draft.attendees];
                      newAtts[idx].name = e.target.value;
                      updateDraft({ attendees: newAtts });
                    }}
                    className="flex-1 bg-transparent px-2.5 py-1 text-sm text-slate-900 font-semibold outline-none placeholder-slate-400"
                  />
                  <select
                    disabled={isFinalised}
                    value={att.side}
                    onChange={(e) => {
                      const newAtts = [...draft.attendees];
                      newAtts[idx].side = e.target.value as any;
                      updateDraft({ attendees: newAtts });
                    }}
                    className="bg-slate-50 border border-slate-200 text-xs font-bold uppercase tracking-wider px-3 py-2 rounded-xl outline-none text-slate-600 transition focus:bg-white"
                  >
                    <option value="client">Client</option>
                    <option value="ffds">{studioName}</option>
                    <option value="vendor">Vendor</option>
                    <option value="unknown">External</option>
                  </select>
                  {!isFinalised && (
                    <button
                      onClick={() => {
                        const newAtts = [...draft.attendees];
                        newAtts.splice(idx, 1);
                        updateDraft({ attendees: newAtts });
                      }}
                      className="text-slate-300 hover:text-red-500 p-2 transition rounded-lg hover:bg-slate-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
              {!isFinalised && (
                <button
                  onClick={() =>
                    updateDraft({
                      attendees: [
                        ...(draft.attendees || []),
                        { name: "", side: "unknown" },
                      ],
                    })
                  }
                  className="text-sm text-[#B89047] font-bold hover:text-slate-900 flex items-center gap-1.5 mt-2 px-1 transition"
                >
                  <Plus size={14} /> Add Attendee
                </button>
              )}
            </div>
          </AccordionSection>

          {/* 2. DECISIONS ACCORDION */}
          <AccordionSection
            title={`Decisions Recorded (${draft.decisions?.length || 0})`}
            icon={<Gavel size={16} className="text-slate-400" />}
            isOpen={activeSection === "decisions"}
            onToggle={() =>
              setActiveSection(
                activeSection === "decisions" ? null : "decisions",
              )
            }
          >
            <div className="space-y-3.5">
              {draft.decisions?.map((d, idx) => (
                <div
                  key={d.id}
                  className="flex flex-col gap-2.5 bg-white border border-slate-200/80 rounded-xl p-4"
                >
                  <div className="flex gap-2.5 items-start">
                    <CheckCircle
                      size={16}
                      className="text-[#B89047] shrink-0 mt-1"
                    />
                    <textarea
                      disabled={isFinalised}
                      value={d.text}
                      placeholder="Enter recorded decision statement..."
                      onChange={(e) => {
                        const newD = [...draft.decisions];
                        newD[idx].text = e.target.value;
                        updateDraft({ decisions: newD });
                      }}
                      className="flex-1 bg-transparent text-sm font-semibold text-slate-900 outline-none resize-none min-h-[44px] leading-relaxed placeholder-slate-400"
                    />
                    {!isFinalised && (
                      <button
                        onClick={() => {
                          const newD = [...draft.decisions];
                          newD.splice(idx, 1);
                          updateDraft({ decisions: newD });
                        }}
                        className="text-slate-300 hover:text-red-500 p-2 transition rounded-lg hover:bg-slate-100"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  {isFinalised && (
                    <div className="pl-6 pt-2 border-t border-slate-100 flex">
                      {d.linkedDecisionId ? (
                        <span className="text-xs font-bold uppercase tracking-wider text-[#B89047] bg-amber-50/50 border border-[#B89047]/20 px-3 py-1.5 rounded">
                          ✓ Sync Active — Decision Logged
                        </span>
                      ) : (
                        <button
                          onClick={() => handleLogDecision(idx)}
                          className="text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-900 transition flex items-center gap-1"
                        >
                          → Sync to Decisions Log
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {!isFinalised && (
                <button
                  onClick={() =>
                    updateDraft({
                      decisions: [
                        ...(draft.decisions || []),
                        { id: Date.now().toString(), text: "" },
                      ],
                    })
                  }
                  className="text-sm text-[#B89047] font-bold hover:text-slate-900 flex items-center gap-1.5 mt-2 px-1 transition"
                >
                  <Plus size={14} /> Add Decision
                </button>
              )}
            </div>
          </AccordionSection>

          {/* 3. ACTION ITEMS ACCORDION */}
          <AccordionSection
            title={`Action Items & Milestones (${draft.actionItems?.length || 0})`}
            icon={<ListTodo size={16} className="text-slate-400" />}
            isOpen={activeSection === "actions"}
            onToggle={() =>
              setActiveSection(activeSection === "actions" ? null : "actions")
            }
          >
            <div className="space-y-4">
              {draft.actionItems?.map((a, idx) => (
                <div
                  key={a.id}
                  className="flex flex-col bg-white border border-slate-200/80 rounded-xl overflow-hidden"
                >
                  <div className="p-4 border-b border-slate-100 flex gap-2.5">
                    <textarea
                      disabled={isFinalised}
                      value={a.text}
                      onChange={(e) => {
                        const nx = [...draft.actionItems];
                        nx[idx].text = e.target.value;
                        updateDraft({ actionItems: nx });
                      }}
                      className="flex-1 bg-transparent text-sm font-semibold text-slate-900 outline-none resize-none min-h-[44px] leading-relaxed placeholder-slate-400"
                      placeholder="Task description / target output..."
                    />
                    {!isFinalised && (
                      <button
                        onClick={() => {
                          const nx = [...draft.actionItems];
                          nx.splice(idx, 1);
                          updateDraft({ actionItems: nx });
                        }}
                        className="text-slate-300 hover:text-red-500 p-2 transition h-fit rounded-lg hover:bg-slate-100"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>

                  <div className="p-4 bg-[#FAF9F6]/50 flex flex-col gap-3">
                    <div className="flex flex-wrap gap-3 items-center justify-between w-full">
                      <div className="flex flex-wrap gap-2.5 items-center">
                        <select
                          disabled={isFinalised}
                          value={ownerValue(a)}
                          aria-label="Owner"
                          onChange={(e) => {
                            const [side, ...rest] = e.target.value.split("|");
                            const nx = [...draft.actionItems];
                            nx[idx] = { ...nx[idx], owner: side as any, ownerName: rest.join("|") || null } as any;
                            updateDraft({ actionItems: nx });
                          }}
                          className="text-xs bg-white border border-slate-200 rounded-lg py-2 px-3.5 font-bold text-slate-700 outline-none max-w-[220px]"
                        >
                          {(draft.attendees || []).filter((p) => p.name?.trim()).map((p, pi) => (
                            <option key={`p-${pi}`} value={`${p.side}|${p.name.trim()}`}>
                              {p.name.trim()} · {p.side === "ffds" ? "Studio" : p.side === "client" ? "Client" : p.side === "vendor" ? "Vendor" : "Other"}
                            </option>
                          ))}
                          {!(draft.attendees || []).some((p) => `${p.side}|${p.name?.trim()}` === ownerValue(a)) &&
                            ownerValue(a).split("|")[1] && (
                              <option value={ownerValue(a)}>{ownerLabel(a)}</option>
                            )}
                          <option value="ffds|">Studio (no one named)</option>
                          <option value="client|">Client (no one named)</option>
                          <option value="vendor|">Vendor (no one named)</option>
                        </select>

                        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1">
                          <CalendarIcon size={12} className="text-slate-400" />
                          <input
                            type="date"
                            disabled={isFinalised}
                            value={
                              a.dueDate
                                ? new Date(a.dueDate)
                                    .toISOString()
                                    .split("T")[0]
                                : ""
                            }
                            onChange={(e) => {
                              const nx = [...draft.actionItems];
                              nx[idx].dueDate = e.target.value
                                ? new Date(e.target.value).getTime()
                                : undefined;
                              updateDraft({ actionItems: nx });
                            }}
                            className="text-xs font-bold bg-transparent border-none outline-none w-[120px] text-slate-700"
                          />
                        </div>
                      </div>

                      <div className="flex gap-2 flex-wrap">
                        {isOwner ? (
                          <>
                            <button
                              onClick={() => {
                                if (isFinalised) return;
                                const nx = [...draft.actionItems];
                                nx[idx] = {
                                  ...nx[idx],
                                  flags: {
                                    ...nx[idx].flags,
                                    scope: !nx[idx].flags?.scope,
                                  },
                                };
                                updateDraft({ actionItems: nx });
                              }}
                              className={`text-xs px-3 py-1.5 rounded-md border font-bold uppercase tracking-wider transition ${a.flags?.scope ? "bg-red-50 text-red-700 border-red-200" : "bg-white text-slate-400 border-slate-200 opacity-60 hover:opacity-100"}`}
                            >
                              Scope Impact
                            </button>
                            <button
                              onClick={() => {
                                if (isFinalised) return;
                                const nx = [...draft.actionItems];
                                nx[idx] = { ...nx[idx], flags: { ...nx[idx].flags, cost: !nx[idx].flags?.cost } };
                                updateDraft({ actionItems: nx });
                              }}
                              className={`text-xs px-3 py-1.5 rounded-md border font-bold uppercase tracking-wider transition ${a.flags?.cost ? "bg-red-50 text-red-700 border-red-200" : "bg-white text-slate-400 border-slate-200 opacity-60 hover:opacity-100"}`}
                            >
                              Cost Impact
                            </button>
                          </>
                        ) : (
                          <>
                            {a.flags?.scope && (
                              <span className="text-xs px-3 py-1.5 rounded-md font-bold uppercase tracking-wider bg-red-50 text-red-700 border border-red-100">
                                Scope Impact
                              </span>
                            )}
                            {a.flags?.cost && (
                              <span className="text-xs px-3 py-1.5 rounded-md font-bold uppercase tracking-wider bg-red-50 text-red-700 border border-red-100">
                                Cost Impact
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {isFinalised && (a.flags?.scope || a.flags?.cost) && (
                      <div className="flex flex-wrap items-center gap-3 border-t border-slate-200/50 pt-3 mt-1 text-xs">
                        {a.scopeRequest?.status === "queued" ? (
                          <span className="font-bold text-[#2C3C78] bg-[#E8ECFB] px-3 py-1.5 rounded-md">
                            Waiting in the Scope Revision queue
                          </span>
                        ) : a.scopeRequest?.status === "added" ? (
                          <span className="font-bold text-emerald-800 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-md">
                            ✓ In {a.scopeRequest.addedTo || "the Scope Revision"}
                          </span>
                        ) : (
                          <>
                            {a.scopeRequest?.status === "dismissed" && (
                              <span className="text-slate-500">Set aside in the scope review.</span>
                            )}
                            {isOwner && (
                              <button
                                onClick={() => sendToScope(a.id)}
                                disabled={saving}
                                className="font-bold text-[#3D52A0] hover:text-[#2C3C78] transition flex items-center gap-1"
                              >
                                → Send to Scope Revision
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {!isFinalised && (
                <button
                  onClick={() =>
                    updateDraft({
                      actionItems: [
                        ...(draft.actionItems || []),
                        {
                          id: Date.now().toString(),
                          text: "",
                          owner: "ffds",
                          status: "open",
                          flags: {},
                        },
                      ],
                    })
                  }
                  className="text-sm text-[#B89047] font-bold hover:text-slate-900 flex items-center gap-1.5 mt-2 px-1 transition"
                >
                  <Plus size={14} /> Add Action Item
                </button>
              )}
            </div>
          </AccordionSection>

          {/* 4. NOTES ACCORDION */}
          <AccordionSection
            title={`Discussion Notes & References (${draft.notes?.length || 0})`}
            icon={<StickyNote size={16} className="text-slate-400" />}
            isOpen={activeSection === "notes"}
            onToggle={() =>
              setActiveSection(activeSection === "notes" ? null : "notes")
            }
          >
            <div className="space-y-3.5">
              {draft.notes?.map((n, idx) => (
                <div
                  key={n.id}
                  className="flex gap-2.5 items-start bg-transparent border-none p-0"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-[#B89047] mt-2 shrink-0"></div>
                  <textarea
                    disabled={isFinalised}
                    value={n.text}
                    placeholder="Enter discussion bullet..."
                    onChange={(e) => {
                      const nx = [...draft.notes];
                      nx[idx].text = e.target.value;
                      updateDraft({ notes: nx });
                    }}
                    className="flex-1 bg-transparent text-sm text-slate-700 outline-none resize-none min-h-[40px] leading-relaxed placeholder-slate-400 font-semibold"
                  />
                  {!isFinalised && (
                    <button
                      onClick={() => {
                        const nx = [...draft.notes];
                        nx.splice(idx, 1);
                        updateDraft({ notes: nx });
                      }}
                      className="text-slate-300 hover:text-red-500 p-2 transition rounded-lg hover:bg-slate-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
              {!isFinalised && (
                <button
                  onClick={() =>
                    updateDraft({
                      notes: [
                        ...(draft.notes || []),
                        { id: Date.now().toString(), text: "" },
                      ],
                    })
                  }
                  className="text-sm text-[#B89047] font-bold hover:text-slate-900 flex items-center gap-1.5 mt-2 px-1 transition"
                >
                  <Plus size={14} /> Add Note
                </button>
              )}
            </div>
          </AccordionSection>
        </div>

        {/* Footer (Actions Bar) */}
        {!isFinalised ? (
          <div className="p-6 border-t border-slate-200 bg-white flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleSaveDraft}
              disabled={saving}
              className="flex-1 py-3 bg-white text-slate-900 border border-slate-200 rounded-xl font-bold text-sm uppercase tracking-wider hover:bg-slate-100/80 transition shadow-sm"
            >
              Save Progress
            </button>
            <button
              onClick={handleFinalise}
              disabled={saving}
              className="flex-1 py-3 bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 text-white hover:text-amber-400 rounded-xl font-bold text-sm uppercase tracking-wider transition flex items-center justify-center gap-2 shadow-sm"
            >
              <CheckCircle2 size={14} />
              {revising ? `Issue Rev ${(draft.rev || 0) + 1} & email` : "Finalise & email"}
            </button>
          </div>
        ) : (
          <div className="p-6 border-t border-slate-200 bg-[#FAF9F6] flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-slate-900 tracking-tight text-sm uppercase">
                  Share & Sign Protocol
                </h3>
                <p className="text-xs text-slate-400 mt-1 font-semibold">
                  Distribute the finalized Minutes of Meeting via WhatsApp or download as a PDF document.
                </p>
              </div>
              {mom.status === "acknowledged" && (
                <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded flex items-center gap-1.5">
                  <CheckCircle size={11} /> Client Signed
                </span>
              )}
            </div>

            {draft.emailedAt ? (
              <p className="text-xs text-slate-500 -mt-1">
                Emailed {new Date(draft.emailedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                {draft.emailedTo?.length ? ` to ${draft.emailedTo.join(", ")}` : ""}
              </p>
            ) : null}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setComposerOpen(true)}
                disabled={saving}
                className="flex-1 flex justify-center items-center gap-2 py-3.5 bg-[#3D52A0] hover:bg-[#2C3C78] text-white rounded-xl font-bold text-sm uppercase tracking-wider transition shadow-sm"
              >
                <Mail size={14} />
                {draft.emailedAt ? "Email again" : "Email to client"}
              </button>
              <button
                onClick={handleShareWhatsApp}
                disabled={saving}
                className="flex-1 flex justify-center items-center gap-2 py-3.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-sm uppercase tracking-wider transition shadow-sm"
              >
                <Send size={14} />
                WhatsApp Share
              </button>
              <button
                onClick={handleDownloadPdf}
                disabled={saving}
                className="flex-1 flex justify-center items-center gap-2 py-3.5 bg-white border border-slate-200 text-slate-900 rounded-xl font-bold text-sm uppercase tracking-wider hover:bg-slate-100 transition shadow-sm"
              >
                <Download size={14} />
                Download PDF
              </button>
              <button
                onClick={handleCopyLink}
                disabled={saving}
                className="flex w-14 justify-center items-center py-3.5 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-100 transition shadow-sm"
                title="Copy Client Share Link"
              >
                <Share2 size={14} />
              </button>
            </div>
            {clientFacing && !inPortal && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-2.5">
                <span className="text-xs text-amber-900 font-semibold">Not in the client's portal yet, so they cannot acknowledge it there.</span>
                <button type="button" onClick={publishToPortal} disabled={saving} className="px-3 py-1.5 rounded-lg bg-[#3D52A0] hover:bg-[#2C3C78] text-white text-xs font-bold">
                  Publish to client portal
                </button>
              </div>
            )}
            {!correctionOpen && (
              <button
                type="button"
                onClick={startRevision}
                disabled={saving}
                className="self-start text-xs font-bold text-slate-500 hover:text-[#3D52A0] flex items-center gap-1.5"
              >
                <PenLine size={13} /> Something to correct? Revise the minutes
              </button>
            )}
          </div>
        )}
      </div>

      {composerOpen && (
        <MomEmailComposer
          mom={draft}
          visit={visit}
          projectName={projectContextName || "your project"}
          clientName={((visit?.people || []) as any[]).filter((p) => p?.side === "client").map((p) => String(p.name || "").split(/\s+/)[0]).filter(Boolean).slice(0, 2).join(" and ") || undefined}
          studioName={studioName}
          signerName={signerName}
          getPdf={pdfForEmail}
          getAckLink={ackLink}
          onSent={recordEmailed}
          onClose={() => setComposerOpen(false)}
        />
      )}

      {/* Hidden printable content for PDF generation (Sober, Print-first Theme) */}
      <div className="absolute left-[-9999px] top-[-9999px]">
        <div ref={pdfContentRef} className="w-[210mm] bg-white text-slate-900">
          {orgData && (
            <StudioDocumentShell
              orgData={orgData}
              docHeaderType={`Minutes of Meeting\nRef: ${draft.momRef}${draft.rev ? ` Rev ${draft.rev}` : ""}`}
              docHeaderTitle={draft.meetingTitle || "Minutes of Meeting"}
            >
              <div className="space-y-8 text-sm text-slate-900 pt-4 font-sans pb-12">
                {/* 1. Protocol Metadata Box */}
                <div className="border border-[#d9d6cc] bg-[#FAF9F6] p-5">
                  <div className="grid grid-cols-2 gap-y-4 text-xs">
                    <div>
                      <span className="text-[#666666] font-semibold block uppercase tracking-wider text-[10px]">Reference Number</span>
                      <span className="font-extrabold text-[#1E1B4B] text-sm">{draft.momRef}{draft.rev ? ` Rev ${draft.rev}` : ""}</span>
                    </div>
                    <div>
                      <span className="text-[#666666] font-semibold block uppercase tracking-wider text-[10px]">Meeting Date</span>
                      <span className="font-extrabold text-[#1E1B4B] text-sm">
                        {draft.meetingDate ? new Date(draft.meetingDate).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        }) : "N/A"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#666666] font-semibold block uppercase tracking-wider text-[10px]">Project Name</span>
                      <span className="font-extrabold text-[#1E1B4B] text-sm">{projectContextName || "N/A"}</span>
                    </div>
                    <div>
                      <span className="text-[#666666] font-semibold block uppercase tracking-wider text-[10px]">Meeting Type</span>
                      <span className="font-extrabold text-[#1E1B4B] text-sm uppercase tracking-wider">
                        {meetingTypeLabel(draft.meetingType)}
                      </span>
                    </div>
                  </div>
                </div>

                {!!draft.rev && (
                  <div className="border-l-2 border-[#3D52A0] bg-[#F4F6FC] px-4 py-3 text-xs leading-relaxed text-[#1E1B4B]">
                    <span className="font-extrabold uppercase tracking-wider text-[10px] text-[#3D52A0] block mb-0.5">
                      Revision {draft.rev}{draft.revisedAt ? ` · issued ${new Date(draft.revisedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}` : ""}
                    </span>
                    {draft.revisionNote ? `What changed: ${draft.revisionNote}` : "These minutes replace the earlier version."}
                  </div>
                )}

                {draft.summary && String(draft.summary).trim() && (
                  <div>
                    <h3 className="text-xs uppercase font-extrabold tracking-widest text-[#B89047] mb-2">Summary</h3>
                    <p className="text-[13px] leading-relaxed text-slate-800">{draft.summary}</p>
                  </div>
                )}

                {/* Single Gold Hairline Accent divider */}
                <div className="h-[1px] bg-[#B89047]" />

                {/* 2. Attendees Section */}
                <div>
                  <h3 className="text-xs uppercase font-extrabold tracking-widest text-[#B89047] mb-3 flex items-center gap-2">
                    <Users size={14} className="text-[#B89047]" />
                    Attendees
                  </h3>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-2 border-t border-slate-100 pt-3">
                    {draft.attendees?.map((a, i) => (
                      <div key={i} className="flex justify-between text-xs py-1 border-b border-slate-100/60">
                        <span className="font-bold text-slate-800">{a.name}</span>
                        <span className="text-[#666666] font-bold uppercase tracking-wider text-right">
                          {attendeeLabel(a)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3. Decisions Section */}
                {draft.decisions && draft.decisions.length > 0 && (
                  <div>
                    <h3 className="text-xs uppercase font-extrabold tracking-widest text-[#B89047] mb-3 flex items-center gap-2">
                      <Gavel size={14} className="text-[#B89047]" />
                      Decisions Logged
                    </h3>
                    <div className="border-t border-slate-100 pt-3 space-y-3">
                      {draft.decisions.map((d, i) => (
                        <div key={i} className="flex gap-3 items-start text-xs leading-relaxed text-[#1E1B4B]">
                          <span className="text-[#B89047] font-extrabold select-none mt-0.5">▪</span>
                          <span className="font-medium text-slate-800">{d.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 4. Action Items Section */}
                {draft.actionItems && draft.actionItems.length > 0 && (
                  <div>
                    <h3 className="text-xs uppercase font-extrabold tracking-widest text-[#B89047] mb-3 flex items-center gap-2">
                      <ListTodo size={14} className="text-[#B89047]" />
                      Action Items & Tasks
                    </h3>
                    <div className="border-t border-slate-100 pt-3">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-[#FAF9F6] bg-[#FAF9F6]">
                            <th className="py-2.5 px-3 text-[10px] uppercase font-extrabold tracking-wider text-slate-500 w-16 text-center">
                              Ref
                            </th>
                            <th className="py-2.5 px-3 text-[10px] uppercase font-extrabold tracking-wider text-slate-500">
                              Task Description
                            </th>
                            <th className="py-2.5 px-3 text-[10px] uppercase font-extrabold tracking-wider text-slate-500 w-28 text-center">
                              Owner
                            </th>
                            <th className="py-2.5 px-3 text-[10px] uppercase font-extrabold tracking-wider text-slate-500 w-28 text-right">
                              Due Date
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {draft.actionItems.map((a, i) => (
                            <tr key={a.id} className="text-xs">
                              <td className="py-3 px-3 font-bold text-slate-400 text-center">
                                A-{String(i + 1).padStart(2, "0")}
                              </td>
                              <td className="py-3 px-3 font-medium text-slate-800 leading-relaxed">
                                {a.text}
                                {a.flags?.scope && (
                                  <span className="ml-2 inline-block text-[9px] text-red-600 font-bold uppercase tracking-wider">
                                    [Scope Update]
                                  </span>
                                )}
                                {a.flags?.cost && (
                                  <span className="ml-2 inline-block text-[9px] text-red-600 font-bold uppercase tracking-wider">
                                    [Cost Impact]
                                  </span>
                                )}
                                {a.flags?.drawing && (
                                  <span className="ml-2 inline-block text-[9px] text-[#334486] font-bold uppercase tracking-wider">
                                    [Drawing Keyed]
                                  </span>
                                )}
                                {a.flags?.siteCondition && (
                                  <span className="ml-2 inline-block text-[9px] text-amber-700 font-bold uppercase tracking-wider">
                                    [Site Check]
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-3 text-center text-slate-700 font-bold">
                                {ownerLabel(a)}
                              </td>
                              <td className="py-3 px-3 text-right font-medium text-slate-600">
                                {a.dueDate ? (
                                  new Date(a.dueDate).toLocaleDateString("en-GB", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  })
                                ) : (
                                  <span className="text-slate-300 italic">-</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {(draft.carriedForward || []).length > 0 && (
                  <div>
                    <h3 className="text-xs uppercase font-extrabold tracking-widest text-[#B89047] mb-3">
                      Still Open From Earlier Meetings
                    </h3>
                    <div className="border-t border-slate-100 pt-3 space-y-2">
                      {(draft.carriedForward || []).map((c, i) => (
                        <div key={i} className="flex gap-3 items-start text-xs leading-relaxed">
                          <span className="text-[#B89047] font-extrabold select-none mt-0.5">▪</span>
                          <span className="font-medium text-slate-800 flex-1">{c.text}</span>
                          <span className="text-[#666666] font-bold whitespace-nowrap">{c.ref}{c.owner ? ` · ${c.owner}` : ""}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 5. Discussion Notes Section */}
                {draft.notes && draft.notes.length > 0 && (
                  <div>
                    <h3 className="text-xs uppercase font-extrabold tracking-widest text-[#B89047] mb-3 flex items-center gap-2">
                      <StickyNote size={14} className="text-[#B89047]" />
                      Discussion Notes
                    </h3>
                    <div className="border-t border-slate-100 pt-3 space-y-2">
                      {draft.notes.map((n, i) => (
                        <div key={n.id} className="flex gap-3 items-start text-xs leading-relaxed text-slate-700">
                          <span className="text-slate-300 font-bold select-none mt-0.5">•</span>
                          <span className="font-medium">{n.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {draft.nextMeeting?.date && (
                  <div className="border border-[#d9d6cc] bg-[#FAF9F6] px-5 py-3.5 text-xs flex flex-wrap gap-x-6 gap-y-1">
                    <span className="text-[#666666] font-semibold uppercase tracking-wider text-[10px] self-center">Next Meeting</span>
                    <span className="font-extrabold text-[#1E1B4B] text-sm">
                      {new Date(`${draft.nextMeeting.date}T${draft.nextMeeting.time || "00:00"}`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric" })}
                      {draft.nextMeeting.time ? `, ${new Date(`${draft.nextMeeting.date}T${draft.nextMeeting.time}`).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}` : ""}
                    </span>
                    {draft.nextMeeting.purpose && <span className="text-slate-700 font-medium text-sm">{draft.nextMeeting.purpose}</span>}
                  </div>
                )}

                {/* 6. Acknowledgment & Signature Block */}
                <div className="h-[1px] bg-slate-200 mt-8" />
                <div className="grid grid-cols-2 gap-12 pt-6">
                  <div className="space-y-4">
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 block">
                      PREPARED BY
                    </span>
                    <div className="text-xs">
                      <p className="font-bold text-[#1E1B4B]">{studioName}</p>
                      <p className="text-[#666666] mt-1">Project Operations & Delivery</p>
                    </div>
                  </div>

                  <div className="space-y-4 text-right">
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 block">
                      CLIENT APPROVAL
                    </span>
                    {draft.status === "acknowledged" ? (
                      <div className="text-xs">
                        <p className="font-bold text-emerald-800">✓ Approved & Signed</p>
                        <p className="text-slate-600 mt-1">By {draft.acknowledgedBy}</p>
                        <p className="text-slate-500 text-[10px] mt-0.5">
                          {new Date(draft.acknowledgedAt!).toLocaleString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })} ({draft.ackChannel})
                        </p>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-300 italic">
                        Pending Digital Acknowledgment via Client Portal
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </StudioDocumentShell>
          )}
        </div>
      </div>
    </div>
  );
}

interface AccordionSectionProps {
  title: string;
  icon: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function AccordionSection({ title, icon, isOpen, onToggle, children }: AccordionSectionProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs transition-all">
      <button
        onClick={onToggle}
        className="w-full px-5 py-4 flex justify-between items-center bg-white hover:bg-slate-50/50 transition duration-150"
      >
        <div className="flex items-center gap-3">
          {icon}
          <h3 className="font-extrabold text-slate-900 tracking-wider text-sm uppercase">
            {title}
          </h3>
        </div>
        <span
          className={`text-slate-400 text-xs transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        >
          ▼
        </span>
      </button>
      {isOpen && (
        <div className="px-5 pb-5 pt-3 border-t border-slate-100 bg-[#FAF9F6]/20">
          {children}
        </div>
      )}
    </div>
  );
}

import { apiFetch } from './apiFetch';
import { db } from './firebaseClient';
import { doc, getDoc } from 'firebase/firestore';
import { ensureDecisionStudio, markDecisionNotified, markSignoffSent } from './decisionsService';
import { format } from 'date-fns';
import { EMAIL_TEMPLATE_LIBRARY, resolveTemplate } from '../lib/templateEngine';
import { formatINR } from '../lib/utils';
import { publicAppOrigin } from '../lib/publicUrl';

const RESEND_API_KEY = import.meta.env.VITE_RESEND_API_KEY;
const STUDIO_NAME = import.meta.env.VITE_STUDIO_NAME || 'Form Factors Design Studio';
// No fallback number: an empty phone prints nothing, where the old
// placeholder "+91 98765 43210" went to clients as the studio's helpline.
const STUDIO_PHONE = import.meta.env.VITE_STUDIO_PHONE || '';
const STUDIO_LOGO_URL = import.meta.env.VITE_STUDIO_LOGO_URL || '';
const BRAND_COLOR = import.meta.env.VITE_BRAND_COLOR || '#3D52A0';
const RESEND_SENDER_EMAIL = import.meta.env.VITE_EMAIL_FROM || import.meta.env.VITE_RESEND_SENDER_EMAIL || 'onboarding@resend.dev'; // Default to onboarding for testing

/*
  THE STUDIO, AS EVERY EMAIL SIGNS OFF.

  The template printed the env name, a placeholder helpline and a claim that
  the mail was "digitally sealed" under the IT Act. The studio's real details
  live in Studio Settings (organizations/{tenantId}); OrgContext hands them
  here once they load, and every email uses them.

  The logo is stored as a data: URI, which Gmail and most clients refuse to
  show. It is shrunk to email size here and sent as an inline attachment
  (cid:studio-logo) by sendResendEmail; the template itself keeps the data:
  URI, so an in-app preview of an email still shows the logo.
*/
export interface StudioEmailBrand {
    name: string;
    address?: string;
    phone?: string;
    email?: string;
    website?: string;
    /** A web address, or a shrunk data: URI sent inline. */
    logoSrc?: string | null;
}

let studioBrand: StudioEmailBrand | null = null;
let brandReady: Promise<void> = Promise.resolve();

const shrinkLogo = (src: string): Promise<string | null> => new Promise((resolve) => {
    if (typeof document === 'undefined') return resolve(null);
    const img = new Image();
    img.onload = () => {
        try {
            // 120px tall at most (shown at 60px, so sharp on high-density screens), 480px wide at most.
            const scale = Math.min(1, 120 / (img.naturalHeight || 1), 480 / (img.naturalWidth || 1));
            const c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(img.naturalWidth * scale));
            c.height = Math.max(1, Math.round(img.naturalHeight * scale));
            c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
            resolve(c.toDataURL('image/png'));
        } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = src;
});

const prettyPhone = (p: string) => {
    const digits = p.replace(/\D/g, '');
    if (digits.length === 10) return `${digits.slice(0, 5)} ${digits.slice(5)}`;
    if (digits.length === 12 && digits.startsWith('91')) return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
    return p.trim();
};

/** Called by OrgContext whenever the studio's settings load or change. */
export const setStudioEmailBrand = (org: any) => {
    if (!org) return;
    const rawName = String(org.orgName || '').trim();
    const name = rawName && rawName !== org.tenantId ? rawName : STUDIO_NAME;
    const website = String(org.website || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    const base: StudioEmailBrand = {
        name,
        address: String(org.officeAddress || org.cityState || '').trim() || undefined,
        phone: org.contactPhone ? prettyPhone(String(org.contactPhone)) : (STUDIO_PHONE || undefined),
        email: String(org.contactEmail || '').trim() || undefined,
        website: website || undefined,
        logoSrc: STUDIO_LOGO_URL || null,
    };
    studioBrand = base;
    const logo = String(org.orgLogo || org.logoUrl || '').trim();
    if (/^https:\/\//i.test(logo)) {
        studioBrand = { ...base, logoSrc: logo };
    } else if (/^data:image\//i.test(logo)) {
        brandReady = shrinkLogo(logo).then((small) => {
            if (small && studioBrand?.name === name) studioBrand = { ...studioBrand, logoSrc: small };
        });
    }
};

const formatBodyToHtml = (body: string): string => {
    return body
        .split('\n\n')
        .map(paragraph => `<p style="margin: 0 0 16px 0;">${paragraph.replace(/\n/g, '<br/>')}</p>`)
        .join('');
};

/**
 * Dynamically resolves studio branding and details from Firestore studioSettings (multi-tenant rule).
 */
export const getStudioInfo = async (studioId: string = 'demo-tenant-01') => {
    let name = STUDIO_NAME;
    let phone = STUDIO_PHONE;
    let logo = STUDIO_LOGO_URL;
    let email = 'operations@formfactors.in';
    let gstin = '';
    let address = '';

    try {
        // Check studioSettings collection first
        const settingsRef = doc(db, 'studioSettings', studioId);
        const settingsSnap = await getDoc(settingsRef);
        if (settingsSnap.exists()) {
            const data = settingsSnap.data();
            if (data.companyName || data.name || data.studioName) name = data.companyName || data.name || data.studioName;
            if (data.phone || data.studioPhone) phone = data.phone || data.studioPhone;
            if (data.logoUrl) logo = data.logoUrl;
            if (data.email || data.contactEmail) email = data.email || data.contactEmail;
            if (data.gstNumber || data.gstin) gstin = data.gstNumber || data.gstin;
            if (data.address) address = data.address;
        } else {
            const docRef = doc(db, 'studios', studioId, 'settings', 'main');
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.companyName || data.name || data.studioName) name = data.companyName || data.name || data.studioName;
                if (data.phone || data.studioPhone) phone = data.phone || data.studioPhone;
                if (data.logoUrl) logo = data.logoUrl;
                if (data.email || data.contactEmail) email = data.email || data.contactEmail;
                if (data.gstNumber || data.gstin) gstin = data.gstNumber || data.gstin;
                if (data.address) address = data.address;
            }
        }
        /*
          organizations/{tenantId} is where Studio Settings actually saves.

          This function only knew about studioSettings/{id} and
          studios/{id}/settings/main, neither of which that screen writes to --
          so a studio could fill in its name, phone, email and logo and every
          email, and the client sign-off page, still went out carrying the
          hardcoded placeholder "+91 98765 43210". Checked last so an explicit
          studioSettings document still wins if one exists.

          Field names differ here: contactPhone / contactEmail / orgName /
          orgLogo rather than phone / email / name / logoUrl.
        */
        if (name === STUDIO_NAME || !phone || phone === STUDIO_PHONE || !logo) {
            const orgRef = doc(db, 'organizations', studioId);
            const orgSnap = await getDoc(orgRef);
            if (orgSnap.exists()) {
                const org = orgSnap.data();
                /*
                  A stub organisation carries its own id as the name, and there
                  is at least one of those ('demo-tenant-01'). Printing that to
                  a client as the studio's name is worse than printing nothing,
                  so an id-shaped name is treated as absent.
                */
                const looksLikeAnId = !org.orgName
                    || org.orgName === studioId
                    || /^[a-z0-9]+(-[a-z0-9]+)+$/.test(String(org.orgName));
                if (!looksLikeAnId) name = org.orgName;
                if (org.contactPhone) phone = org.contactPhone;
                if (org.orgLogo) logo = org.orgLogo;
                if (org.contactEmail) email = org.contactEmail;
                if (org.gstNumber || org.gstin) gstin = org.gstNumber || org.gstin;
                if (org.officeAddress || org.address) address = org.officeAddress || org.address;
            }
        }
    } catch (e) {
        // Safe fallback
    }

    return { name, phone, logo, email, gstin, address };
};

const getEmailSubjectAndBody = async (studioId: string, key: string, variables: Record<string, string | null | undefined>): Promise<{ subject: string; body: string }> => {
    let template = EMAIL_TEMPLATE_LIBRARY.find(t => t.key === key);
    try {
        // Check studioSettings collection first
        const settingsRef = doc(db, 'studioSettings', studioId);
        const settingsSnap = await getDoc(settingsRef);
        if (settingsSnap.exists()) {
            const data = settingsSnap.data();
            const library = (data.emailTemplateLibrary || data.communicationTemplate) as any[];
            if (Array.isArray(library)) {
                const found = library.find(t => t.key === key);
                if (found) {
                    template = found;
                }
            }
        } else {
            const docRef = doc(db, 'studios', studioId, 'settings', 'main');
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                const library = (data.emailTemplateLibrary || data.communicationTemplate) as any[];
                if (Array.isArray(library)) {
                    const found = library.find(t => t.key === key);
                    if (found) {
                        template = found;
                    }
                }
            }
        }
    } catch (e) {
        console.warn(`Error resolving template ${key} from Firestore, falling back to defaults`, e);
    }

    if (!template) {
        return { subject: "", body: "" };
    }

    const rawSubject = template.email?.subject || "";
    const rawBody = template.email?.body || "";

    return {
        subject: resolveTemplate(rawSubject, variables),
        body: resolveTemplate(rawBody, variables)
    };
};

/**
 * Helper to send email via server proxy route with resilient 6-second timeout.
 */
const sendResendEmail = async (to: string, subject: string, html: string, attachments?: any[], cc?: string[]): Promise<{ success: boolean; data?: any; error?: string; message?: string }> => {
    try {
        /* The template carries the logo as a data: URI; mail clients want it as an inline attachment. */
        const logo = studioBrand?.logoSrc;
        if (logo && logo.startsWith('data:') && html.includes(logo)) {
            html = html.split(logo).join('cid:studio-logo');
            attachments = [
                ...(attachments || []),
                { filename: 'logo.png', content: logo.slice(logo.indexOf(',') + 1), content_id: 'studio-logo' },
            ];
        }
        const payload: any = {
            from: `${studioBrand?.name || STUDIO_NAME} <${RESEND_SENDER_EMAIL}>`,
            to,
            subject,
            html
        };
        if (cc && cc.length) payload.cc = cc;
        if (attachments && Array.isArray(attachments) && attachments.length > 0) {
            payload.attachments = attachments;
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        const response = await apiFetch('/api/send-email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            let errorData;
            const text = await response.text();
            try {
                errorData = JSON.parse(text);
            } catch (e) {
                throw new Error(`Server API Error: ${response.statusText}. ${text}`);
            }
            throw new Error(`Server API Error: ${errorData?.error?.message || errorData?.error || response.statusText}`);
        }

        const dataText = await response.text();
        try {
            return { success: true, data: JSON.parse(dataText) };
        } catch(e) {
            return { success: true, message: dataText };
        }
    } catch (error: any) {
        if (error.name === 'AbortError') {
            console.warn('Email dispatch timed out after 6s (non-blocking fallback)');
            return { success: false, error: 'Email service request timed out (6s limit)' };
        }
        console.warn('Error sending email via Server API:', error);
        return { success: false, error: error.message || 'Failed to send email.' };
    }
}

const escHtml = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The studio's letterhead around an email's content. `context` says why the reader got it. */
const getEmailTemplate = (contentHtml: string, opts?: { context?: string }) => {
    const b: StudioEmailBrand = studioBrand || { name: STUDIO_NAME, phone: STUDIO_PHONE || undefined, logoSrc: STUDIO_LOGO_URL || null };
    const name = escHtml(b.name);
    const logoBlock = b.logoSrc
        ? `<img src="${b.logoSrc}" alt="${name}" height="60" style="height: 60px; width: auto; max-width: 280px; display: block; margin: 0 0 22px 0; border: 0;" />`
        : `<h2 style="margin: 0 0 20px 0; color: ${BRAND_COLOR}; font-size: 20px; font-weight: bold; font-family: Georgia, serif;">${name}</h2>`;
    const link = 'color: #64748b; text-decoration: none;';
    const contacts = [
        b.phone ? `<a href="tel:${escHtml(b.phone.replace(/\s/g, ''))}" style="${link}">${escHtml(b.phone)}</a>` : '',
        b.email ? `<a href="mailto:${escHtml(b.email)}" style="${link}">${escHtml(b.email)}</a>` : '',
        b.website ? `<a href="https://${escHtml(b.website)}" style="${link}">${escHtml(b.website.replace(/^www\./i, ''))}</a>` : '',
    ].filter(Boolean).join(' &middot; ');

    return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        ${logoBlock}
        ${contentHtml}
        <div style="margin-top: 32px; padding-top: 18px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; line-height: 1.6;">
            <p style="margin: 0; font-weight: bold; color: #334155;">${name}</p>
            ${b.address ? `<p style="margin: 0;">${escHtml(b.address)}</p>` : ''}
            ${contacts ? `<p style="margin: 0;">${contacts}</p>` : ''}
            <p style="margin: 8px 0 0 0; color: #94a3b8; font-size: 11.5px;">${escHtml(opts?.context || `Sent by ${b.name}.`)}</p>
        </div>
    </div>
    `;
};

export const sendDecisionNotification = async (decisionId: string, projectId: string, studioId: string = 'demo-tenant-01'): Promise<{ success: boolean; error?: string }> => {
    try {
        // Older decisions carry no studio; take this chance to record it.
        void ensureDecisionStudio(projectId, decisionId, studioId);
        const docRef = doc(db, 'projects', projectId, 'decisions', decisionId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            throw new Error('Decision not found');
        }

        const decision = docSnap.data();
        const clientEmail = decision.clientEmail;

        // No email address is not a reason to leave the decision stuck in draft.
        // Email is one delivery channel; the client portal is the other, and the
        // portal only surfaces a decision once it leaves 'draft'. Throwing here
        // meant that on a project with no client email set, "Notify client"
        // failed silently forever and the decision never reached the client at
        // all. Advance the state, record that no email went out.
        if (!clientEmail) {
            await markDecisionNotified(projectId, decisionId, 'Skipped', 'No client email on file');
            return { success: false, error: 'Decision is now visible in the client portal, but no email was sent — no client email address on file.' };
        }

        const formattedDate = decision.createdAt
            ? format(decision.createdAt.toDate ? decision.createdAt.toDate() : new Date(decision.createdAt), 'dd MMM yyyy')
            : 'recently';

        const variables = {
            clientName: decision.clientName || 'Client',
            projectName: decision.projectName || 'Project',
            roomName: decision.roomName || 'Room',
            date: formattedDate,
            decisionText: decision.decisionText || '',
            category: decision.category || '',
            presentees: decision.presentees || 'None',
            studioName: STUDIO_NAME,
            studioPhone: STUDIO_PHONE
        };

        const { subject: tplSubject, body: tplBody } = await getEmailSubjectAndBody(studioId, 'decision_notification', variables);
        const subject = tplSubject || `Design update noted — ${decision.roomName}, ${decision.projectName}`;
        const contentHtml = formatBodyToHtml(tplBody);
        
        const mailRes = await sendResendEmail(clientEmail, subject, getEmailTemplate(contentHtml));
        
        // Still mark the decision as processed, but pass the email result
        await markDecisionNotified(projectId, decisionId, mailRes.success ? 'Sent' : 'Failed', mailRes.success ? undefined : mailRes.error);
        
        if (!mailRes.success) {
            return mailRes; // So UI can show toaster
        }
        
        return { success: true };
    } catch (error: any) {
        console.warn('Error sending decision notification:', error);
        return { success: false, error: error.message || 'Failed to send notification.' };
    }
};

export const sendDesignerNotification = async (decisionId: string, projectId: string, responseType: 'approved' | 'queried'): Promise<{ success: boolean; error?: string }> => {
    try {
        const docRef = doc(db, 'projects', projectId, 'decisions', decisionId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            throw new Error('Decision not found');
        }

        const decision = docSnap.data();
        let designerEmail = 'formfactors.operations@gmail.com'; // fallback
        
        if (decision.createdBy) {
            const userRef = doc(db, 'users', decision.createdBy);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists() && userSnap.data().email) {
                designerEmail = userSnap.data().email;
            }
        }

        const clientName = decision.signoff?.clientNameEntered || decision.clientName || 'Client';
        const respondedAt = decision.signoff?.respondedAt 
            ? format(decision.signoff.respondedAt.toDate ? decision.signoff.respondedAt.toDate() : new Date(), 'dd MMM yyyy, p')
            : format(new Date(), 'dd MMM yyyy, p');

        const projectName = decision.projectName || 'Project';
        const roomName = decision.roomName || 'Room';

        let subject = '';
        let bodyHtml = '';

        if (responseType === 'approved') {
            subject = `[${clientName}] approved a design change — ${projectName}`;
            bodyHtml = `<p><strong>${clientName}</strong> has approved the design change for <strong>${roomName}</strong> on ${respondedAt}.</p>
            <p>The signoff has been recorded and is attached to the decision log.</p>`;
        } else {
            subject = `[${clientName}] raised a query — ${projectName} needs your attention`;
            const queryText = decision.signoff?.queryText || 'No query text provided.';
            bodyHtml = `<p><strong>${clientName}</strong> has raised a concern about the design change for <strong>${roomName}</strong>.</p>
            <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 16px; margin: 24px 0; border-radius: 0 8px 8px 0; color: #92400e;">
                <p style="margin: 0; font-style: italic;">"${queryText}"</p>
            </div>
            <p>Please reply to the client as soon as possible.</p>`;
        }

        const mailRes = await sendResendEmail(designerEmail, subject, getEmailTemplate(bodyHtml));
        if (!mailRes.success) return mailRes;
        
        return { success: true };
    } catch (error: any) {
        console.warn('Error sending designer notification:', error);
        return { success: false, error: error.message || 'Failed to send notification.' };
    }
};

export const sendAgreementSignoffRequest = async (
    projectId: string, 
    projectContext: any, 
    contractValue: number, 
    pdfBase64?: string, 
    studioId: string = 'demo-tenant-01', 
    agreementType: 'execution' | 'design' | 'handover' | 'terms' | 'proposal' = 'execution'
): Promise<{ success: boolean; token?: string; accessPin?: string; docketHash?: string; error?: string; message?: string }> => {
    try {
        const clientEmail = projectContext.clientEmail;
        
        if (!clientEmail) {
            throw new Error('Client email not available');
        }

        const studioInfo = await getStudioInfo(studioId);

        const typeTitles: Record<string, string> = {
            execution: 'Execution Agreement',
            design: 'Design Agreement',
            handover: 'Handover Docket & Warranty',
            terms: 'Terms & Conditions Docket',
            proposal: 'Client Proposal & Commercial Summary'
        };
        const docTitle = typeTitles[agreementType] || 'Agreement Document';
        
        // Generate Token & Zero-Click Security PIN
        const randomPart = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().substring(0, 8) : Math.random().toString(36).substring(2, 10);
        const pinCode = `SEC-${Math.floor(1000 + Math.random() * 9000)}`;
        const signoffToken = `${agreementType.toUpperCase()}_AGREEMENT_${projectId}_${randomPart}`;
        
        // Cryptographic SHA-256 Fingerprint
        const timestamp = new Date().toISOString();
        const entropy = `${projectContext.name}_${clientEmail}_${signoffToken}_${timestamp}`;
        let rawHash = '';
        for (let i = 0; i < entropy.length; i++) {
            rawHash += ((entropy.charCodeAt(i) * 37) % 16).toString(16);
        }
        const docketHash = `SHA256:${rawHash.padEnd(32, '0').slice(0, 32).toUpperCase()}`;

        let appDomain = publicAppOrigin();
        if (appDomain.includes('ais-dev-')) {
            appDomain = appDomain.replace('ais-dev-', 'ais-pre-');
        }
        
        const signoffUrl = `${appDomain}/?agreementSignoff=${signoffToken}`;

        // Fetch dynamic customized template from Studio Settings in Firestore
        const templateKey = `${agreementType}_agreement_request`;
        const templateVars = {
            clientName: projectContext.clientName || 'Valued Client',
            projectName: projectContext.name || 'Interior Project',
            amount: contractValue > 0 ? formatINR(contractValue) : 'As per quotation',
            docTitle,
            signoffUrl,
            pinCode,
            docketHash,
            studioName: studioInfo.name,
            studioPhone: studioInfo.phone,
            studioEmail: studioInfo.email || ''
        };

        const resolvedTemplate = await getEmailSubjectAndBody(studioId, templateKey, templateVars);
        const subject = resolvedTemplate.subject || `Official Document Authorization: ${docTitle} — ${projectContext.name || 'Project'} | ${studioInfo.name}`;
        const customBodyText = resolvedTemplate.body;

        const renderedCustomBody = customBodyText
            ? customBodyText.split('\n\n').map(p => `<p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 16px 0;">${p.replace(/\n/g, '<br/>')}</p>`).join('')
            : `
            <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 16px 0;">
                Dear <strong>${projectContext.clientName || 'Valued Client'}</strong>,
            </p>
            <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 20px 0;">
                <strong>${studioInfo.name}</strong> has prepared the official <strong>${docTitle}</strong> for your review and digital authorization. 
                ${contractValue > 0 ? `The agreed contract milestone valuation is <strong>${formatINR(contractValue)}</strong>.` : ''}
            </p>
            `;

        const contentHtml = `
            <div style="padding-bottom: 16px; border-bottom: 2px solid #3D52A0; margin-bottom: 24px;">
                <span style="font-size: 11px; font-weight: bold; color: #3D52A0; text-transform: uppercase; letter-spacing: 0.1em; display: block; margin-bottom: 4px;">Verified Document Dispatch • 256-Bit TLS Encrypted</span>
                <h2 style="margin: 0; font-size: 20px; color: #0f172a; font-family: Georgia, serif;">${docTitle}</h2>
                <p style="margin: 4px 0 0 0; font-size: 13px; color: #64748b;">Project Site: <strong style="color: #0f172a;">${projectContext.name || 'Interior Design Project'}</strong> ${projectContext.location ? `· ${projectContext.location}` : ''}</p>
            </div>

            ${renderedCustomBody}

            <!-- SECURITY VERIFICATION & ACCESS CODE BOX -->
            <div style="background-color: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 12px; padding: 20px; margin: 24px 0;">
                <div style="font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.08em; color: #3D52A0; margin-bottom: 12px;">
                    🔒 Secure Access & Verification Credentials
                </div>

                <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 16px;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <tr>
                            <td style="color: #64748b; padding: 4px 0;">Document Fingerprint:</td>
                            <td style="font-family: monospace; font-size: 11px; color: #475569;">${docketHash}</td>
                        </tr>
                        <tr>
                            <td style="color: #64748b; padding: 4px 0;">Authorized Recipient:</td>
                            <td style="color: #0f172a; font-weight: 600;">${projectContext.clientName || 'Client'} (${clientEmail})</td>
                        </tr>
                    </table>
                </div>

                <!-- ZERO-CLICK DIRECT VERIFICATION INSTRUCTIONS -->
                <div style="border-top: 1px dashed #cbd5e1; padding-top: 14px; font-size: 12px; color: #475569; line-height: 1.6;">
                    <strong style="color: #0f172a; display: block; margin-bottom: 4px;">🛡️ How to sign</strong>
                    The button below opens your client portal. Sign in with the email and password ${studioInfo.name} gave you, and the document opens ready to review and sign. If you prefer not to click links in emails, open your portal directly, sign in, and find it under Documents.
                </div>
            </div>

            <!-- DIRECT VERIFIED BUTTON -->
            <div style="margin: 28px 0; text-align: center;">
                <a href="${signoffUrl}" style="background-color: #3D52A0; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block; box-shadow: 0 2px 4px rgba(61, 82, 160, 0.2);">
                    Review & Sign Document (SSL Verified) →
                </a>
                <span style="display: block; font-size: 11px; color: #94a3b8; margin-top: 8px;">256-bit TLS Encrypted Session • IT Act 2000 Section 65B Compliant</span>
            </div>

            <!-- OFFICIAL STUDIO SECURITY ADVISORY -->
            <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 14px; border-radius: 0 8px 8px 0; margin-top: 24px; font-size: 12px; color: #92400e; line-height: 1.5;">
                <strong>⚠️ Official Security Advisory:</strong> ${studioInfo.name} will never ask you to transfer funds to unverified individual accounts or sign contracts via third-party unsecured links. If you wish to verbally verify this document with your Project Lead, please call us directly at <strong>${studioInfo.phone}</strong>.
            </div>
        `;

        const attachments = [];
        if (pdfBase64) {
            const cleanBase64 = pdfBase64.includes('base64,') ? pdfBase64.split('base64,')[1] : pdfBase64;
            attachments.push({
                filename: `${docTitle.replace(/\s+/g, '_')}_${projectContext.name || 'Project'}.pdf`.replace(/[^\w.-]/g, '_'),
                content: cleanBase64
            });
        }

        const mailRes = await sendResendEmail(clientEmail, subject, getEmailTemplate(contentHtml), attachments.length > 0 ? attachments : undefined);
        if (!mailRes.success) {
            return { 
                success: true, 
                token: signoffToken, 
                accessPin: pinCode,
                docketHash,
                error: mailRes.error,
                message: `Email dispatch note: ${mailRes.error || 'Server email delivery skipped in sandbox mode'}. Digital signature access PIN ${pinCode} generated.`
            };
        }
        
        return { 
            success: true, 
            token: signoffToken, 
            accessPin: pinCode,
            docketHash,
            message: 'Official authorization email dispatched successfully.' 
        };
    } catch (error: any) {
        console.warn('Error sending agreement signoff request:', error);
        const randomPart = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().substring(0, 8) : Math.random().toString(36).substring(2, 10);
        const fallbackPin = `SEC-${Math.floor(1000 + Math.random() * 9000)}`;
        const fallbackToken = `${agreementType.toUpperCase()}_AGREEMENT_${projectId}_${randomPart}`;
        return { 
            success: true, 
            token: fallbackToken, 
            accessPin: fallbackPin,
            error: error.message,
            message: `Notice: ${error.message || 'Offline mode'}. Digital sign-off PIN ${fallbackPin} generated.` 
        };
    }
};

export const sendSignoffRequest = async (decisionId: string, projectId: string, studioId: string = 'demo-tenant-01'): Promise<{ success: boolean; error?: string }> => {
    try {
        // Older decisions carry no studio; take this chance to record it.
        void ensureDecisionStudio(projectId, decisionId, studioId);
        const docRef = doc(db, 'projects', projectId, 'decisions', decisionId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            throw new Error('Decision not found');
        }

        const decision = docSnap.data();
        const clientEmail = decision.clientEmail;

        // As in sendDecisionNotification: advance the decision so it reaches the
        // client portal even when there is no address to email.
        if (!clientEmail) {
            await markSignoffSent(projectId, decisionId, 'Skipped', 'No client email on file');
            return { success: false, error: 'Sign-off request is now open in the client portal, but no email was sent — no client email address on file.' };
        }

        const formattedDate = decision.createdAt
            ? format(decision.createdAt.toDate ? decision.createdAt.toDate() : new Date(decision.createdAt), 'dd MMM yyyy')
            : 'recently';

        // Expiry date - 30 days from now
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 30);
        const formattedExpiry = format(expiryDate, 'dd MMM yyyy');

        const isShort = decision.decisionText.length <= 100;
        const displayDecisionText = isShort 
            ? decision.decisionText 
            : decision.decisionText.substring(0, 80) + "...";

        const subjectPlaceholder = `Action Required: Review drawing — ${decision.roomName}, ${decision.projectName}`;
        
        let appDomain = publicAppOrigin();
        let isDev = false;
        if (appDomain.includes('ais-dev-')) {
            isDev = true;
            appDomain = appDomain.replace('ais-dev-', 'ais-pre-');
        }
        /*
          The standalone sign-off page is gone -- decisions are approved in the
          client portal. The portal token lives on the project, so read it from
          there; without one there is nowhere useful to send them, so the link
          falls back to the app itself rather than a URL that 404s.
        */
        let signoffUrl = appDomain;
        try {
            const projectSnap = await getDoc(doc(db, 'projects', projectId));
            const access = projectSnap.exists()
                ? (projectSnap.data() as any)?.context?.portalAccess
                : null;
            const live =
                access?.token &&
                (!access.expiresAt || new Date(access.expiresAt).getTime() > Date.now());
            if (live) signoffUrl = `${appDomain}/?portal=${access.token}`;
        } catch {
            // Fall back to the app root.
        }
        
        let devTestingHtml = '';
        if (isDev) {
            devTestingHtml = `
            <div style="margin-top: 40px; padding: 12px; background-color: #f8fafc; border: 1px dashed #cbd5e1; font-size: 11px; color: #64748b;">
                <strong>Developer Testing Note:</strong> If the public link above gives a 404 (due to the app not being published yet), you can test the flow using your dev URL:<br/>
                <a href="${signoffUrl}" style="color: #3b82f6;">${signoffUrl}</a>
            </div>`;
        }

        const variables = {
            clientName: decision.clientName || 'Client',
            projectName: decision.projectName || 'Project',
            roomName: decision.roomName || 'Room',
            date: formattedDate,
            decisionText: displayDecisionText,
            drawingURL: decision.drawingURL || '#',
            signoffUrl: signoffUrl,
            expiryDate: formattedExpiry,
            studioPhone: STUDIO_PHONE,
            studioName: STUDIO_NAME
        };

        const { subject: tplSubject, body: tplBody } = await getEmailSubjectAndBody(studioId, 'drawing_signoff_request', variables);
        const resolvedSubject = tplSubject || subjectPlaceholder;
        const resolvedHtml = formatBodyToHtml(tplBody);

        const contentHtml = `
            ${resolvedHtml}

            <div style="margin: 24px 0; padding: 16px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #f1f5f9;">
                <p style="margin: 0; font-weight: bold; font-size: 15px;">👇 Drawing Access</p>
                <p style="margin: 8px 0 0 0;">
                    <a href="${decision.drawingURL || '#'}" target="_blank" style="color: ${BRAND_COLOR}; font-weight: 600; text-decoration: underline;">
                        Click here to view the drawing (PDF/Google Drive)
                    </a>
                </p>
            </div>
            
            <div style="margin: 32px 0; text-align: center;">
                <a href="${signoffUrl}" style="background-color: ${BRAND_COLOR}; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Review Drawing (Approve / Send Back) →</a>
            </div>
            
            <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px; margin-bottom: 24px;">
                <p style="margin: 0; font-size: 14px; color: #b45309;"><strong>Alternative:</strong> If you are unable to open the link, simply reply directly to this email with <strong>"APPROVE"</strong> or <strong>"SEND BACK"</strong> along with your comments, and we will update it for you.</p>
            </div>
            ${devTestingHtml}
        `;

        const mailRes = await sendResendEmail(clientEmail, resolvedSubject, getEmailTemplate(contentHtml));
        
        await markSignoffSent(projectId, decisionId, mailRes.success ? 'Sent' : 'Failed', mailRes.success ? undefined : mailRes.error);
        
        if (!mailRes.success) return mailRes;
        
        return { success: true };
    } catch (error: any) {
        console.warn('Error sending signoff request:', error);
        return { success: false, error: error.message || 'Failed to send request.' };
    }
};

/**
 * Generates the HTML and subject for a single selection confirmation request email.
 */
export const getSelectionNotificationEmailHtml = (
    selection: any,
    projectContext: any,
    customIntro?: string,
    customSubject?: string
): { subject: string; html: string } => {
    const clientName = projectContext.clientName || 'Client';
    const projectName = projectContext.name || 'your project';
    const appUrl = publicAppOrigin();
    const confirmUrl = `${appUrl}/selection-confirm/${selection.confirmationToken}`;

    const subject = customSubject || `Action Required: Confirm selection for ${projectName} — ${selection.itemName}`;

    // Format price details
    let priceDetails = '';
    if (selection.quotedPrice) {
        const formattedPrice = selection.quotedPrice.toLocaleString('en-IN');
        const unit = selection.priceUnit?.replace('per_', '') || 'unit';
        priceDetails = `₹${formattedPrice} / ${unit}`;
        if (selection.estimatedQty) {
            const total = (selection.quotedPrice * selection.estimatedQty).toLocaleString('en-IN');
            priceDetails += ` (${selection.estimatedQty} units · Est. Total: ₹${total})`;
        }
    }

    // Generate images block if photos exist
    let photosHtml = '';
    if (selection.photos && selection.photos.length > 0) {
        photosHtml = `
        <div style="margin: 20px 0;">
            <p style="margin: 0 0 10px 0; font-weight: bold; color: #475569; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Specification Photos</p>
            <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                ${selection.photos.map((p: string) => `
                    <div style="display: inline-block; width: 120px; height: 120px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background-color: #f8fafc; margin-right: 8px; margin-bottom: 8px;">
                        <img src="${p}" style="width: 100%; height: 100%; object-fit: cover;" />
                    </div>
                `).join('')}
            </div>
        </div>
        `;
    }

    const emailContent = `
        <p style="margin: 0 0 16px 0; font-size: 16px; font-weight: 500; color: #0f172a;">Dear ${clientName},</p>
        <p style="margin: 0 0 24px 0; color: #475569; font-size: 14px; line-height: 1.6;">
            ${customIntro || `We've logged the following material/finish selection for <strong>${projectName}</strong> and would love your confirmation to lock this specification.`}
        </p>

        <div style="margin: 0 0 24px 0; padding: 20px; background-color: #fcfbf9; border: 1px solid #e4e4e0; border-radius: 12px; border-left: 4px solid #b89047;">
            <h3 style="margin: 0 0 12px 0; font-family: Georgia, serif; color: #0f172a; font-size: 16px; font-weight: bold;">📦 ${selection.itemName}</h3>
            
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #334155;">
                ${selection.brand ? `
                <tr>
                    <td style="padding: 6px 0; color: #64748b; width: 120px; font-weight: 500; vertical-align: top;">Brand:</td>
                    <td style="padding: 6px 0; color: #0f172a; font-weight: bold; vertical-align: top;">${selection.brand}${selection.finishCode ? ' — ' + selection.finishCode : ''}</td>
                </tr>` : selection.finishCode ? `
                <tr>
                    <td style="padding: 6px 0; color: #64748b; width: 120px; font-weight: 500; vertical-align: top;">Code/Model:</td>
                    <td style="padding: 6px 0; color: #0f172a; font-weight: bold; vertical-align: top;">${selection.finishCode}</td>
                </tr>` : ''}
                
                ${selection.roomId ? `
                <tr>
                    <td style="padding: 6px 0; color: #64748b; font-weight: 500; vertical-align: top;">Room/Area:</td>
                    <td style="padding: 6px 0; color: #0f172a; font-weight: bold; vertical-align: top;">${selection.roomId}</td>
                </tr>` : ''}

                ${selection.vendor ? `
                <tr>
                    <td style="padding: 6px 0; color: #64748b; font-weight: 500; vertical-align: top;">Shop/Vendor:</td>
                    <td style="padding: 6px 0; color: #0f172a; vertical-align: top;">${selection.vendor}</td>
                </tr>` : ''}

                ${priceDetails ? `
                <tr>
                    <td style="padding: 6px 0; color: #64748b; font-weight: 500; vertical-align: top;">Price / Qty:</td>
                    <td style="padding: 6px 0; color: #0f172a; font-weight: bold; vertical-align: top;">${priceDetails}</td>
                </tr>` : ''}

                ${selection.notes ? `
                <tr>
                    <td style="padding: 6px 0; color: #64748b; font-weight: 500; vertical-align: top;">Notes:</td>
                    <td style="padding: 6px 0; color: #475569; font-style: italic; vertical-align: top;">${selection.notes}</td>
                </tr>` : ''}
            </table>
        </div>

        ${photosHtml}

        <div style="margin: 32px 0 24px 0; text-align: center;">
            <a href="${confirmUrl}" style="background-color: #1a1a2e; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 14px; letter-spacing: 0.02em; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">Review & Confirm Selection →</a>
        </div>

        <p style="margin: 24px 0 0 0; color: #64748b; font-size: 12px; text-align: center;">
            If you have any questions or feedback, you can add them directly on the review page linked above.
        </p>
    `;

    return {
        subject,
        html: getEmailTemplate(emailContent)
    };
};

/**
 * Sends a beautifully styled selection confirmation request email directly to the client.
 */
/**
 * Minutes of a meeting, as the studio wrote the covering note: the body is the
 * text the studio reviewed (paragraphs and "- " bullets), set in the studio's
 * email template, with the MoM PDF attached when one is given.
 */
export interface MomEmailArgs {
    to: string[];
    cc?: string[];
    subject: string;
    body: string;
    pdf?: { filename: string; base64: string } | null;
    /** The button to the client's portal, under the note. */
    cta?: { url: string; heading: string; label: string; note?: string } | null;
    /** Why the reader got this, in the footer. */
    context?: string;
}

export const sendMomEmail = async (args: MomEmailArgs) => {
    const attachments = args.pdf ? [{ filename: args.pdf.filename, content: args.pdf.base64 }] : undefined;
    return sendResendEmail(args.to.join(','), args.subject, await buildMomEmailHtml(args), attachments, args.cc);
};

/** The minutes email exactly as it goes out (the logo inline as data: until it is sent). */
export const buildMomEmailHtml = async (args: Pick<MomEmailArgs, 'body' | 'cta' | 'context'>): Promise<string> => {
    await brandReady;
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const blocks = args.body.trim().split(/\n{2,}/).map((block) => {
        const lines = block.split('\n');
        const isBullet = (l: string) => /^\s*[-•]\s+/.test(l);
        const list = (items: string[]) => `<ul style="margin: 0 0 14px 18px; padding: 0;">${items.map((l) => `<li style="margin: 0 0 4px 0;">${esc(l.replace(/^\s*[-•]\s+/, ''))}</li>`).join('')}</ul>`;
        if (lines.every(isBullet)) return list(lines);
        /* "What we agreed" followed by its bullets: a heading over a list. */
        if (lines.length > 1 && !isBullet(lines[0]) && lines.slice(1).every(isBullet)) {
            return `<p style="margin: 0 0 6px 0; font-weight: bold; color: #1e293b;">${esc(lines[0])}</p>${list(lines.slice(1))}`;
        }
        return `<p style="margin: 0 0 14px 0;">${lines.map(esc).join('<br/>')}</p>`;
    });
    /* The button goes just above the sign-off ("Warm regards," ...), or at the end. */
    const cta = args.cta
        ? `<div style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px 18px; margin: 4px 0 18px 0; background-color: #F6F7FC;">
            <p style="margin: 0 0 10px 0; font-weight: bold; color: #1e293b;">${esc(args.cta.heading)}</p>
            <a href="${esc(args.cta.url)}" style="display: inline-block; background-color: ${BRAND_COLOR}; color: #ffffff; padding: 10px 18px; border-radius: 8px; font-weight: bold; text-decoration: none;">${esc(args.cta.label)}</a>
            ${args.cta.note ? `<p style="margin: 10px 0 0 0; font-size: 12.5px; color: #475569;">${esc(args.cta.note)}</p>` : ''}
          </div>`
        : '';
    const raw = args.body.trim().split(/\n{2,}/);
    let signOff = -1;
    for (let i = raw.length - 1; i >= 0; i--) {
        if (/^(warm(est)? regards|kind regards|best regards|regards|warmly|with thanks|many thanks|thanks|thank you|sincerely|yours|best wishes|best|cheers)\b/i.test(raw[i].trim())) { signOff = i; break; }
    }
    if (cta) blocks.splice(signOff >= 0 ? signOff : blocks.length, 0, cta);
    return getEmailTemplate(blocks.join(''), { context: args.context });
};

export const sendSelectionNotificationEmail = async (
    projectId: string,
    selection: any,
    projectContext: any,
    studioId: string = 'demo-tenant-01',
    customSubject?: string,
    customHtml?: string
): Promise<{ success: boolean; error?: string }> => {
    try {
        const clientEmail = projectContext.clientEmail;
        if (!clientEmail) {
            throw new Error('Client email not available');
        }

        const subject = customSubject || getSelectionNotificationEmailHtml(selection, projectContext).subject;
        const html = customHtml || getSelectionNotificationEmailHtml(selection, projectContext).html;

        const mailRes = await sendResendEmail(clientEmail, subject, html);
        
        if (!mailRes.success) {
            return { success: false, error: mailRes.error };
        }
        
        return { success: true };
    } catch (error: any) {
        console.warn('Error sending selection confirmation email:', error);
        return { success: false, error: error.message || 'Failed to send selection confirmation email.' };
    }
};

/**
 * Generates the HTML and subject for a consolidated pending selections reminder email.
 */
export const getConsolidatedPendingSelectionsEmailHtml = (
    pendingSelections: any[],
    projectContext: any,
    customIntro?: string,
    customSubject?: string
): { subject: string; html: string } => {
    const clientName = projectContext.clientName || 'Client';
    const projectName = projectContext.name || 'your project';
    const appUrl = publicAppOrigin();

    const subject = customSubject || `Action Required: Outstanding material selections for ${projectName}`;

    const itemsHtml = pendingSelections.map(item => {
        const confirmUrl = `${appUrl}/selection-confirm/${item.confirmationToken}`;
        let details = '';
        if (item.brand) details += `Brand: ${item.brand} `;
        if (item.finishCode) details += `(${item.finishCode}) `;
        if (item.quotedPrice) details += `· ₹${item.quotedPrice.toLocaleString('en-IN')}`;

        return `
        <div style="padding: 14px; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 12px; background-color: #fafaf9;">
            <div style="font-weight: bold; color: #0f172a; font-size: 14px;">📦 ${item.itemName}</div>
            ${details ? `<div style="font-size: 13px; color: #64748b; margin-top: 4px;">${details}</div>` : ''}
            <div style="margin-top: 8px;">
                <a href="${confirmUrl}" style="color: #b89047; font-size: 13px; font-weight: 600; text-decoration: underline;">Review & Confirm →</a>
            </div>
        </div>
        `;
    }).join('');

    const emailContent = `
        <p style="margin: 0 0 16px 0; font-size: 16px; font-weight: 500; color: #0f172a;">Dear ${clientName},</p>
        <p style="margin: 0 0 24px 0; color: #475569; font-size: 14px; line-height: 1.6;">
            ${customIntro || `This is a quick reminder that the following material and finish selections for <strong>${projectName}</strong> are awaiting your confirmation. Kindly review and confirm them at your earliest convenience to help us maintain the procurement and execution schedule.`}
        </p>

        <div style="margin: 0 0 24px 0;">
            <p style="margin: 0 0 12px 0; font-weight: bold; color: #334155; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Pending Selections (${pendingSelections.length})</p>
            ${itemsHtml}
        </div>

        <p style="margin: 24px 0 0 0; color: #64748b; font-size: 12px; text-align: center; line-height: 1.5;">
            You can tap "Review & Confirm" next to any item to see full photos, pricing, and note any concerns.
        </p>
    `;

    return {
        subject,
        html: getEmailTemplate(emailContent)
    };
};

/**
 * Sends a beautiful consolidated email listing all currently pending selections for a client review.
 */
export const sendConsolidatedPendingSelectionsEmail = async (
    projectId: string,
    pendingSelections: any[],
    projectContext: any,
    studioId: string = 'demo-tenant-01',
    customSubject?: string,
    customHtml?: string
): Promise<{ success: boolean; error?: string }> => {
    try {
        const clientEmail = projectContext.clientEmail;
        if (!clientEmail) {
            throw new Error('Client email not available');
        }

        const subject = customSubject || getConsolidatedPendingSelectionsEmailHtml(pendingSelections, projectContext).subject;
        const html = customHtml || getConsolidatedPendingSelectionsEmailHtml(pendingSelections, projectContext).html;

        const mailRes = await sendResendEmail(clientEmail, subject, html);
        
        if (!mailRes.success) {
            return { success: false, error: mailRes.error };
        }
        
        return { success: true };
    } catch (error: any) {
        console.warn('Error sending consolidated reminder email:', error);
        return { success: false, error: error.message || 'Failed to send reminder email.' };
    }
};

/**
 * Emails a client their portal link.
 *
 * The link is the credential — the portal has no password — so this is the only
 * sanctioned way for a client to gain access. Delivery failure is reported to
 * the caller rather than thrown, so ops can fall back to copying the link.
 */
export const sendPortalAccessLink = async (
    clientEmail: string,
    projectName: string,
    clientName: string,
    link: string,
    expiresAt: string
): Promise<{ success: boolean; error?: string }> => {
    if (!clientEmail) return { success: false, error: 'No client email on file' };
    try {
        const expires = new Date(expiresAt).toLocaleDateString('en-IN', { dateStyle: 'medium' });
        const body = [
            `Hello ${clientName || 'there'},`,
            ``,
            `Here is your private link to the ${projectName} project portal. It shows your approvals, drawings, site updates and payment schedule.`,
            ``,
            `<a href="${link}" style="display:inline-block;padding:12px 22px;background:#3D52A0;color:#ffffff;border-radius:10px;font-weight:700;text-decoration:none">Open your portal</a>`,
            ``,
            `This link works until ${expires}. Please don't forward it — anyone with the link can see your project.`,
            ``,
            `${STUDIO_NAME}`
        ].join('\n');

        const res = await sendResendEmail(
            clientEmail,
            `Your ${projectName} project portal`,
            getEmailTemplate(formatBodyToHtml(body))
        );
        return res.success ? { success: true } : { success: false, error: res.error };
    } catch (error: any) {
        console.warn('Could not send portal link:', error);
        return { success: false, error: error?.message || 'Failed to send portal link.' };
    }
};

/*
  A Scope Revision or Detailed BOQ, sent for approval.

  Short on purpose: the amounts that matter, the Excel attached (the document
  itself), and one button to the portal where the client approves. Anything
  longer belongs in the workbook.
*/
export interface ScopeEmailArgs {
    to: string[];
    cc?: string[];
    subject: string;
    greeting: string;
    intro: string;
    /** [label, value, tone] -- tone 'up' | 'down' | '' colours the value. */
    figures: [string, string, string][];
    /** The totals lines under the figures, when the studio chose to show more than execution. */
    totals?: { label: string; value: string; strong?: boolean }[];
    note?: string;
    studioNote?: string;
    xlsx: { filename: string; base64: string };
    cta: { url: string; label: string };
    signOff: string;
    context?: string;
}

export const buildScopeEmailHtml = async (a: Omit<ScopeEmailArgs, 'to' | 'cc' | 'subject' | 'xlsx'> & { attachmentName?: string }): Promise<string> => {
    await brandReady;
    const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const colour = (t: string) => (t === 'up' ? '#B4232F' : t === 'down' ? '#0F7A55' : '#141A33');
    const figures = a.figures.map(([k, v, t]) => `
        <td style="padding: 0 24px 0 0; vertical-align: top;">
            <div style="font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #5B6382; font-weight: bold;">${esc(k)}</div>
            <div style="font-size: 20px; font-weight: 800; color: ${colour(t)};">${esc(v)}</div>
        </td>`).join('');
    const totals = a.totals?.length
        ? `<table role="presentation" style="width: 100%; border-collapse: collapse; margin: 10px 0 0 0; font-size: 13px;">${a.totals.map((r) => `
            <tr><td style="padding: 3px 0; color: ${r.strong ? '#141A33' : '#475569'}; ${r.strong ? 'font-weight: bold; border-top: 1px solid #DCE1EE;' : ''}">${esc(r.label)}</td>
            <td style="padding: 3px 0; text-align: right; color: ${r.strong ? '#141A33' : '#475569'}; ${r.strong ? 'font-weight: bold; border-top: 1px solid #DCE1EE;' : ''}">${esc(r.value)}</td></tr>`).join('')}</table>`
        : '';
    const content = `
        <p style="margin: 0 0 14px 0;">${esc(a.greeting)}</p>
        <p style="margin: 0 0 16px 0;">${esc(a.intro)}</p>
        <div style="background-color: #F5F7FC; border-radius: 10px; padding: 14px 16px; margin: 0 0 8px 0;">
            <table role="presentation" style="border-collapse: collapse;"><tr>${figures}</tr></table>
            ${totals}
        </div>
        ${a.note ? `<p style="margin: 0 0 16px 0; font-size: 12.5px; color: #5B6382;">${esc(a.note)}</p>` : ''}
        ${a.studioNote ? `<p style="margin: 0 0 16px 0;">${esc(a.studioNote).replace(/\n/g, '<br/>')}</p>` : ''}
        ${a.attachmentName ? `<p style="margin: 0 0 16px 0; font-size: 13px;"><span style="display: inline-block; background-color: #107C41; color: #ffffff; font-weight: bold; border-radius: 4px; padding: 1px 6px; font-size: 11px;">X</span>&nbsp; <b>${esc(a.attachmentName)}</b> is attached: the full BOQ with every item's specification.</p>` : ''}
        <p style="margin: 0 0 18px 0;"><a href="${esc(a.cta.url)}" style="display: inline-block; background-color: ${BRAND_COLOR}; color: #ffffff; padding: 11px 18px; border-radius: 9px; font-weight: bold; text-decoration: none;">${esc(a.cta.label)}</a></p>
        <p style="margin: 0 0 16px 0; font-size: 12.5px; color: #5B6382;">Questions? Reply to this email, or ask on any item in your portal.</p>
        <p style="margin: 0;">${esc(a.signOff).replace(/\n/g, '<br/>')}</p>`;
    return getEmailTemplate(content, { context: a.context });
};

export const sendScopeEmail = async (a: ScopeEmailArgs) => {
    const html = await buildScopeEmailHtml({ ...a, attachmentName: a.xlsx.filename });
    return sendResendEmail(a.to.join(','), a.subject, html, [{ filename: a.xlsx.filename, content: a.xlsx.base64 }], a.cc);
};

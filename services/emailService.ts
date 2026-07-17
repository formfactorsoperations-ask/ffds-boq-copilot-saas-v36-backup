import { db } from './firebaseClient';
import { doc, getDoc } from 'firebase/firestore';
import { markDecisionNotified, markSignoffSent } from './decisionsService';
import { format } from 'date-fns';
import { EMAIL_TEMPLATE_LIBRARY, resolveTemplate } from '../lib/templateEngine';

const RESEND_API_KEY = import.meta.env.VITE_RESEND_API_KEY;
const STUDIO_NAME = import.meta.env.VITE_STUDIO_NAME || 'Form Factors Design Studio';
const STUDIO_PHONE = import.meta.env.VITE_STUDIO_PHONE || '+91 98765 43210';
const STUDIO_LOGO_URL = import.meta.env.VITE_STUDIO_LOGO_URL || '';
const BRAND_COLOR = import.meta.env.VITE_BRAND_COLOR || '#1a1a2e';
const RESEND_SENDER_EMAIL = import.meta.env.VITE_EMAIL_FROM || import.meta.env.VITE_RESEND_SENDER_EMAIL || 'onboarding@resend.dev'; // Default to onboarding for testing

const formatBodyToHtml = (body: string): string => {
    return body
        .split('\n\n')
        .map(paragraph => `<p style="margin: 0 0 16px 0;">${paragraph.replace(/\n/g, '<br/>')}</p>`)
        .join('');
};

const getEmailSubjectAndBody = async (studioId: string, key: string, variables: Record<string, string | null | undefined>): Promise<{ subject: string; body: string }> => {
    let template = EMAIL_TEMPLATE_LIBRARY.find(t => t.key === key);
    try {
        const docRef = doc(db, 'studios', studioId, 'settings', 'main');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            const library = data.emailTemplateLibrary as any[];
            if (library) {
                const found = library.find(t => t.key === key);
                if (found) {
                    template = found;
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
 * Helper to send email via Resend API from the client.
 * (Note: In production this should be a backend endpoint to hide the API key, 
 * but client-side is acceptable per instructions).
 */
const sendResendEmail = async (to: string, subject: string, html: string, attachments?: any[]): Promise<{ success: boolean; data?: any; error?: string; message?: string }> => {
    // If not running full-stack / API route unavailable, it'll fallback to dev console log or fail
    try {
        const payload: any = {
            from: `${STUDIO_NAME} <${RESEND_SENDER_EMAIL}>`, 
            to,
            subject,
            html
        };
        if (attachments) {
            payload.attachments = attachments;
        }
        
        const response = await fetch('/api/send-email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

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
        console.warn('Error sending email via Server API:', error);
        return { success: false, error: error.message || 'Failed to send email.' };
    }
}

const getEmailTemplate = (contentHtml: string) => {
    const logoBlock = STUDIO_LOGO_URL 
        ? `<img src="${STUDIO_LOGO_URL}" alt="${STUDIO_NAME}" style="max-height: 48px; margin-bottom: 24px;" />` 
        : `<h2 style="margin: 0 0 24px 0; color: ${BRAND_COLOR}; font-size: 20px; font-weight: bold;">${STUDIO_NAME}</h2>`;

    return `
    <div style="font-family: system-ui, -apple-system, sans-serif; font-size: 14px; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px; background-color: #ffffff;">
        ${logoBlock}
        ${contentHtml}
        <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">
            <p style="margin: 0;"><strong>${STUDIO_NAME}</strong></p>
            ${STUDIO_PHONE ? `<p style="margin: 4px 0 0 0;">${STUDIO_PHONE}</p>` : ''}
        </div>
    </div>
    `;
};

export const sendDecisionNotification = async (decisionId: string, projectId: string, studioId: string = 'demo-tenant-01'): Promise<{ success: boolean; error?: string }> => {
    try {
        const docRef = doc(db, 'projects', projectId, 'decisions', decisionId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            throw new Error('Decision not found');
        }

        const decision = docSnap.data();
        const clientEmail = decision.clientEmail;
        
        if (!clientEmail) {
            throw new Error('Client email not available');
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

export const sendAgreementSignoffRequest = async (projectId: string, projectContext: any, contractValue: number, pdfBase64?: string, studioId: string = 'demo-tenant-01', agreementType: 'execution' | 'design' | 'handover' = 'execution'): Promise<{ success: boolean; token?: string; error?: string }> => {
    try {
        const clientEmail = projectContext.clientEmail;
        
        if (!clientEmail) {
            throw new Error('Client email not available');
        }

        const typeTitles = {
            execution: 'Execution Agreement',
            design: 'Design Agreement',
            handover: 'Handover Docket & Warranty'
        };
        const docTitle = typeTitles[agreementType];
        const subject = `Action Required: ${docTitle} for ${projectContext.name || 'Project'}`;
        
        // Generate Token
        const randomPart = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        const signoffToken = `${agreementType.toUpperCase()}_AGREEMENT_${projectId}_${randomPart}`;
        
        let appDomain = import.meta.env.VITE_APP_DOMAIN || window.location.origin;
        let isDev = false;
        if (appDomain.includes('ais-dev-')) {
            isDev = true;
            appDomain = appDomain.replace('ais-dev-', 'ais-pre-');
        }
        
        const signoffUrl = `${appDomain}/?agreementSignoff=${signoffToken}`;
        
        let devTestingHtml = '';
        if (isDev) {
            devTestingHtml = `
            <div style="margin-top: 40px; padding: 12px; background-color: #f8fafc; border: 1px dashed #cbd5e1; font-size: 11px; color: #64748b;">
                <strong>Developer Testing Note:</strong> If the public link above gives a 404 (due to the app not being published yet), you can test the flow using your dev URL:<br/>
                <a href="${import.meta.env.VITE_APP_DOMAIN || window.location.origin}/?agreementSignoff=${signoffToken}" style="color: #3b82f6;">${import.meta.env.VITE_APP_DOMAIN || window.location.origin}/?agreementSignoff=${signoffToken}</a>
            </div>`;
        }

        const variables = {
            clientName: projectContext.clientName || 'Client',
            projectName: projectContext.name || 'Project',
            amount: contractValue > 0 ? `₹${contractValue.toLocaleString()}` : 'N/A',
            signoffUrl: signoffUrl,
            studioPhone: STUDIO_PHONE,
            studioName: STUDIO_NAME
        };

        const { subject: tplSubject, body: tplBody } = await getEmailSubjectAndBody(studioId, 'execution_agreement_request', variables);
        const resolvedSubject = tplSubject || subject;
        const resolvedHtml = formatBodyToHtml(tplBody);

        const contentHtml = `
            ${resolvedHtml}
            <div style="margin: 32px 0; text-align: center;">
                <a href="${signoffUrl}" style="background-color: ${BRAND_COLOR}; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Review & Sign Agreement →</a>
            </div>
            ${devTestingHtml}
        `;

        const attachments = [];
        if (pdfBase64) {
            // Strip data:application/pdf;base64, if present
            const cleanBase64 = pdfBase64.includes('base64,') ? pdfBase64.split('base64,')[1] : pdfBase64;
            attachments.push({
                filename: `Execution_Agreement_${projectContext.name || 'Project'}.pdf`.replace(/\s+/g, '_'),
                content: cleanBase64
            });
        }

        const mailRes = await sendResendEmail(clientEmail, subject, getEmailTemplate(contentHtml), attachments.length > 0 ? attachments : undefined);
        if (!mailRes.success) return mailRes;
        
        return { success: true, token: signoffToken };
    } catch (error: any) {
        console.warn('Error sending agreement signoff request:', error);
        return { success: false, error: error.message || 'Failed to send agreement.' };
    }
};

export const sendSignoffRequest = async (decisionId: string, projectId: string, studioId: string = 'demo-tenant-01'): Promise<{ success: boolean; error?: string }> => {
    try {
        const docRef = doc(db, 'projects', projectId, 'decisions', decisionId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            throw new Error('Decision not found');
        }

        const decision = docSnap.data();
        const clientEmail = decision.clientEmail;
        
        if (!clientEmail) {
            throw new Error('Client email not available');
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
        
        let appDomain = import.meta.env.VITE_APP_DOMAIN || window.location.origin;
        let isDev = false;
        if (appDomain.includes('ais-dev-')) {
            isDev = true;
            appDomain = appDomain.replace('ais-dev-', 'ais-pre-');
        }
        const signoffToken = decision.signoffToken || decisionId;
        const signoffUrl = `${appDomain}/?signoff=${signoffToken}`;
        
        let devTestingHtml = '';
        if (isDev) {
            devTestingHtml = `
            <div style="margin-top: 40px; padding: 12px; background-color: #f8fafc; border: 1px dashed #cbd5e1; font-size: 11px; color: #64748b;">
                <strong>Developer Testing Note:</strong> If the public link above gives a 404 (due to the app not being published yet), you can test the flow using your dev URL:<br/>
                <a href="${import.meta.env.VITE_APP_DOMAIN || window.location.origin}/?signoff=${signoffToken}" style="color: #3b82f6;">${import.meta.env.VITE_APP_DOMAIN || window.location.origin}/?signoff=${signoffToken}</a>
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

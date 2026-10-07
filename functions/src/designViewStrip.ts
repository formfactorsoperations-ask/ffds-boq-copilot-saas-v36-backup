/*
  What a Designer may see of a project: the pure part of designView.ts, with
  no Firebase imports, so the same code can be checked against real projects
  in a browser as well as run on the server.
*/

/** Whole sections of the project context that are the studio's commercial record. */
const CONTEXT_DROP = new Set([
  "financials", "paymentSchedules", "paymentMilestones", "designPaymentStages", "designFee", "designFeeType",
  "designFeePercentage", "engagement", "termsDockets", "proposalContent", "proposalContentByMode",
  "contractContent", "executionAgreementOverrides", "documents", "scopeRevisions", "scopeFlow", "portalAccess",
  "history", "clientMessages", "executionData", "procurement", "invoices", "boqRevisions", "proposalAcceptance",
  "totalChangeRequestCost", "showScopePricing", "scopeAdditions", "vendorQuotes", "quotes", "portalMoney",
  "boqBaseline", "adHocItems",
  // the client's bank details, verbatim approval messages, and the commercial choice of proposal
  "onboardingData", "approvalReceipts", "proposalDecision",
]);

/* Money under names the word list cannot catch without also catching counts ("total" is a phase count too). */
const MONEY_KEYS = new Set([
  "estimatedTotal", "designTotal", "executionTotal", "projectValue", "grandTotal", "subTotal", "totalValue",
  "contractValue", "oldValue", "newValue", "accountNumber", "accountName", "bankName", "bankDetails",
]);

/** A key that names money -- or a secret -- anywhere inside what is kept. Matched by whole word. */
const MONEY_WORDS = new Set([
  "rate", "rates", "price", "prices", "priced", "pricing", "cost", "costs", "costing", "margin", "margins",
  "markup", "amount", "amounts", "discount", "discounts", "gst", "tax", "taxes", "fee", "fees", "invoice",
  "invoices", "payment", "payments", "paid", "budget", "budgets", "profit", "commission", "billable", "cash",
  "subtotal", "token", "tokens", "financial", "financials", "quote", "quotes", "quotation", "mrp", "valuation",
  // personal and banking identifiers
  "ifsc", "iban", "aadhaar", "aadhar", "pan", "gstin", "password", "secret",
]);

const keyWords = (key: string) =>
  key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_\-.]+/g, " ").toLowerCase().split(/\s+/).filter(Boolean);

export const isMoneyKey = (key: string) =>
  MONEY_KEYS.has(key) || key.endsWith("Signoff") || keyWords(key).some((w) => MONEY_WORDS.has(w));

export function scrub(value: any, depth = 0): any {
  if (depth > 60 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  const out: any = {};
  for (const [k, v] of Object.entries(value)) {
    if (isMoneyKey(k)) continue;
    out[k] = scrub(v, depth + 1);
  }
  return out;
}

export const cleanEmails = (list: any): string[] =>
  (Array.isArray(list) ? list : []).map((e: any) => String(e || "").trim().toLowerCase()).filter(Boolean);

export function storedProject(data: any, inflate: (b64: string) => string): any {
  if (data?.compressedData) {
    try {
      const full = JSON.parse(inflate(data.compressedData));
      return { ...full, tenantId: full.tenantId || data.tenantId };
    } catch {
      return null;
    }
  }
  return data;
}

/** What a Designer may see of a project. Exported for the tests. */
export function designViewOf(project: any): any {
  const ctx: any = {};
  for (const [k, v] of Object.entries(project?.context || {})) {
    if (CONTEXT_DROP.has(k) || isMoneyKey(k)) continue;
    ctx[k] = scrub(v);
  }
  return {
    id: project.id,
    tenantId: project.tenantId || null,
    lastModified: project.lastModified || null,
    context: ctx,
    timeline: scrub(project.timeline || []),
    materials: scrub(project.materials || []),
    architecture: scrub(project.architecture || null),
    leadProfile: scrub(project.leadProfile || null),
    activeTierId: project.activeTierId || null,
    activeProject: null,
    decisionBrainOutput: null,
    /* Versions by name and line by quantity -- no totals, rates or margins. */
    tiers: (project.tiers || []).map((t: any) => ({
      id: t.id,
      name: t.name,
      timestamp: t.timestamp || null,
      lifecycleTag: t.lifecycleTag || null,
      boq: (t.boq || []).map((l: any) => ({ id: l.id, roomId: l.roomId ?? null, bankId: l.bankId ?? null, qty: l.qty ?? null, rationale: l.rationale ?? null })),
    })),
  };
}


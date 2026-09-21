import React from "react";
import { OrganizationContext, ProjectContext } from "../../types";

/**
 * THE SUPPLEMENTARY INVOICE, AS AN FFDS DOCUMENT.
 *
 * The old one was drawn with raw jsPDF primitives at hand-placed coordinates --
 * the only client-facing document in the app not built as styled HTML, which is
 * why it did not look like the payment schedule, the agreement or the handover
 * docket. This uses the same tokens, the same mast, the same metabar and the
 * same table treatment as those, so it is recognisably the same studio's paper.
 *
 * EVERY STUDIO DETAIL COMES FROM THE ORG PROFILE. The old invoice hardcoded a
 * Bengaluru address, a Karnataka GSTIN (29AAGFF5421M1ZC) and an ICICI account
 * number -- none of which are the studio's. A client paying from it would have
 * wired money to an account that does not exist, against a registration in the
 * wrong state. Where a value is not configured, this prints a visible
 * placeholder rather than a plausible invention: an obviously missing field
 * gets fixed, a convincing wrong one gets paid into.
 */

const money = (n: number) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;

export interface InvoiceAddition {
  id: string;
  type: string;
  clientRequest: string;
  createdAt?: any;
  designFeeBase: number;
  designFeeGst: number;
  designFeeTotal: number;
  executionValue: number;
  executionSubtotal: number;
  executionMargin: number;
  executionGst: number;
  executionTotal: number;
  grandTotal: number;
  miniBoq?: any[];
  paymentGate?: any;
}

interface Props {
  addition: InvoiceAddition;
  projectContext: ProjectContext;
  orgData: OrganizationContext & { bankDetails?: any };
  /** Invoice reference, e.g. INV/SA/<project>/SA-003. */
  invoiceNo: string;
}

/** Missing is shown as missing. Never filled in with something plausible. */
const orMissing = (v: string | undefined | null, what: string) =>
  v && String(v).trim() ? String(v) : `[${what} not set in Studio Settings]`;

const ScopeAdditionInvoiceDoc: React.FC<Props> = ({ addition: a, projectContext, orgData, invoiceNo }) => {
  const bank = (orgData as any)?.bankDetails || {};
  const issued = a.createdAt?.seconds
    ? new Date(a.createdAt.seconds * 1000)
    : new Date();

  /* An intra-state supply is CGST + SGST, each half the rate. The old invoice
     printed one "GST (18%)" line, which is not how a tax invoice states it. */
  const designHalf = (a.designFeeGst || 0) / 2;
  const execHalf = (a.executionGst || 0) / 2;
  const placeOfSupply = orMissing(orgData.cityState, "place of supply");

  const typeLabel =
    a.type === "TYPE_A" ? "Finish change" : a.type === "TYPE_C" ? "New scope" : "Alteration";

  const lines = a.miniBoq || [];

  return (
    <div className="sa-invoice-template" id="sa-invoice-sheet">
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .sa-invoice-template{
          --ink:#1f2328; --ink-soft:#3f464e; --muted:#727a82;
          --line:#e6e3dc; --line-soft:#efece6; --paper:#fbfaf7; --card:#ffffff;
          --slate:#1f2328; --accent:#1e3a8a; --accent-soft:#eef2fb; --gold:#b08d57;
          background:var(--paper); color:var(--ink);
          font-family:"Plus Jakarta Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
          line-height:1.6; font-size:14px; -webkit-font-smoothing:antialiased;
          width:100%; max-width:820px;
        }
        .sa-invoice-template *{box-sizing:border-box;}
        .sa-invoice-template .sheet{max-width:820px; margin:0 auto; background:var(--card); padding:40px 52px 50px;}
        .sa-invoice-template header.mast{border-bottom:2px solid var(--slate); padding-bottom:18px; display:flex; justify-content:space-between; align-items:flex-end;}
        .sa-invoice-template .brand{font-size:14px; letter-spacing:.22em; text-transform:uppercase; font-weight:800;}
        .sa-invoice-template .tagline{font-size:11px; color:var(--muted); letter-spacing:.05em; margin-top:3px;}
        .sa-invoice-template .studioline{font-size:10.5px; color:var(--muted); margin-top:6px; line-height:1.5;}
        .sa-invoice-template .docnum{font-size:10.5px; letter-spacing:.16em; text-transform:uppercase; color:var(--gold); font-weight:700; text-align:right;}
        .sa-invoice-template .title{margin:20px 0 4px; font-size:21px; font-weight:800; letter-spacing:-.01em;}
        .sa-invoice-template .preamble{font-size:12.5px; color:var(--ink-soft); margin:0 0 14px;}
        .sa-invoice-template .metabar{display:grid; grid-template-columns:1fr 1fr 1fr; border:1px solid var(--line); border-radius:10px; overflow:hidden; margin:18px 0 6px;}
        .sa-invoice-template .metabar div{padding:10px 14px; border-bottom:1px solid var(--line-soft); border-right:1px solid var(--line-soft);}
        .sa-invoice-template .metabar div:nth-child(3n){border-right:none;}
        .sa-invoice-template .metabar div:nth-child(-n+3){background:#faf9f5;}
        .sa-invoice-template .metabar div:nth-last-child(-n+3){border-bottom:none;}
        .sa-invoice-template .k{font-size:10px; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); font-weight:700;}
        .sa-invoice-template .v{font-weight:700; color:var(--ink); margin-top:2px; font-size:13px;}
        .sa-invoice-template .sec{margin:26px 0 10px; font-size:12px; letter-spacing:.14em; text-transform:uppercase; font-weight:800; color:var(--slate);}
        .sa-invoice-template .req{border-left:3px solid var(--gold); background:#faf9f5; padding:12px 16px; font-size:13px; color:var(--ink-soft); border-radius:0 8px 8px 0;}
        .sa-invoice-template table{width:100%; border-collapse:collapse; margin-top:6px;}
        .sa-invoice-template thead th{background:#faf9f5; border-top:1px solid var(--line); border-bottom:1px solid var(--line); padding:9px 10px; font-size:10px; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); font-weight:700; text-align:left;}
        .sa-invoice-template tbody td{padding:9px 10px; border-bottom:1px solid var(--line-soft); vertical-align:top; color:var(--ink-soft); font-size:12.5px;}
        .sa-invoice-template .r{text-align:right;}
        .sa-invoice-template .nm{display:block; font-weight:700; color:var(--ink);}
        .sa-invoice-template .sm{display:block; font-size:11px; color:var(--muted);}
        .sa-invoice-template .totals{margin-top:18px; margin-left:auto; width:340px; border:1px solid var(--line); border-radius:10px; overflow:hidden;}
        .sa-invoice-template .totals .row{display:flex; justify-content:space-between; padding:8px 14px; font-size:12.5px; color:var(--ink-soft); border-bottom:1px solid var(--line-soft);}
        .sa-invoice-template .totals .row.sub{background:#faf9f5; font-weight:700; color:var(--ink);}
        .sa-invoice-template .totals .row.grand{background:var(--accent-soft); font-weight:800; color:var(--accent); font-size:14.5px; border-bottom:none;}
        .sa-invoice-template .paycols{display:grid; grid-template-columns:1.3fr 1fr; gap:18px; margin-top:26px;}
        .sa-invoice-template .paybox{border:1px solid var(--line); border-radius:10px; padding:14px 16px;}
        .sa-invoice-template .paybox .line{font-size:12px; color:var(--ink-soft); display:flex; justify-content:space-between; gap:12px; padding:3px 0;}
        .sa-invoice-template .paybox .line b{color:var(--ink);}
        .sa-invoice-template .qr{text-align:center;}
        .sa-invoice-template .qr img{width:120px; height:120px; object-fit:contain;}
        .sa-invoice-template .note{margin-top:22px; font-size:12px; color:var(--ink-soft); background:#faf9f5; border:1px solid var(--line); border-radius:10px; padding:12px 16px;}
        .sa-invoice-template .sig{display:flex; justify-content:space-between; margin-top:42px; gap:40px;}
        .sa-invoice-template .sig .box{flex:1; border-top:1px solid var(--slate); padding-top:8px;}
        .sa-invoice-template .sig .who{font-weight:700; font-size:12.5px;}
        .sa-invoice-template .sig .role{font-size:11px; color:var(--muted);}
        .sa-invoice-template .foot{margin-top:30px; border-top:1px solid var(--line); padding-top:10px; font-size:10.5px; color:var(--muted); text-align:center;}
      `,
        }}
      />

      <div className="sheet">
        <header className="mast">
          <div>
            <div className="brand">{orgData.orgName || "Form Factors Design Studio"}</div>
            <div className="tagline">{orgData.tagline || "Minimal Design. Maximum Impact."}</div>
            <div className="studioline">
              {orMissing(orgData.officeAddress, "office address")}
              {orgData.cityState ? `, ${orgData.cityState}` : ""}
              <br />
              GSTIN {orMissing(orgData.gstin, "GSTIN")}
              {orgData.contactPhone ? ` · ${orgData.contactPhone}` : ""}
            </div>
          </div>
          <div className="docnum">
            Tax Invoice
            <br />
            Supplementary Scope
          </div>
        </header>

        <h1 className="title">Supplementary Invoice · {a.id}</h1>
        <p className="preamble">
          For work requested after the bill of quantities was frozen, and outside the signed scope.
          This is billed in addition to the original contract and does not replace any part of it.
        </p>

        <div className="metabar">
          <div>
            <div className="k">Invoice no.</div>
            <div className="v">{invoiceNo}</div>
          </div>
          <div>
            <div className="k">Date of issue</div>
            <div className="v">{issued.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>
          </div>
          <div>
            <div className="k">Place of supply</div>
            <div className="v">{placeOfSupply}</div>
          </div>
          <div>
            <div className="k">Billed to</div>
            <div className="v">{orMissing(projectContext.clientName, "client name")}</div>
          </div>
          <div>
            <div className="k">Project</div>
            <div className="v">{projectContext.name || "—"}</div>
          </div>
          <div>
            <div className="k">Nature of change</div>
            <div className="v">{typeLabel}</div>
          </div>
        </div>

        <h2 className="sec">What was requested</h2>
        <div className="req">{a.clientRequest || "—"}</div>

        {lines.length > 0 && (
          <>
            <h2 className="sec">The work</h2>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="r">Qty</th>
                  <th>Unit</th>
                  <th className="r">Rate</th>
                  <th className="r">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l: any, i: number) => (
                  <tr key={i}>
                    <td>
                      <span className="nm">{l.description || "Item"}</span>
                      {l.category && <span className="sm">{l.category}</span>}
                    </td>
                    <td className="r">{l.qty}</td>
                    <td>{l.unit}</td>
                    <td className="r">{money(l.estimatedUnitRate)}</td>
                    <td className="r">{money(l.baseCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/*
          Two supplies on one invoice -- a design fee and the site work -- each
          taxed in its own right. CGST and SGST are stated separately because an
          intra-state supply is two taxes, not one 18% line.
        */}
        <div className="totals">
          {a.designFeeBase > 0 && (
            <>
              <div className="row">
                <span>Design fee</span>
                <span>{money(a.designFeeBase)}</span>
              </div>
              <div className="row">
                <span>CGST 9%</span>
                <span>{money(designHalf)}</span>
              </div>
              <div className="row">
                <span>SGST 9%</span>
                <span>{money(designHalf)}</span>
              </div>
            </>
          )}
          <div className="row">
            <span>Site work</span>
            <span>{money(a.executionSubtotal || a.executionValue)}</span>
          </div>
          <div className="row">
            <span>CGST 9%</span>
            <span>{money(execHalf)}</span>
          </div>
          <div className="row">
            <span>SGST 9%</span>
            <span>{money(execHalf)}</span>
          </div>
          <div className="row grand">
            <span>Total payable</span>
            <span>{money(a.grandTotal)}</span>
          </div>
        </div>

        <div className="paycols">
          <div className="paybox">
            <div className="k" style={{ marginBottom: 8 }}>Payable to</div>
            <div className="line">
              <span>Account name</span>
              <b>{orMissing(bank.accountName, "account name")}</b>
            </div>
            <div className="line">
              <span>Bank</span>
              <b>{orMissing(bank.bankName, "bank")}</b>
            </div>
            <div className="line">
              <span>Account no.</span>
              <b>{orMissing(bank.accountNumber, "account number")}</b>
            </div>
            <div className="line">
              <span>IFSC</span>
              <b>{orMissing(bank.ifscCode, "IFSC")}</b>
            </div>
            {bank.upiId && (
              <div className="line">
                <span>UPI</span>
                <b>{bank.upiId}</b>
              </div>
            )}
          </div>

          {bank.qrCodeImage && (
            <div className="paybox qr">
              <div className="k" style={{ marginBottom: 8 }}>Scan to pay</div>
              <img src={bank.qrCodeImage} alt="Payment QR" />
            </div>
          )}
        </div>

        <div className="note">
          This addition is released to site once this invoice is cleared. Until then the original
          contract scope continues unchanged and unaffected.
        </div>

        <div className="sig">
          <div className="box">
            <div className="who">For {orgData.legalName || orgData.orgName || "Form Factors Design Studio"}</div>
            <div className="role">
              {orMissing(orgData.signatoryName, "signatory")}
              {orgData.signatoryTitle ? ` · ${orgData.signatoryTitle}` : ""}
            </div>
          </div>
          <div className="box">
            <div className="who">Accepted by {projectContext.clientName || "client"}</div>
            <div className="role">Signature &amp; date</div>
          </div>
        </div>

        <div className="foot">
          {orgData.orgName || "Form Factors Design Studio"}
          {orgData.contactEmail ? ` · ${orgData.contactEmail}` : ""}
          {orgData.website ? ` · ${orgData.website}` : ""}
        </div>
      </div>
    </div>
  );
};

export default ScopeAdditionInvoiceDoc;

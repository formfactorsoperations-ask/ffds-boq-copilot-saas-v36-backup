import React from 'react';
import { DetailedBoqSnapshot } from '../../lib/detailedBoq';
import { SCOPE_DOC_CSS, inr2, amt, rateText, qtyText, longDate } from './scopeDocStyles';

/**
 * The Detailed BOQ, as the client reads, signs and downloads it.
 *
 * Renders a frozen snapshot only (lib/detailedBoq.ts). `embedded` drops the
 * letterhead and signatures when it is printed as the attachment of a Scope
 * Revision, where the revision carries both.
 */
interface Props {
  snapshot: DetailedBoqSnapshot;
  studioName?: string;
  /** Fingerprint of the issue, printed at the foot. */
  contentHash?: string;
  /** Printed inside a Scope Revision: no letterhead, no signature blocks. */
  embedded?: boolean;
  /** Who signed, when a signature exists on this issue. */
  signedBy?: string | null;
  signedAt?: number | string | null;
}

const DetailedBoqSheet: React.FC<Props> = ({ snapshot: s, studioName, contentHash, embedded, signedBy, signedAt }) => {
  const org = s.org?.orgName || studioName || 'Design Studio';
  const approval = s.approval;
  const status =
    approval.mode === 'recorded'
      ? `Approved ${longDate(approval.approvedOn)}`
      : approval.mode === 'via_revision'
        ? `Signed with ${approval.revisionReference}`
        : signedBy
          ? `Signed ${longDate(signedAt)}`
          : 'Awaiting client signature';

  const body = (
    <>
      <div className="dh" data-section-ref={embedded ? undefined : '1'}>
        1. Scope by room
        <span>{s.lineCount} items · {s.rooms.length} rooms</span>
      </div>
      {s.rooms.map((room, ri) => (
        <div key={room.name} className="avoid" style={{ marginBottom: 10 }}>
          <div className="rh">
            <span>
              1.{ri + 1} {room.name}
              {room.formerly && <em> · formerly {room.formerly}</em>}
            </span>
            <span className="num">{inr2(room.total)}</span>
          </div>
          <table>
            <colgroup>
              <col style={{ width: '7%' }} /><col style={{ width: '47%' }} /><col style={{ width: '9%' }} />
              <col style={{ width: '9%' }} /><col style={{ width: '13%' }} /><col style={{ width: '15%' }} />
            </colgroup>
            <thead>
              <tr><th className="l">No.</th><th className="l">Item &amp; description</th><th>Unit</th><th>Qty</th><th>Rate (₹)</th><th>Amount (₹)</th></tr>
            </thead>
            <tbody>
              {room.lines.map((l, li) => (
                <tr key={l.id}>
                  <td className="l num">{ri + 1}.{li + 1}</td>
                  <td className="l">
                    <span className="nm">{l.name}</span>
                    {l.asActuals && <span className="tag">As actuals</span>}
                    {l.description && <small>{l.description}</small>}
                    {l.inclusions?.length ? <small>Includes: {l.inclusions.join('; ')}</small> : null}
                    {l.exclusions?.length ? <small>Excludes: {l.exclusions.join('; ')}</small> : null}
                  </td>
                  <td className="nw">{l.unit}</td>
                  <td className="num">{qtyText(l.qty)}</td>
                  <td className="num">{rateText(l.rate)}</td>
                  <td className="num">{amt(l.amount, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <div className="tot avoid">
        <span>Total execution scope</span>
        <b className="num">{inr2(s.total)}</b>
      </div>
      <p className="note">
        Rates are net and final for this scope: every commercial term agreed for the project is already in them.
        Amounts are before the design fee and GST. Items marked “As actuals” are measured on site and billed at the stated rate.
      </p>

      <div className="dh" data-section-ref={embedded ? undefined : '2'}>
        2. Not in this scope
        <span>{s.notInScope.length ? `${s.notInScope.length} held at zero or excluded` : ''}</span>
      </div>
      <p className="note" style={{ marginTop: 4 }}>
        Anything not listed in section 1 is excluded from this scope.
        {s.notInScope.length > 0 && (
          <> These items are held in the studio’s working BOQ but are not part of the price:{' '}
            {s.notInScope.map((z, i) => (
              <span key={i}>{z.name} ({z.room}{z.reason !== 'At zero quantity' ? `, ${z.reason.toLowerCase()}` : ''}){i < s.notInScope.length - 1 ? '; ' : '.'}</span>
            ))}
          </>
        )}
      </p>
    </>
  );

  if (embedded) {
    return <div className="attach">{body}</div>;
  }

  return (
    <div className="sdoc">
      <style dangerouslySetInnerHTML={{ __html: SCOPE_DOC_CSS }} />
      <div className="lh">
        <div className="brand">{org}<small>Detailed Bill of Quantities</small></div>
        <div className="dockind">Detailed BOQ · v{s.version}<small>{s.reference}</small></div>
      </div>
      <h1>Detailed Bill of Quantities</h1>
      <p className="lede">
        The execution scope for {s.projectName}: every item, its quantity, unit and net rate.
        {s.replaces ? ` It replaces ${s.replaces.reference} (${inr2(s.replaces.total)}).` : ''}
      </p>
      <div className="parties">
        <div><span>Client</span><b>{s.clientName}</b></div>
        <div><span>Project</span><b>{s.projectName}{s.location ? ` · ${s.location}` : ''}</b></div>
        <div><span>Version</span><b>v{s.version} · {s.reference}</b></div>
        <div><span>Total</span><b className="num">{inr2(s.total)}</b></div>
        <div><span>Issued</span><b>{longDate(s.issuedOn)}</b></div>
        <div><span>Status</span><b>{status}</b></div>
      </div>
      {body}
      <div className="signs avoid">
        <div className="sgn">
          <b>Approved by the client</b>
          {approval.mode === 'recorded' ? (
            <div className="line empty">Approved {longDate(approval.approvedOn)} · recorded by the studio</div>
          ) : approval.mode === 'via_revision' ? (
            <div className="line empty">Signed with {approval.revisionReference}</div>
          ) : signedBy ? (
            <div className="line">{signedBy}</div>
          ) : (
            <div className="line empty">Awaiting signature</div>
          )}
          {approval.mode === 'recorded' ? approval.note : 'Name · date · method · signature certificate'}
        </div>
        <div className="sgn">
          <b>Issued by the studio</b>
          <div className="line">{org}</div>
          {longDate(s.issuedOn)}
        </div>
      </div>
      {contentHash && (
        <div className="cert">Content fingerprint <code>{contentHash}</code> · {s.reference}</div>
      )}
      <div className="foot"><span>{org} · Detailed BOQ v{s.version} · {s.reference}</span><span>{s.projectName}</span></div>
    </div>
  );
};

export default DetailedBoqSheet;

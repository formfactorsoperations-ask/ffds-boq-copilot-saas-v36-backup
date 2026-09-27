import React from 'react';
import { ScopeRevisionSnapshot } from '../../lib/scopeDocuments';
import DetailedBoqSheet from './DetailedBoqSheet';
import { SCOPE_DOC_CSS, inr2, amt, signed0, qtyText, longDate } from './scopeDocStyles';

/**
 * The Scope Revision, as the client reads and signs it.
 *
 * Four numbered sections — the effect, where the change comes from, the rooms,
 * the schedule of changes — each marked with `data-section-ref` so the reading
 * room can ask for them to be acknowledged one by one. The revised Detailed BOQ
 * follows in full as the attachment, so signing this is signing the new scope.
 */
interface Props {
  snapshot: ScopeRevisionSnapshot;
  studioName?: string;
  contentHash?: string;
  signedBy?: string | null;
  signedAt?: number | string | null;
}

const cls = (n: number) => (Math.round(n) > 0 ? 'pos' : Math.round(n) < 0 ? 'neg' : '');

const ScopeRevisionSheet: React.FC<Props> = ({ snapshot: s, studioName, contentHash, signedBy, signedAt }) => {
  const org = s.org?.orgName || studioName || 'Design Studio';
  const changedRooms = s.rooms.filter(r => r.asSection || r.lines.length);

  return (
    <div className="sdoc">
      <style dangerouslySetInnerHTML={{ __html: SCOPE_DOC_CSS }} />
      <div className="lh">
        <div className="brand">{org}<small>Scope revision</small></div>
        <div className="dockind">Scope Revision {s.number}<small>{s.reference}</small></div>
      </div>
      <h1>Scope Revision {s.number} · Revised Bill of Quantities</h1>
      <p className="lede">
        Replaces {s.v1.reference} with {s.v2.reference} as the execution scope, once signed by the client.
      </p>
      <div className="parties">
        <div><span>Client</span><b>{s.clientName}</b></div>
        <div><span>Project</span><b>{s.projectName}{s.location ? ` · ${s.location}` : ''}</b></div>
        <div><span>Varies</span><b>{s.v1.reference}{s.v1.fingerprint ? ` · ${s.v1.fingerprint.slice(0, 18)}…` : ''}</b></div>
        <div><span>Revised scope</span><b className="num">{s.v2.reference} · {inr2(s.v2.total)}</b></div>
        <div><span>Issued</span><b>{longDate(s.issuedOn)}</b></div>
        <div><span>Status</span><b>{signedBy ? `Signed ${longDate(signedAt)}` : 'Awaiting client signature'}</b></div>
      </div>

      {s.summary && <p className="note" style={{ marginTop: 10 }}>{s.summary}</p>}

      <div className="dh" data-section-ref="1">1. Effect of this revision</div>
      <table className="auto">
        <tbody>
          <tr>
            <td className="l">Execution scope, signed · {s.v1.reference}{s.v1.approvedOn ? ` (approved ${longDate(s.v1.approvedOn)})` : ''}</td>
            <td className="num">{inr2(s.v1.total)}</td>
          </tr>
          <tr>
            <td className="l">Execution scope, revised · {s.v2.reference}</td>
            <td className="num">{inr2(s.v2.total)}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr><td className="l">Change</td><td className={`num ${cls(s.change)}`}>{signed0(s.change)}</td></tr>
        </tfoot>
      </table>
      <p className="note">
        On signature: (a) Detailed BOQ v{s.v2.version} becomes the execution scope; (b) the payment schedule is
        re-issued on the revised total for you to confirm; (c) {s.v1.reference} stays on record, marked as
        superseded. Rates in v{s.v2.version} are fixed on the date of issue. {s.designFeeNote}
      </p>

      <div className="dh" data-section-ref="2">2. Where the change comes from</div>
      <table className="auto bridge">
        <tbody>
          {s.bridge.map(p => (
            <tr key={p.key}>
              <td className="l lab"><b>{p.label}</b><small>{p.sub}</small></td>
              <td className={`num ${cls(p.value)}`}>{signed0(p.value)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td className="l">Net change</td><td className={`num ${cls(s.change)}`}>{signed0(s.change)}</td></tr>
        </tfoot>
      </table>

      <div className="dh" data-section-ref="3">3. Summary by room</div>
      <table>
        <colgroup>
          <col style={{ width: '6%' }} /><col style={{ width: '46%' }} /><col style={{ width: '16%' }} />
          <col style={{ width: '16%' }} /><col style={{ width: '16%' }} />
        </colgroup>
        <thead>
          <tr><th className="l">#</th><th className="l">Room (revised)</th><th>Signed (₹)</th><th>Revised (₹)</th><th>Change (₹)</th></tr>
        </thead>
        <tbody>
          {s.rooms.map((r, i) => (
            <tr key={r.name}>
              <td className="l num">{i + 1}</td>
              <td className="l">
                <span className="nm">{r.name}</span>
                {r.isNew && <span className="tag nw2">New</span>}
                {r.formerly && <small>Signed as: {r.formerly}</small>}
              </td>
              <td className="num">{amt(r.v1)}</td>
              <td className="num">{amt(r.v2)}</td>
              <td className={`num ${cls(r.change)}`}>{signed0(r.change)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td></td><td className="l">Total</td>
            <td className="num">{amt(s.v1.total)}</td>
            <td className="num">{amt(s.v2.total)}</td>
            <td className={`num ${cls(s.change)}`}>{signed0(s.change)}</td>
          </tr>
        </tfoot>
      </table>

      <div className="dh" data-section-ref="4">
        4. Schedule of changes
        <span>changed items only · the full revised scope is attached as {s.v2.reference}</span>
      </div>
      {changedRooms.map(r =>
        r.asSection ? (
          <div key={r.name} className="avoid" style={{ marginBottom: 8 }}>
            <div className="rh"><span>{r.name} <em>· compared as a section</em></span><span className={`num ${cls(r.change)}`}>{signed0(r.change)}</span></div>
            <p className="room-note">{r.asSection.caveat}</p>
            <table>
              <colgroup><col style={{ width: '50%' }} /><col style={{ width: '50%' }} /></colgroup>
              <thead><tr><th className="l">Signed · {amt(r.v1)}</th><th className="l">Revised · {amt(r.v2)}</th></tr></thead>
              <tbody>
                {Array.from({ length: Math.max(r.asSection.before.length, r.asSection.after.length) }).map((_, i) => {
                  const b = r.asSection!.before[i];
                  const a = r.asSection!.after[i];
                  return (
                    <tr key={i}>
                      <td className="l">{b ? <>{b.name}<small className="num">{amt(b.amount)}</small></> : ''}</td>
                      <td className="l">{a ? <>{a.name}<small className="num">{amt(a.amount)}</small></> : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div key={r.name} className="avoid" style={{ marginBottom: 8 }}>
            <div className="rh">
              <span>{r.name}{r.formerly && <em> · formerly {r.formerly}</em>}</span>
              <span className={`num ${cls(r.change)}`}>{signed0(r.change)}</span>
            </div>
            {r.note && <p className="room-note">{r.note}</p>}
            <table>
              <colgroup>
                <col style={{ width: '44%' }} /><col style={{ width: '17%' }} /><col style={{ width: '13%' }} />
                <col style={{ width: '13%' }} /><col style={{ width: '13%' }} />
              </colgroup>
              <thead>
                <tr><th className="l">Item</th><th>Qty signed → revised</th><th>Signed (₹)</th><th>Revised (₹)</th><th>Change (₹)</th></tr>
              </thead>
              <tbody>
                {r.lines.map((l, i) => (
                  <tr key={i}>
                    <td className="l">
                      <span className="nm">{l.name}</span>
                      <span className={`tag ${l.tag === 'REMOVED' ? 'rm' : l.tag === 'NEW' ? 'nw2' : ''}`}>{l.tag.toLowerCase()}</span>
                      {l.was && <small>Signed: {l.was} · Revised: {l.now}</small>}
                    </td>
                    <td className="num nw">{qtyText(l.q1)} → {qtyText(l.q2)}{l.unit ? ` ${l.unit}` : ''}</td>
                    <td className="num">{l.a1 ? amt(l.a1) : '—'}</td>
                    <td className="num">{l.a2 ? amt(l.a2) : '—'}</td>
                    <td className={`num ${cls(l.change)}`}>{signed0(l.change)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
      {s.atZero.length > 0 && (
        <p className="note">
          In the revision but not part of the price:{' '}
          {s.atZero.map(z => `${z.name} (${z.room}${z.reason ? ` — ${z.reason.toLowerCase()}` : ', at zero'})`).join('; ')}.
        </p>
      )}

      <div className="signs avoid">
        <div className="sgn">
          <b>Signed by the client</b>
          {signedBy ? <div className="line">{signedBy}</div> : <div className="line empty">Awaiting signature</div>}
          Name · date · method · signature certificate
        </div>
        <div className="sgn">
          <b>Issued by the studio</b>
          <div className="line">{s.issuedBy || org}</div>
          {org} · {longDate(s.issuedOn)}
        </div>
      </div>
      {contentHash && (
        <div className="cert">
          Content fingerprint <code>{contentHash}</code> · {s.reference} · varies {s.v1.reference} · attaches {s.v2.reference}
        </div>
      )}

      <div className="attach">
        <div className="attach-h">Attachment · {s.v2.reference} · Detailed BOQ v{s.v2.version} · {inr2(s.v2.total)}</div>
      </div>
      <DetailedBoqSheet snapshot={s.v2} embedded />

      <div className="foot"><span>{org} · Scope Revision {s.number} · {s.reference}</span><span>{s.projectName}</span></div>
    </div>
  );
};

export default ScopeRevisionSheet;

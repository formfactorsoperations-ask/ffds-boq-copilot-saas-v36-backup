import React from 'react';
import { MessageSquare, Check } from '@/lib/lucide-shim';
import { ProjectContext } from '../../types';
import { Dot } from '../ui/HudBits';

/*
  Client Messages: what the client has sent the studio from their portal.

  This replaces Client Comms. That screen was mostly an outbound checklist of
  generic email templates the studio marked as sent, which the owner retired as
  too generic to help. The one part that mattered -- the messages clients write
  from the portal -- lived at the top of it, and is all that remains here.

  A message is the client's and is never edited. The studio stamps it dealt
  with (readAt / readBy); that stamp only moves forward (lib/clientOwned), and
  the Ops Desk shows it too.
*/

export interface ClientMessage {
  id: string;
  text: string;
  sentAt?: string;
  sentBy?: string;
  aboutLabel?: string | null;
  readAt?: string | null;
  readBy?: string | null;
}

export const clientMessagesOf = (ctx: any): ClientMessage[] =>
  (Array.isArray(ctx?.clientMessages) ? ctx.clientMessages : []) as ClientMessage[];

/** Messages nobody has dealt with yet: the Project Hub badge reads this. */
export const unansweredMessages = (ctx: any): number =>
  clientMessagesOf(ctx).filter((m) => !m.readAt).length;

interface Props {
  projectContext: ProjectContext;
  setProjectContext?: React.Dispatch<React.SetStateAction<ProjectContext>>;
  currentUserName: string;
  /** Roles that only read this project (Designer, Client Relations, Site Supervisor). */
  readOnly?: boolean;
}

const when = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    : '';

export default function ClientMessagesPage({ projectContext, setProjectContext, currentUserName, readOnly }: Props) {
  const messages = [...clientMessagesOf(projectContext)].sort((a, b) => {
    // Unanswered first, newest first within each group.
    if (!a.readAt !== !b.readAt) return a.readAt ? 1 : -1;
    return String(b.sentAt || '').localeCompare(String(a.sentAt || ''));
  });
  const open = messages.filter((m) => !m.readAt).length;
  const canAct = !readOnly && !!setProjectContext;

  const markDealtWith = (id: string) => {
    if (!setProjectContext) return;
    const at = new Date().toISOString();
    setProjectContext((prev: any) => ({
      ...prev,
      clientMessages: clientMessagesOf(prev).map((m) =>
        m.id === id && !m.readAt ? { ...m, readAt: at, readBy: currentUserName } : m,
      ),
    }));
  };

  return (
    <div className="pb-12">
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 hud-panel-in">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-[#3D52A0]/10 text-[#3D52A0] flex items-center justify-center shrink-0">
              <MessageSquare className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2 className="font-bold text-slate-800">From the client</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Messages your client sends from their portal.{canAct ? ' Mark one dealt with once you have replied.' : ''}
              </p>
            </div>
          </div>
          {messages.length > 0 && (
            open > 0 ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700">
                {open} unanswered
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700">
                All dealt with
              </span>
            )
          )}
        </div>

        {messages.length === 0 ? (
          <div className="mt-5 rounded-xl border border-slate-200 px-4 py-6 text-center">
            <p className="text-sm font-semibold text-slate-700">No messages yet</p>
            <p className="text-xs text-slate-500 mt-1">When your client writes to the studio from their portal, it lands here.</p>
          </div>
        ) : (
          <ul className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-200">
            {messages.map((m, i) => (
              <li
                key={m.id}
                className="px-4 py-3.5 flex items-start gap-3 hud-row-in"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <span className="mt-1.5 shrink-0">
                  {m.readAt ? <span className="block w-2 h-2 rounded-full bg-slate-200" aria-hidden /> : <Dot tone="warn" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-800 whitespace-pre-line break-words">{m.text}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {[m.sentBy || 'Client', when(m.sentAt), m.aboutLabel ? `about ${m.aboutLabel}` : '']
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {m.readAt && (
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Dealt with{m.readBy ? ` by ${m.readBy}` : ''} · {when(m.readAt)}
                    </p>
                  )}
                </div>
                {!m.readAt && canAct && (
                  <button
                    type="button"
                    onClick={() => markDealtWith(m.id)}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Mark dealt with
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-4 text-[11px] text-slate-500">
          Questions about a specific finish arrive on that selection in Selections &amp; Orders, not here.
        </p>
      </section>
    </div>
  );
}

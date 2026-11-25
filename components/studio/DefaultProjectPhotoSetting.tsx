import React, { useRef, useState } from 'react';
import { ImageUp } from 'lucide-react';
import { Button } from '../ui/kit';
import { auth } from '../../services/firebaseClient';
import { uploadStudioPhoto, coverFileProblem } from '../../services/coverStorage';
import { KIND_PHOTOS } from '../../lib/defaultPhotos';

/*
  THE STUDIO'S DEFAULT PROJECT PHOTO (owner, 25 Nov 2026; lib/defaultPhotos).

  A project with no cover and no render shows this photo on the Projects
  screen, marked "No render yet". Without one, each project shows an interior
  photo picked by its type. The photo goes to Firebase Storage when chosen;
  the studio's record points at it once the settings are saved, like every
  other field on this screen.
*/

export interface StudioPhoto { url: string; storagePath?: string; setAt: number; setBy?: string }

const SAMPLE = `https://images.unsplash.com/photo-${KIND_PHOTOS.apartment[0]}?w=400&q=60&auto=format&fit=crop`;

export default function DefaultProjectPhotoSetting({ tenantId, value, saved, onChange, highlight }: {
  tenantId: string;
  /** The photo in the draft. */
  value: StudioPhoto | null;
  /** The photo the studio uses now. */
  saved: StudioPhoto | null;
  onChange: (v: StudioPhoto | null) => void;
  highlight?: boolean;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const pending = (value?.url || null) !== (saved?.url || null);

  const choose = async (file: File | undefined) => {
    if (input.current) input.current.value = '';
    const bad = coverFileProblem(file);
    if (bad || !file) { setProblem(bad); return; }
    setBusy(true);
    setProblem(null);
    try {
      const { url, storagePath } = await uploadStudioPhoto(tenantId, file);
      const by = auth?.currentUser?.email || undefined;
      onChange({ url, storagePath, setAt: Date.now(), ...(by ? { setBy: by } : {}) });
    } catch (e: any) {
      setProblem(e?.message || 'The photo could not be uploaded. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div id="set-defaultProjectPhoto" className={`flex items-center gap-4 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex-wrap transition-shadow ${highlight ? 'ring-2 ring-[#3D52A0] ring-offset-2 hud-locate' : ''}`}>
      <div className="relative w-36 h-24 rounded-xl overflow-hidden border border-slate-200 bg-white shrink-0">
        <img src={value?.url || SAMPLE} alt="" referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full object-cover" />
        <span className="absolute left-1.5 bottom-1.5 px-1.5 py-0.5 rounded-full bg-white/90 text-slate-600 text-[10px] font-bold uppercase tracking-wider">No render yet</span>
      </div>
      <div className="min-w-0 flex-1 basis-60">
        <p className="text-sm font-semibold text-slate-800">
          {pending ? 'Save to use this photo' : value ? "The studio's default photo" : 'A photo by project type'}
        </p>
        <p className="text-xs text-slate-500">
          A project with no cover and no render shows this on the Projects screen, marked "No render yet". Without one, each project shows an interior photo for its type (apartment, bungalow, shop or office, wardrobe or kitchen).
        </p>
        {problem && <p role="alert" className="text-[11px] font-semibold text-rose-700 mt-1">{problem}</p>}
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" icon={ImageUp} disabled={busy || !tenantId} onClick={() => input.current?.click()}>
          {busy ? 'Uploading…' : value ? 'Change photo' : 'Upload photo'}
        </Button>
        {value && !busy && <Button size="sm" variant="quiet" onClick={() => onChange(null)}>Use photos by type</Button>}
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" className="hidden"
          aria-label="Choose the studio's default project photo" onChange={(e) => choose(e.target.files?.[0])} />
      </div>
    </div>
  );
}

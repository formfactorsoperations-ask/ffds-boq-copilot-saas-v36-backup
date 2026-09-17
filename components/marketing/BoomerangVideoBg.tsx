import React from "react";

/**
 * BOOMERANG VIDEO BACKGROUND
 *
 * Plays the source video through ONCE while capturing every frame to an
 * offscreen canvas, then drops the <video> entirely and ping-pongs the captured
 * frames forward and back at 30fps.
 *
 * Why capture instead of just setting `loop`: a looping video snaps hard from
 * the last frame to the first. Playing it forward then backward forever has no
 * seam at all, which is what makes it read as ambient rather than as a clip on
 * repeat. Reversing a real <video> is not reliable across browsers -- negative
 * playbackRate is widely unsupported -- so the frames have to be held as
 * bitmaps.
 *
 * Capture is capped at 960px wide. Full-resolution frames would put tens of
 * megabytes of bitmap in memory for a background nobody looks at directly.
 */

interface Props {
  src: string;
  /** Shown if the video is missing or blocked, so the hero is never blank. */
  fallbackClassName?: string;
  className?: string;
}

const CAPTURE_MAX_W = 960;
const FPS = 30;

const BoomerangVideoBg: React.FC<Props> = ({ src, fallbackClassName, className = "" }) => {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const framesRef = React.useRef<HTMLCanvasElement[]>([]);
  const lastTimeRef = React.useRef<number>(-1);
  const rafRef = React.useRef<number | null>(null);
  const vfcRef = React.useRef<number | null>(null);

  const [ready, setReady] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  /* ── Capture pass ─────────────────────────────────────────────────────── */
  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let stopped = false;

    const grab = () => {
      if (stopped || !video.videoWidth) return;
      // Deduplicate: rAF can fire more than once for the same decoded frame.
      if (video.currentTime === lastTimeRef.current) return;
      lastTimeRef.current = video.currentTime;

      const scale = Math.min(1, CAPTURE_MAX_W / video.videoWidth);
      const w = Math.round(video.videoWidth * scale);
      const h = Math.round(video.videoHeight * scale);

      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, w, h);
      framesRef.current.push(c);
    };

    const useVFC = typeof (video as any).requestVideoFrameCallback === "function";

    const onVFC = () => {
      grab();
      if (!stopped) vfcRef.current = (video as any).requestVideoFrameCallback(onVFC);
    };
    const onRAF = () => {
      grab();
      if (!stopped) rafRef.current = requestAnimationFrame(onRAF);
    };

    const startCapture = () => {
      if (useVFC) vfcRef.current = (video as any).requestVideoFrameCallback(onVFC);
      else rafRef.current = requestAnimationFrame(onRAF);
    };

    const stopCapture = () => {
      stopped = true;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      if (vfcRef.current != null && typeof (video as any).cancelVideoFrameCallback === "function") {
        (video as any).cancelVideoFrameCallback(vfcRef.current);
      }
    };

    const onPlay = () => startCapture();
    const onEnded = () => {
      stopCapture();
      if (framesRef.current.length > 1) setReady(true);
      else setFailed(true);
    };
    const onError = () => {
      stopCapture();
      setFailed(true);
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("ended", onEnded);
    video.addEventListener("error", onError);

    video.play().catch(() => setFailed(true));

    return () => {
      stopCapture();
      video.removeEventListener("play", onPlay);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("error", onError);
    };
  }, [src]);

  /* ── Ping-pong playback ───────────────────────────────────────────────── */
  React.useEffect(() => {
    if (!ready) return;
    const canvas = canvasRef.current;
    const frames = framesRef.current;
    if (!canvas || frames.length < 2) return;

    canvas.width = frames[0].width;
    canvas.height = frames[0].height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce) {
      ctx.drawImage(frames[0], 0, 0);
      return;
    }

    let i = 0;
    let dir = 1;
    const id = window.setInterval(() => {
      ctx.drawImage(frames[i], 0, 0);
      i += dir;
      // Turn around at each end rather than jumping back to the start.
      if (i >= frames.length - 1) { i = frames.length - 1; dir = -1; }
      else if (i <= 0) { i = 0; dir = 1; }
    }, 1000 / FPS);

    return () => window.clearInterval(id);
  }, [ready]);

  return (
    <div className={`absolute inset-0 z-0 scale-[1.15] origin-top overflow-hidden ${className}`}>
      {/* Nothing to play: a quiet moving wash so the hero is never empty. */}
      {failed && (
        <div className={fallbackClassName ?? "absolute inset-0"}>
          <div className="absolute inset-0 bg-gradient-to-br from-[#F4F3F3] via-white to-[#EFEDE7]" />
          <div className="aurora-a absolute -top-40 -left-24 w-[46rem] h-[46rem] rounded-full blur-3xl"
               style={{ background: "radial-gradient(circle, rgba(61, 82, 160,.16), transparent 70%)" }} />
          <div className="aurora-b absolute -bottom-56 left-1/3 w-[42rem] h-[42rem] rounded-full blur-3xl"
               style={{ background: "radial-gradient(circle, rgba(181,148,91,.18), transparent 68%)" }} />
        </div>
      )}

      <video
        ref={videoRef}
        src={src}
        muted
        playsInline
        preload="auto"
        /* No crossOrigin: we only drawImage the frames, never read them back,
           so a tainted canvas costs us nothing -- and requesting CORS would
           make the whole video fail on a CDN that does not send the header. */
        className="w-full h-full object-cover object-top"
        style={{ display: ready || failed ? "none" : undefined }}
      />

      <canvas
        ref={canvasRef}
        className="w-full h-full object-cover object-top"
        style={{ display: ready ? undefined : "none" }}
      />
    </div>
  );
};

export default BoomerangVideoBg;

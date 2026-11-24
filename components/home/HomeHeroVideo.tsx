import React from 'react';

/**
 * HOME: TOWERS IN THE CLOUDS (DESIGN.md → "Home stories" → "The film behind the greeting").
 *
 * A short, silent film loops behind the greeting at the top of Home: a tower rising
 * out of a sea of fog in warm morning light. The clip is "Skyscraper above Clouds" by
 * Aleksandar Pasaric on Pexels (pexels.com/video/4583679), free to use under the Pexels
 * licence. It was cut to a 12-second seamless loop (the end crossfades into the start),
 * cropped so the tower stands right of the story cards, and is served from /public/home.
 * On a phone the frame is held at 80% across so the tower stays in view.
 *
 * - Muted, looped and inline, so every browser lets it play on its own.
 * - Under prefers-reduced-motion it never plays: the poster (its first frame) stands still.
 * - It pauses when Home is scrolled past it or the tab is hidden.
 * - If the clip cannot load, it takes itself away and the hero is as it was.
 * - A white wash sits over it: lighter behind the greeting so the words read, and
 *   white at the foot where the story cards sit.
 */
const SRC = '/home/hero-clouds';

export default function HomeHeroVideo() {
  const ref = React.useRef<HTMLVideoElement | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const still = !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (still) return;
    let onScreen = true;
    const sync = () => {
      if (onScreen && !document.hidden) v.play().catch(() => { /* autoplay refused: the poster stays */ });
      else v.pause();
    };
    const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); });
    io.observe(v);
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', sync); };
  }, []);

  if (failed) return null;
  return (
    <div aria-hidden className="absolute inset-0 pointer-events-none">
      <video
        ref={ref}
        className={`absolute inset-0 w-full h-full object-cover object-[80%_50%] md:object-center transition-opacity duration-700 ${ready ? 'opacity-100' : 'opacity-0'}`}
        poster={`${SRC}.jpg`}
        muted loop playsInline preload="metadata"
        onLoadedData={() => setReady(true)}
        onError={() => setFailed(true)}
      >
        <source src={`${SRC}.webm`} type="video/webm" />
        <source src={`${SRC}.mp4`} type="video/mp4" onError={() => setFailed(true)} />
      </video>
      {/* The wash: the greeting reads on it, and the story cards sit on white. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_55%_42%_at_50%_24%,rgba(255,255,255,0.82),rgba(255,255,255,0.35)_70%,rgba(255,255,255,0)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-b from-white/0 via-white/80 to-white" />
    </div>
  );
}

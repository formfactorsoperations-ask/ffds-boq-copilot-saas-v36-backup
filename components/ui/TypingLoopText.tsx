import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

const JUSTIFY: Record<"left" | "center" | "right", string> = {
  left: "flex-start",
  center: "center",
  right: "flex-end",
};

// Pause (ms) after deleting a phrase before typing the next phrase
const NEXT_DELAY = 220;

const VISUALLY_HIDDEN: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};

export interface TypingLoopCursorConfig {
  visible?: boolean;
  character?: string;
  color?: string;
  blink?: boolean;
}

export interface TypingLoopItem {
  label: string;
  value: string;
}

export interface TypingLoopTextProps {
  prefix?: string;
  phrases?: string[];
  items?: TypingLoopItem[];
  tag?: "h1" | "h2" | "h3" | "p" | "span" | "div";
  typeSpeed?: number;
  deleteSpeed?: number;
  pause?: number;
  initialDelay?: number;
  loop?: boolean;
  reserve?: boolean;
  align?: "left" | "center" | "right";
  font?: React.CSSProperties;
  color?: string;
  typedColor?: string;
  labelClassName?: string;
  labelStyle?: React.CSSProperties;
  cursor?: TypingLoopCursorConfig;
  style?: React.CSSProperties;
  className?: string;
}

export default function TypingLoopText(props: TypingLoopTextProps) {
  const {
    prefix = "",
    phrases = ["Turnkey Interior", "Spatial Architecture", "Precision BOQ"],
    items,
    tag: Tag = "div",
    typeSpeed = 52,
    deleteSpeed = 28,
    pause = 1.8,
    initialDelay = 0,
    loop = true,
    reserve = false,
    align = "left",
    font,
    color = "#64748B",
    typedColor = "#1E293B",
    labelClassName = "",
    labelStyle,
    style,
    className = "",
  } = props;

  const cursor: Required<TypingLoopCursorConfig> = {
    visible: true,
    character: "▍",
    color: "#3D52A0",
    blink: true,
    ...props.cursor,
  };

  const normalizedItems: TypingLoopItem[] =
    items && items.length > 0
      ? items.filter((it) => Boolean(it.value))
      : phrases.filter(Boolean).map((phrase) => ({ label: prefix, value: phrase }));

  // Split values by Unicode code points so multi-byte characters never slice mid-surrogate
  const list = normalizedItems.map((it) => ({
    label: it.label,
    chars: Array.from(it.value),
  }));

  const itemsKey = normalizedItems.map((it) => `${it.label}::${it.value}`).join("\n");
  const longest = list.reduce<{ label: string; chars: string[] }>(
    (result, entry) => (entry.chars.length > result.chars.length ? entry : result),
    { label: prefix, chars: [] },
  );

  const root = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [count, setCount] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [still, setStill] = useState(false);

  // Observe viewport intersection
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setStill(true);
      return;
    }
    const element = root.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true);
        observer.disconnect();
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Optional staggered start delay so multiple rows flow organically
  useEffect(() => {
    if (!inView) return;
    if (initialDelay <= 0) {
      setStarted(true);
      return;
    }
    const timer = window.setTimeout(() => setStarted(true), initialDelay);
    return () => window.clearTimeout(timer);
  }, [inView, initialDelay]);

  useEffect(() => {
    setIndex(0);
    setCount(0);
    setDeleting(false);
  }, [itemsKey]);

  useEffect(() => {
    if (still || !started || list.length === 0) return;

    const currentEntry = list[index % list.length];
    const phrase = currentEntry.chars;
    let delay = typeSpeed;
    let next = () => setCount(count + 1);

    if (!deleting && count >= phrase.length) {
      if (!loop && index >= list.length - 1) return;
      delay = pause * 1000;
      next = () => setDeleting(true);
    } else if (deleting && count > 0) {
      delay = deleteSpeed;
      next = () => setCount(count - 1);
    } else if (deleting) {
      delay = NEXT_DELAY;
      next = () => {
        setDeleting(false);
        setIndex((index + 1) % list.length);
      };
    }

    const timer = window.setTimeout(next, delay);
    return () => window.clearTimeout(timer);
  }, [
    still,
    started,
    index,
    count,
    deleting,
    itemsKey,
    typeSpeed,
    deleteSpeed,
    pause,
    loop,
    list,
  ]);

  const currentEntry = list.length
    ? list[index % list.length]
    : { label: prefix, chars: [] as string[] };
  const typed = still
    ? currentEntry.chars.join("")
    : currentEntry.chars.slice(0, count).join("");

  const cursorElement = cursor.visible && (
    <motion.span
      aria-hidden="true"
      style={{ color: cursor.color, marginLeft: "2px", fontWeight: 700 }}
      animate={{ opacity: cursor.blink && !still ? [1, 1, 0, 0] : 1 }}
      transition={{
        duration: 1,
        times: [0, 0.5, 0.5, 1],
        repeat: Infinity,
        ease: "linear",
      }}
    >
      {cursor.character}
    </motion.span>
  );

  const labelElement = currentEntry.label ? (
    <span
      className={labelClassName}
      style={{
        color,
        ...labelStyle,
      }}
    >
      {currentEntry.label}
    </span>
  ) : null;

  const line = (
    <span className="inline-flex items-center min-w-0 max-w-full">
      {labelElement}
      <span
        className="truncate"
        style={{ color: typedColor, fontWeight: font?.fontWeight ?? 700 }}
      >
        {typed}
      </span>
      {cursorElement}
    </span>
  );

  const Component = Tag as React.ElementType;

  return (
    <Component
      ref={(element: HTMLElement | null) => {
        root.current = element;
      }}
      className={className}
      style={{
        fontSize: 14,
        fontWeight: 600,
        lineHeight: 1.4,
        ...font,
        ...style,
        position: "relative",
        display: "flex",
        alignItems: "center",
        width: "100%",
        maxWidth: "100%",
        margin: 0,
        color,
        whiteSpace: "nowrap",
        overflow: "hidden",
      }}
    >
      <span style={VISUALLY_HIDDEN}>
        {currentEntry.label ? `${currentEntry.label} ` : ""}
        {currentEntry.chars.join("")}
      </span>
      {reserve ? (
        <>
          <span aria-hidden="true" style={{ visibility: "hidden" }}>
            {longest.label}
            {longest.chars.join("")}
            {cursor.visible && cursor.character}
          </span>
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: JUSTIFY[align],
              overflow: "hidden",
            }}
          >
            {line}
          </span>
        </>
      ) : (
        <span aria-hidden="true" className="w-full overflow-hidden">
          {line}
        </span>
      )}
    </Component>
  );
}

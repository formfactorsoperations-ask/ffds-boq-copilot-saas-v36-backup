"use client";
import { cn } from "../../lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import React, { useRef, useState, useEffect } from "react";

export const BackgroundBeamsWithCollision = ({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  const beams = [
    {
      translateX: "5vw",
      duration: 7,
      repeatDelay: 2.5,
      delay: 0.5,
      className: "h-16 w-[1.5px] from-indigo-300/40 via-indigo-200/20",
    },
    {
      translateX: "18vw",
      duration: 5.5,
      repeatDelay: 3,
      delay: 1.5,
      className: "h-20 w-[1px] from-purple-300/35 via-violet-200/20",
    },
    {
      translateX: "32vw",
      duration: 8,
      repeatDelay: 4,
      delay: 0,
      className: "h-14 w-[1px] from-sky-300/35 via-slate-300/20",
    },
    {
      translateX: "46vw",
      duration: 6,
      repeatDelay: 2.5,
      delay: 2,
      className: "h-20 w-[1.5px] from-violet-300/35 via-purple-200/20",
    },
    {
      translateX: "60vw",
      duration: 7.5,
      repeatDelay: 3,
      delay: 1,
      className: "h-16 w-[1px] from-amber-200/40 via-yellow-100/20",
    },
    {
      translateX: "74vw",
      duration: 5,
      repeatDelay: 2.5,
      delay: 2,
      className: "h-18 w-[1.5px] from-sky-300/35 via-indigo-200/20",
    },
    {
      translateX: "86vw",
      duration: 6.5,
      repeatDelay: 3,
      delay: 0.8,
      className: "h-16 w-[1px] from-purple-200/35 via-slate-200/20",
    },
    {
      translateX: "95vw",
      duration: 8,
      repeatDelay: 2,
      delay: 3,
      className: "h-14 w-[1px] from-blue-300/30 via-indigo-200/20",
    },
  ];

  return (
    <div
      ref={parentRef}
      className={cn(
        "relative flex items-center w-full h-full min-h-screen justify-center overflow-hidden pointer-events-none",
        className
      )}
    >
      {beams.map((beam, index) => (
        <CollisionMechanism
          key={index + "-collision-beam"}
          beamOptions={beam}
          containerRef={containerRef}
          parentRef={parentRef}
        />
      ))}

      {children}
      <div
        ref={containerRef}
        className="absolute bottom-0 w-full inset-x-0 h-2 pointer-events-none opacity-40"
        style={{
          boxShadow:
            "0 -2px 12px rgba(99, 102, 241, 0.06), 0 0 16px rgba(168, 85, 247, 0.04) inset",
        }}
      />
    </div>
  );
};

interface BeamOptions {
  translateX?: string | number;
  initialY?: string | number;
  translateY?: string | number;
  rotate?: number;
  className?: string;
  duration?: number;
  delay?: number;
  repeatDelay?: number;
}

interface CollisionMechanismProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  parentRef: React.RefObject<HTMLDivElement | null>;
  beamOptions?: BeamOptions;
}

const CollisionMechanism = React.forwardRef<
  HTMLDivElement,
  CollisionMechanismProps
>(({ parentRef, containerRef, beamOptions = {} }: CollisionMechanismProps, ref) => {
  const beamRef = useRef<HTMLDivElement>(null);
  const [collision, setCollision] = useState<{
    detected: boolean;
    coordinates: { x: number; y: number } | null;
  }>({
    detected: false,
    coordinates: null,
  });
  const [beamKey, setBeamKey] = useState(0);
  const [cycleCollisionDetected, setCycleCollisionDetected] = useState(false);

  useEffect(() => {
    const checkCollision = () => {
      if (
        beamRef.current &&
        containerRef.current &&
        parentRef.current &&
        !cycleCollisionDetected
      ) {
        const beamRect = beamRef.current.getBoundingClientRect();
        const containerRect = containerRef.current.getBoundingClientRect();
        const parentRect = parentRef.current.getBoundingClientRect();

        if (beamRect.bottom >= containerRect.top) {
          const relativeX =
            beamRect.left - parentRect.left + beamRect.width / 2;
          const relativeY = containerRect.top - parentRect.top;

          setCollision({
            detected: true,
            coordinates: {
              x: relativeX,
              y: relativeY,
            },
          });
          setCycleCollisionDetected(true);
        }
      }
    };

    const animationInterval = setInterval(checkCollision, 40);

    return () => clearInterval(animationInterval);
  }, [cycleCollisionDetected, containerRef, parentRef]);

  useEffect(() => {
    if (collision.detected && collision.coordinates) {
      const resetTimeout = setTimeout(() => {
        setCollision({ detected: false, coordinates: null });
        setCycleCollisionDetected(false);
      }, 1800);

      const loopTimeout = setTimeout(() => {
        setBeamKey((prevKey) => prevKey + 1);
      }, 2000);

      return () => {
        clearTimeout(resetTimeout);
        clearTimeout(loopTimeout);
      };
    }
  }, [collision]);

  const xPos = beamOptions.translateX || "0px";

  return (
    <>
      <motion.div
        key={beamKey}
        ref={beamRef}
        animate="animate"
        initial={{
          translateY: beamOptions.initialY || "-150px",
          translateX: xPos,
          rotate: beamOptions.rotate || 0,
        }}
        variants={{
          animate: {
            translateY: beamOptions.translateY || "105vh",
            translateX: xPos,
            rotate: beamOptions.rotate || 0,
          },
        }}
        transition={{
          duration: beamOptions.duration || 6,
          repeat: Infinity,
          repeatType: "loop",
          ease: "linear",
          delay: beamOptions.delay || 0,
          repeatDelay: beamOptions.repeatDelay || 0,
        }}
        className={cn(
          "absolute left-0 top-0 m-auto rounded-full bg-gradient-to-t to-transparent pointer-events-none z-20 opacity-70",
          beamOptions.className
        )}
      />
      <AnimatePresence>
        {collision.detected && collision.coordinates && (
          <Explosion
            key={`${collision.coordinates.x}-${collision.coordinates.y}-${beamKey}`}
            style={{
              left: `${collision.coordinates.x}px`,
              top: `${collision.coordinates.y}px`,
              transform: "translate(-50%, -50%)",
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
});

CollisionMechanism.displayName = "CollisionMechanism";

const Explosion = ({ ...props }: React.HTMLProps<HTMLDivElement>) => {
  const spans = Array.from({ length: 12 }, (_, index) => ({
    id: index,
    initialX: 0,
    initialY: 0,
    directionX: Math.floor(Math.random() * 60 - 30),
    directionY: Math.floor(Math.random() * -35 - 10),
  }));

  return (
    <div {...props} className={cn("absolute z-50 h-2 w-2 pointer-events-none opacity-60", props.className)}>
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 0.7, scale: 1.1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.9, ease: "easeOut" }}
        className="absolute -inset-x-6 top-0 m-auto h-1 w-12 rounded-full bg-gradient-to-r from-transparent via-indigo-300/50 to-transparent blur-[1px]"
      />
      {spans.map((span) => (
        <motion.span
          key={span.id}
          initial={{ x: span.initialX, y: span.initialY, opacity: 0.8, scale: 1 }}
          animate={{
            x: span.directionX,
            y: span.directionY,
            opacity: 0,
            scale: 0.3,
          }}
          transition={{ duration: Math.random() * 0.8 + 0.4, ease: "easeOut" }}
          className="absolute h-1 w-1 rounded-full bg-gradient-to-b from-indigo-300/80 via-purple-200/70 to-amber-200/50"
        />
      ))}
    </div>
  );
};

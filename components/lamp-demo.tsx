"use client";
import React from "react";
import { motion } from "framer-motion";
import { LampContainer } from "./ui/lamp";

export default function LampDemo() {
  return (
    <div className="w-full flex items-center justify-center p-4">
      <LampContainer theme="studio" containerHeight="min-h-[26rem]">
        <motion.h1
          initial={{ opacity: 0.5, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{
            delay: 0.3,
            duration: 0.8,
            ease: "easeInOut",
          }}
          className="mt-4 bg-gradient-to-br from-slate-100 via-slate-200 to-slate-400 py-3 bg-clip-text text-center text-3xl font-bold tracking-tight text-transparent sm:text-5xl font-['Plus_Jakarta_Sans']"
        >
          Design & Interior BOQ <br /> Elevated with Precision
        </motion.h1>
      </LampContainer>
    </div>
  );
}

import React from 'react';
import { motion } from 'framer-motion';

export default function AttachedLoader({ message = "Syncing data..." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-12">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
        className="w-10 h-10 border-4 border-[#0066CC] border-t-transparent rounded-full mb-4"
      />
      <p className="text-slate-600 font-semibold text-sm tracking-wide">{message}</p>
    </div>
  );
}

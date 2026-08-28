import React from "react";
import { motion } from "framer-motion";
import { Sparkles, Sun, SunMedium, MoonStar } from "lucide-react";
import WavyText from "../ui/WavyText";

interface WavingGreetingProps {
  userName?: string;
  attentionCount: number;
  variant?: "default" | "inverted";
}

export default function WavingGreeting({
  userName = "there",
  attentionCount,
  variant = "default"
}: WavingGreetingProps) {
  const hr = new Date().getHours();
  const name = userName ? userName.split(" ")[0] : "there";
  const isInverted = variant === "inverted";
  
  let timeGreeting = "Good morning";
  let TimeIcon = Sun;
  let iconStyle = "text-amber-400 bg-amber-400/10 border-amber-400/25 shadow-[0_0_12px_rgba(251,191,36,0.25)]";

  if (hr >= 12 && hr < 17) {
    timeGreeting = "Good afternoon";
    TimeIcon = SunMedium;
    iconStyle = "text-amber-300 bg-amber-300/10 border-amber-300/25 shadow-[0_0_12px_rgba(252,211,77,0.25)]";
  } else if (hr >= 17 || hr < 5) {
    timeGreeting = "Good evening";
    TimeIcon = MoonStar;
    iconStyle = "text-indigo-300 bg-indigo-400/10 border-indigo-400/25 shadow-[0_0_12px_rgba(165,180,252,0.25)]";
  }

  return (
    <div className="flex flex-col gap-1.5 font-['Plus_Jakarta_Sans']">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className={`text-2xl sm:text-3xl font-bold tracking-tight leading-tight flex items-center gap-2.5 ${isInverted ? 'text-white' : 'text-slate-900'}`}>
          <span>{timeGreeting},</span>
          <span className="bg-gradient-to-r from-sky-400 via-sky-500 to-amber-300 bg-clip-text text-transparent">
            {name}
          </span>
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className={`p-1.5 rounded-full border flex items-center justify-center transition-all ${iconStyle}`}
            title={timeGreeting}
          >
            <TimeIcon className="w-5 h-5" />
          </motion.div>
        </h1>

        <span className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold shadow-2xs backdrop-blur-xs ${
          isInverted
            ? 'bg-sky-500/20 border border-sky-400/30 text-sky-200'
            : 'bg-sky-50/80 border border-sky-200/60 text-sky-700'
        }`}>
          <Sparkles className={`w-3 h-3 ${isInverted ? 'text-sky-300' : 'text-sky-500'}`} />
          <span>Studio Workspace</span>
        </span>
      </div>

      <div className={`text-xs sm:text-sm font-medium flex items-center gap-2 mt-0.5 ${isInverted ? 'text-slate-300' : 'text-slate-500'}`}>
        {attentionCount > 0 ? (
          <>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
            </span>
            <WavyText
              text={`You have ${attentionCount} ${attentionCount === 1 ? 'item' : 'items'} requiring your attention today.`}
              className={`text-xs sm:text-sm font-medium ${isInverted ? 'text-slate-300' : 'text-slate-500'}`}
            />
          </>
        ) : (
          <>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <WavyText
              text="All portfolio milestones are on track. Have an inspiring design session!"
              className={`text-xs sm:text-sm font-medium ${isInverted ? 'text-slate-300' : 'text-slate-500'}`}
            />
          </>
        )}
      </div>
    </div>
  );
}

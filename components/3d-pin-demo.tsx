"use client";
import React from "react";
import { PinContainer } from "./ui/3d-pin";

export default function AnimatedPinDemo() {
  return (
    <div className="h-[40rem] w-full flex items-center justify-center ">
      <PinContainer
        title="Project Workspace"
        href="#"
      >
        <div className="flex basis-full flex-col p-4 tracking-tight text-slate-800 sm:basis-1/2 w-[20rem] h-[20rem] ">
          <h3 className="max-w-xs !pb-2 !m-0 font-bold text-base text-slate-900 font-['Plus_Jakarta_Sans']">
            Lodha Amara 2BHK
          </h3>
          <div className="text-sm !m-0 !p-0 font-normal">
            <span className="text-slate-500">
              Execution Phase • 650 SQFT • Milestone E2 Structure & First-Fix
            </span>
          </div>
          <div className="flex flex-1 w-full rounded-xl mt-4 bg-gradient-to-br from-sky-500 via-[#334486] to-slate-900 p-4 flex flex-col justify-end text-white">
            <span className="text-xs uppercase font-bold tracking-wider text-sky-200">BOQ Scope</span>
            <span className="text-lg font-bold">₹18,50,000</span>
          </div>
        </div>
      </PinContainer>
    </div>
  );
}

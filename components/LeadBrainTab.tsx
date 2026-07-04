import React, { useState } from "react";
import { ProjectContext, LeadProfile } from "../types";
import Card from "./shared/Card";
import { BrainIcon, AlertCircleIcon, ShieldCheckIcon } from "./Icons";
import { motion } from "framer-motion";

interface LeadBrainTabProps {
  projectContext: ProjectContext;
  leadProfile: LeadProfile;
  setLeadProfile: (profile: LeadProfile) => void;
  onStrategyChange?: (strategy: any) => void;
  setActiveTab?: (tab: string) => void;
}

export interface ExecutionArmorOutput {
  insights: {
    title: string;
    description: string;
    type: "warning" | "info" | "critical";
  }[];
  opsRules: string[];
  frictionScore: number;
}

const LeadBrainTab: React.FC<LeadBrainTabProps> = ({
  projectContext,
  leadProfile,
  setLeadProfile,
  onStrategyChange,
  setActiveTab,
}) => {
  const [strategy, setStrategy] = useState<ExecutionArmorOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleAnalyze = async () => {
    setIsLoading(true);

    // Simulate slight delay for effect
    await new Promise((resolve) => setTimeout(resolve, 800));

    let friction = 0;
    const insights: ExecutionArmorOutput["insights"] = [];
    const opsRules: string[] = [];

    // 1. Track the "Iteration Tax"
    if (leadProfile.iterationsToClose === "3+") {
      friction += 35;
      insights.push({
        title: "High Revision Risk",
        description:
          "Client required 3+ revisions pre-signoff. Expect similar indecision during execution.",
        type: "critical",
      });
      opsRules.push(
        "Buffer design phase by +20%. Mandate hard freeze on 2D layouts before moving to 3D. Do not procure materials until dual-signature signoff is received.",
      );
    } else if (leadProfile.iterationsToClose === "2") {
      friction += 15;
      insights.push({
        title: "Moderate Revisions",
        description: "Standard back-and-forth observed.",
        type: "info",
      });
      opsRules.push(
        "Ensure all material choices are locked before procurement begins.",
      );
    }

    // 2. Identify the "Hidden Veto"
    if (leadProfile.hiddenDecisionMakers !== "None") {
      friction += 25;
      insights.push({
        title: "Multi-node Decision Matrix",
        description: `Approval depends on a hidden veto (${leadProfile.hiddenDecisionMakers}). Danger of late-stage rejections.`,
        type: "warning",
      });
      opsRules.push(
        `All formal approvals must be sent to a shared WhatsApp group including the ${leadProfile.hiddenDecisionMakers}. Add a "${leadProfile.hiddenDecisionMakers} Approval" checkpoint before procurement gate.`,
      );
    }

    // 3. Analyze the "Objection Gravity"
    if (leadProfile.primaryFrictionPoint === "Itemized Costs") {
      friction += 20;
      insights.push({
        title: "Micro-Cost Sensitivity",
        description:
          "Client pushes back on specific line items rather than overall value. They are a value-shopper.",
        type: "warning",
      });
      opsRules.push(
        "For all Schedule of Finishes (SOF) presentations, prepare a 3-tier option (Good, Better, Best) upfront to prevent them from pausing execution to 'check the market'.",
      );
    } else if (leadProfile.primaryFrictionPoint === "Design Details") {
      friction += 20;
      insights.push({
        title: "Design Perfectionist",
        description: "Friction stems from minor design details.",
        type: "warning",
      });
      opsRules.push(
        "Allocate senior designer for final sign-off meetings. Do not proceed to execution on verbal approvals; require signed renders.",
      );
    } else if (leadProfile.primaryFrictionPoint === "Timeline") {
      friction += 15;
      insights.push({
        title: "Timeline Anxiety",
        description: "Client is highly sensitive to delivery dates.",
        type: "info",
      });
      opsRules.push(
        "Pad execution timeline by 10% in client communications. Share weekly site updates strictly every Friday to preempt anxiety.",
      );
    }

    // 4. Communication Channel Dominance
    if (leadProfile.communicationPreference === "WhatsApp") {
      insights.push({
        title: "Informal Comms Bias",
        description: "Client prefers rapid, informal communication.",
        type: "info",
      });
      opsRules.push(
        "System flags any pending email approvals older than 24 hours and prompts the PM to send a specific WhatsApp summary link to force the decision.",
      );
    } else if (leadProfile.communicationPreference === "Calls") {
      friction += 5;
      insights.push({
        title: "Verbal Bias",
        description:
          "Client prefers phone calls, creating a risk of unrecorded decisions.",
        type: "warning",
      });
      opsRules.push(
        "PM must send a 'Call Summary' WhatsApp message within 15 minutes of every client call. No execution action taken without written acknowledgment.",
      );
    }

    const output: ExecutionArmorOutput = {
      frictionScore: Math.min(100, friction),
      insights,
      opsRules,
    };

    setStrategy(output);
    setIsLoading(false);
  };

  const handleInputChange = (field: keyof LeadProfile, value: any) => {
    setLeadProfile({ ...leadProfile, [field]: value });
  };

  const MotionDiv = motion.div as any;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 max-w-7xl mx-auto">
      {/* Input Column - Verifiable Events */}
      <div className="xl:col-span-4 space-y-6">
        <div>
          <h2 className="text-2xl font-light tracking-tight text-indigo-950 mb-1">
            LeadIQ Handover
          </h2>
          <p className="text-sm text-slate-500">
            Translate sales friction into execution armor. Track objective,
            non-vague signals before execution begins.
          </p>
        </div>

        <div className="space-y-4">
          <Card
            title="Sales Handoff Metrics"
            className="bg-white border-slate-200"
          >
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">
                  Iterations to close
                </label>
                <p className="text-[11px] text-slate-500 mb-3">
                  How many times did the initial layout/BOQ change?
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {["1", "2", "3+"].map((val) => (
                    <button
                      key={val}
                      onClick={() =>
                        handleInputChange("iterationsToClose", val)
                      }
                      className={`py-2 px-3 rounded-lg border text-sm font-medium transition-all ${leadProfile.iterationsToClose === val ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <label className="block text-sm font-bold text-slate-700 mb-1.5">
                  Hidden decision makers surfaced?
                </label>
                <p className="text-[11px] text-slate-500 mb-3">
                  Who actually holds up the approvals?
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {["None", "Spouse", "Parents", "Consultant"].map((val) => (
                    <button
                      key={val}
                      onClick={() =>
                        handleInputChange("hiddenDecisionMakers", val)
                      }
                      className={`py-2 px-3 rounded-lg border text-sm font-medium transition-all ${leadProfile.hiddenDecisionMakers === val ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <label className="block text-sm font-bold text-slate-700 mb-1.5">
                  Primary friction point
                </label>
                <p className="text-[11px] text-slate-500 mb-3">
                  What did they push back on the most?
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    "Overall Budget",
                    "Itemized Costs",
                    "Timeline",
                    "Design Details",
                    "Trust",
                  ].map((val) => (
                    <button
                      key={val}
                      onClick={() =>
                        handleInputChange("primaryFrictionPoint", val)
                      }
                      className={`py-2 px-2 rounded-lg border text-xs font-medium transition-all ${leadProfile.primaryFrictionPoint === val ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <label className="block text-sm font-bold text-slate-700 mb-1.5">
                  Communication preference
                </label>
                <p className="text-[11px] text-slate-500 mb-3">
                  Fastest response channel
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {["Calls", "WhatsApp", "Emails"].map((val) => (
                    <button
                      key={val}
                      onClick={() =>
                        handleInputChange("communicationPreference", val)
                      }
                      className={`py-2 px-3 rounded-lg border text-sm font-medium transition-all ${leadProfile.communicationPreference === val ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <button
            onClick={handleAnalyze}
            disabled={isLoading}
            className="w-full py-4 bg-indigo-950 text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-50 disabled:transform-none transition-all flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                <span>Generating Execution Armor...</span>
              </>
            ) : (
              <>
                <ShieldCheckIcon className="w-5 h-5 text-indigo-400" /> Generate
                Execution Armor
              </>
            )}
          </button>
        </div>
      </div>

      {/* Output Column */}
      <div className="xl:col-span-8">
        {strategy ? (
          <MotionDiv
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="bg-indigo-950 rounded-[2rem] p-8 text-white relative overflow-hidden shadow-2xl">
              <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
              <div className="relative z-10 flex flex-col md:flex-row gap-8 items-start justify-between">
                <div>
                  <h3 className="text-3xl font-light tracking-tight mb-2">
                    Execution Armor Active
                  </h3>
                  <p className="text-slate-400 max-w-lg text-sm leading-relaxed">
                    LeadIQ has translated sales friction into execution armor.
                    The following rules must be mandated for this project to
                    prevent site-level delays.
                  </p>
                </div>

                <div className="shrink-0 bg-white/10 backdrop-blur-md border border-white/10 p-5 rounded-2xl text-center min-w-[140px]">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                    Friction Index
                  </p>
                  <div className="text-4xl font-light tracking-tighter">
                    <span
                      className={
                        strategy.frictionScore > 60
                          ? "text-rose-400"
                          : strategy.frictionScore > 30
                            ? "text-amber-400"
                            : "text-emerald-400"
                      }
                    >
                      {strategy.frictionScore}
                    </span>
                    <span className="text-xl text-slate-500">/100</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Insights */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">
                  Execution Insights
                </h4>
                {strategy.insights.map((insight, idx) => (
                  <div
                    key={idx}
                    className={`p-5 rounded-2xl border ${insight.type === "critical" ? "bg-rose-50 border-rose-200" : insight.type === "warning" ? "bg-amber-50 border-amber-200" : "bg-blue-50 border-blue-200"}`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {insight.type === "critical" && (
                        <AlertCircleIcon className="w-5 h-5 text-rose-500" />
                      )}
                      {insight.type === "warning" && (
                        <AlertCircleIcon className="w-5 h-5 text-amber-500" />
                      )}
                      {insight.type === "info" && (
                        <BrainIcon className="w-5 h-5 text-blue-500" />
                      )}
                      <h5
                        className={`font-bold ${insight.type === "critical" ? "text-rose-800" : insight.type === "warning" ? "text-amber-800" : "text-blue-800"}`}
                      >
                        {insight.title}
                      </h5>
                    </div>
                    <p
                      className={`text-sm ${insight.type === "critical" ? "text-rose-600" : insight.type === "warning" ? "text-amber-700" : "text-blue-700"}`}
                    >
                      {insight.description}
                    </p>
                  </div>
                ))}
              </div>

              {/* Rules */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">
                  Generated Ops Rules
                </h4>
                {strategy.opsRules.map((rule, idx) => (
                  <div
                    key={idx}
                    className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm relative overflow-hidden group"
                  >
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500"></div>
                    <p className="text-sm text-slate-700 font-medium pl-2 leading-relaxed">
                      {rule}
                    </p>
                  </div>
                ))}
                {strategy.opsRules.length === 0 && (
                  <div className="p-5 border border-dashed border-slate-200 rounded-2xl text-slate-400 text-sm text-center">
                    No special execution rules required. Standard operating
                    procedure applies.
                  </div>
                )}
              </div>
            </div>
          </MotionDiv>
        ) : (
          <div className="h-full flex flex-col items-center justify-center p-12 text-center text-slate-400 border border-dashed border-slate-300 rounded-[2rem] bg-white">
            <div className="w-20 h-20 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center shadow-sm mb-6">
              <ShieldCheckIcon className="w-8 h-8 text-slate-300" />
            </div>
            <h3 className="text-2xl font-light tracking-tight text-indigo-950 mb-2">
              No Armor Generated
            </h3>
            <p className="max-w-md text-slate-500 text-sm">
              Input the sales friction metrics on the left to generate
              actionable ops rules for the execution team.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default LeadBrainTab;

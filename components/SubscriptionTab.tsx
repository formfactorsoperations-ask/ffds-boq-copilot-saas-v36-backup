import React, { useState } from 'react';
import Card from './shared/Card';

export default function SubscriptionTab() {
    const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('annual');

    return (
        <div className="max-w-5xl mx-auto space-y-8">
            <div className="text-center space-y-4 pt-8">
                <h1 className="text-4xl font-black text-slate-800 tracking-tight">Upgrade Your Studio</h1>
                <p className="text-slate-500 font-medium max-w-xl mx-auto">
                    Scale your interior execution with advanced AI estimation, margin optimization, and multi-tenant client portals.
                </p>

                <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl mt-6">
                    <button 
                        onClick={() => setBillingCycle('monthly')}
                        className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${billingCycle === 'monthly' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
                    >
                        Monthly
                    </button>
                    <button 
                        onClick={() => setBillingCycle('annual')}
                        className={`px-6 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${billingCycle === 'annual' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
                    >
                        Annually <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Save 20%</span>
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-8">
                {/* Free Tier */}
                <div className="border border-slate-200 bg-white rounded-2xl p-6 flex flex-col hover:border-slate-300 transition-colors">
                    <h3 className="text-lg font-black text-slate-800">Starter</h3>
                    <p className="text-sm text-slate-500 mt-1">For freelancers and small studios.</p>
                    <div className="my-6">
                        <span className="text-4xl font-black text-slate-800">₹0</span>
                        <span className="text-slate-500">/mo</span>
                    </div>
                    <ul className="space-y-3 flex-grow text-sm text-slate-600 font-medium">
                        <li className="flex items-center gap-2"><span>✓</span> Up to 3 Active Projects</li>
                        <li className="flex items-center gap-2"><span>✓</span> Standard Item Bank (FFDS Defaults)</li>
                        <li className="flex items-center gap-2"><span>✓</span> Basic Client Proposals</li>
                        <li className="flex items-center gap-2"><span>✓</span> 1 Team Member</li>
                    </ul>
                    <button className="w-full py-3 mt-6 rounded-xl font-bold bg-slate-100 text-slate-500 cursor-not-allowed">
                        Current Plan
                    </button>
                </div>

                {/* Pro Tier (Recommended) */}
                <div className="border-2 border-blue-600 bg-white rounded-2xl p-6 flex flex-col relative shadow-xl scale-105 z-10">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full">
                        Most Popular
                    </div>
                    <h3 className="text-lg font-black text-blue-900">Pro Studio</h3>
                    <p className="text-sm text-blue-600/70 mt-1">AI-powered estimations & margin control.</p>
                    <div className="my-6">
                        <span className="text-4xl font-black text-slate-800">{billingCycle === 'annual' ? '₹2,499' : '₹2,999'}</span>
                        <span className="text-slate-500">/mo</span>
                    </div>
                    <ul className="space-y-3 flex-grow text-sm text-slate-700 font-medium">
                        <li className="flex items-center gap-2 text-blue-700"><span>✦</span> Custom Item Bank & Modifiers</li>
                        <li className="flex items-center gap-2 text-blue-700"><span>✦</span> Margin Optimizer & Profit Tracking</li>
                        <li className="flex items-center gap-2"><span>✓</span> Unlimited Active Projects</li>
                        <li className="flex items-center gap-2"><span>✓</span> White-labeled Client Portal</li>
                        <li className="flex items-center gap-2"><span>✓</span> Up to 5 Team Members</li>
                        <li className="flex items-center gap-2"><span>✓</span> Execution Workspace & SOF Gen</li>
                    </ul>
                    <button className="w-full py-3 mt-6 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg focus:ring-4 focus:ring-blue-500/20">
                        Upgrade to Pro
                    </button>
                </div>

                {/* Enterprise Tier */}
                <div className="border border-slate-200 bg-white rounded-2xl p-6 flex flex-col hover:border-slate-300 transition-colors">
                    <h3 className="text-lg font-black text-slate-800">Scale</h3>
                    <p className="text-sm text-slate-500 mt-1">Multi-city operations and vendor sub-portals.</p>
                    <div className="my-6">
                        <span className="text-4xl font-black text-slate-800">{billingCycle === 'annual' ? '₹7,999' : '₹9,999'}</span>
                        <span className="text-slate-500">/mo</span>
                    </div>
                    <ul className="space-y-3 flex-grow text-sm text-slate-600 font-medium">
                        <li className="flex items-center gap-2 font-bold text-slate-800"><span>♚</span> Vendor Bidding Portals</li>
                        <li className="flex items-center gap-2 font-bold text-slate-800"><span>♚</span> Multi-Studio Franchises</li>
                        <li className="flex items-center gap-2 text-blue-700"><span>✦</span> LeadIQ War Room (AI Scoring)</li>
                        <li className="flex items-center gap-2"><span>✓</span> Unlimited Team Members</li>
                        <li className="flex items-center gap-2"><span>✓</span> Dedicated Account Manager</li>
                    </ul>
                    <button className="w-full py-3 mt-6 rounded-xl font-bold bg-slate-900 text-white hover:bg-slate-800 transition-colors">
                        Contact Sales
                    </button>
                </div>
            </div>

            <Card className="mt-12 bg-slate-50 border-slate-200/60 shadow-none">
                <div className="flex flex-col md:flex-row gap-6 items-center justify-between">
                    <div>
                        <h4 className="font-bold text-slate-800">Billing History & Invoices</h4>
                        <p className="text-sm text-slate-500">View past statements and manage your payment methods.</p>
                    </div>
                    <button className="px-5 py-2 border border-slate-300 rounded-lg text-sm font-bold text-slate-700 bg-white hover:bg-slate-50 transition-colors">
                        Manage Billing via Stripe
                    </button>
                </div>
            </Card>
        </div>
    );
}

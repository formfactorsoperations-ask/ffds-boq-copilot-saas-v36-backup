import React from 'react';
import { BuildingOfficeIcon, AnalyticsIcon } from '../Icons';

export default function SuperAdminDashboard() {
    // Mock data for the SaaS Super Admin dashboard
    const studios = [
        { id: 1, name: "Form Factors Design Studio", plan: "Enterprise", status: "Active", projects: 42, mrr: "$1,200", lastActive: "Today" },
        { id: 2, name: "Minimalist Spaces", plan: "Pro", status: "Active", projects: 15, mrr: "$499", lastActive: "2 hrs ago" },
        { id: 3, name: "Studio 11 Interiors", plan: "Starter", status: "Churned", projects: 3, mrr: "$0", lastActive: "2 months ago" },
        { id: 4, name: "The Velvet Room", plan: "Pro", status: "Active", projects: 8, mrr: "$499", lastActive: "Yesterday" },
    ];

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-fade-in p-8">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">Platform Admin</h1>
                    <p className="text-slate-500">Manage tenant studios, MRR, and platform health.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <p className="text-sm font-bold text-slate-500 uppercase">Total Studios</p>
                    <p className="text-3xl font-bold text-slate-900 mt-2">124</p>
                    <div className="mt-2 text-sm text-emerald-600 font-medium">+12 this month</div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <p className="text-sm font-bold text-slate-500 uppercase">Active Projects</p>
                    <p className="text-3xl font-bold text-slate-900 mt-2">892</p>
                    <div className="mt-2 text-sm text-emerald-600 font-medium">+104 this month</div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <p className="text-sm font-bold text-slate-500 uppercase">MRR</p>
                    <p className="text-3xl font-bold text-slate-900 mt-2">$24,500</p>
                    <div className="mt-2 text-sm text-emerald-600 font-medium">+4% this month</div>
                </div>
                <div className="bg-slate-900 p-6 rounded-2xl shadow-lg shadow-slate-900/20 text-white">
                    <p className="text-sm font-bold text-slate-400 uppercase">Est. ARR</p>
                    <p className="text-3xl font-bold tracking-tight mt-2">$294,000</p>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                            <BuildingOfficeIcon className="w-5 h-5" />
                        </div>
                        <h2 className="font-bold text-slate-800">Tenant Studios</h2>
                    </div>
                    <button className="px-4 py-2 bg-indigo-50 text-indigo-600 font-bold text-sm rounded-lg hover:bg-indigo-100 transition-colors">
                        + Provision New Tenant
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-100 text-xs uppercase tracking-wider text-slate-500">
                                <th className="p-4 font-bold">Studio Name</th>
                                <th className="p-4 font-bold">Plan</th>
                                <th className="p-4 font-bold">Status</th>
                                <th className="p-4 font-bold text-right">Active Projects</th>
                                <th className="p-4 font-bold text-right">MRR</th>
                                <th className="p-4 font-bold text-right">Last Active</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {studios.map(studio => (
                                <tr key={studio.id} className="hover:bg-slate-50 transition-colors group cursor-pointer">
                                    <td className="p-4">
                                        <p className="font-bold text-slate-900">{studio.name}</p>
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                                            studio.plan === 'Enterprise' ? 'bg-purple-100 text-purple-700' :
                                            studio.plan === 'Pro' ? 'bg-blue-100 text-blue-700' :
                                            'bg-slate-100 text-slate-700'
                                        }`}>
                                            {studio.plan}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        <span className={`flex items-center gap-1.5 text-sm font-bold ${
                                            studio.status === 'Active' ? 'text-emerald-600' : 'text-slate-400'
                                        }`}>
                                            <span className={`w-2 h-2 rounded-full ${
                                                studio.status === 'Active' ? 'bg-emerald-500' : 'bg-slate-300'
                                            }`}></span>
                                            {studio.status}
                                        </span>
                                    </td>
                                    <td className="p-4 text-right font-medium text-slate-700">
                                        {studio.projects}
                                    </td>
                                    <td className="p-4 text-right font-mono font-medium text-slate-700">
                                        {studio.mrr}
                                    </td>
                                    <td className="p-4 text-right text-sm text-slate-500">
                                        {studio.lastActive}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-6 flex items-start gap-4">
                <div className="bg-indigo-100 text-indigo-600 p-2 rounded-lg shrink-0">
                    <span className="text-xl">ℹ️</span>
                </div>
                <div>
                   <h3 className="font-bold text-indigo-900 mb-1">Super Admin Mode</h3>
                   <p className="text-sm text-indigo-800">
                       As the SaaS owner, this is your overarching platform view. In a full multi-tenant deployment, this dashboard would be isolated from the standard app and route directly to a Super Admin cluster managing the Firebase tenant configurations.
                   </p>
                </div>
            </div>
        </div>
    );
}

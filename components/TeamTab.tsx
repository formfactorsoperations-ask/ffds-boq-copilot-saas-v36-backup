import React, { useState } from 'react';
import Card from './shared/Card';
import { motion, AnimatePresence } from 'framer-motion';
import { useOrg } from '../contexts/OrgContext';

type Role = 'Admin' | 'Ops Director' | 'Site Supervisor' | 'Vendor';

interface TeamMember {
    id: string;
    name: string;
    email: string;
    role: Role;
    status: 'Active' | 'Pending';
}

type PlanTier = 'Free' | 'Professional' | 'Enterprise';

export default function TeamTab() {
    const { teamMembers, addTeamMember, removeTeamMember } = useOrg();
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
    const [emailInput, setEmailInput] = useState('');
    const [roleSelect, setRoleSelect] = useState<Role>('Site Supervisor');
    // Mock the current plan to demonstrate the feature
    const [currentPlan, setCurrentPlan] = useState<PlanTier>('Professional');

    const planLimits = {
        'Free': { maxSeats: 3, allowedRoles: ['Admin', 'Site Supervisor'] },
        'Professional': { maxSeats: 10, allowedRoles: ['Admin', 'Ops Director', 'Site Supervisor'] },
        'Enterprise': { maxSeats: 999, allowedRoles: ['Admin', 'Ops Director', 'Site Supervisor', 'Vendor'] }
    };

    const currentLimit = planLimits[currentPlan].maxSeats;
    const allowedRoles = planLimits[currentPlan].allowedRoles;
    const isAtLimit = teamMembers.length >= currentLimit;

    const handleInvite = (e: React.FormEvent) => {
        e.preventDefault();
        if (isAtLimit) return;
        if (!allowedRoles.includes(roleSelect)) {
            alert(`The role '${roleSelect}' is not available on the ${currentPlan} plan.`);
            return;
        }
        
        const newMember: TeamMember = {
            id: Date.now().toString(),
            name: emailInput.split('@')[0],
            email: emailInput,
            role: roleSelect,
            status: 'Pending'
        };
        addTeamMember(newMember as any);
        setIsInviteModalOpen(false);
        setEmailInput('');
        setRoleSelect('Site Supervisor');
    };

    const handleRemove = (id: string) => {
        removeTeamMember(id);
    };

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-indigo-900 tracking-tight">Team & Access Control</h1>
                    <p className="text-sm text-slate-500 font-medium mt-1">Manage who evaluates, manages, and executes your interior projects.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold flex items-center gap-2">
                        <span className="text-slate-500 uppercase">Plan:</span>
                        <select 
                            value={currentPlan}
                            onChange={(e) => setCurrentPlan(e.target.value as PlanTier)}
                            className="bg-transparent text-indigo-600 outline-none cursor-pointer"
                        >
                            <option value="Free">Free</option>
                            <option value="Professional">Professional</option>
                            <option value="Enterprise">Enterprise</option>
                        </select>
                    </div>
                    <button 
                        onClick={() => setIsInviteModalOpen(true)}
                        disabled={isAtLimit}
                        className={`px-5 py-2.5 text-white rounded-lg font-bold transition-all shadow-sm ${
                            isAtLimit 
                            ? 'bg-slate-300 cursor-not-allowed'
                            : 'bg-indigo-600 hover:bg-indigo-700 hover:scale-105 active:scale-95 shadow-md'
                        }`}
                    >
                        + Invite Member
                    </button>
                </div>
            </div>

            {/* Plan Usage Alert */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
                <div>
                    <div className="text-sm font-bold text-indigo-900">Workspace Seats ({teamMembers.length} / {currentPlan === 'Enterprise' ? 'Unlimited' : currentLimit})</div>
                    <div className="text-xs text-slate-500 mt-1">
                        {isAtLimit 
                            ? `You have reached the maximum team size for the ${currentPlan} plan.` 
                            : `You can invite ${currentLimit - teamMembers.length} more members on your current plan.`}
                    </div>
                </div>
                <div className="w-1/3 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div 
                        className={`h-2.5 rounded-full ${isAtLimit ? 'bg-rose-500' : 'bg-indigo-500'}`} 
                        style={{ width: `${currentPlan === 'Enterprise' ? (teamMembers.length / 20) * 100 : (teamMembers.length / currentLimit) * 100}%` }}
                    ></div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card title="Admin" className={`border-indigo-100 ${!allowedRoles.includes('Admin') ? 'bg-slate-50 opacity-60 grayscale' : 'bg-indigo-50'}`}>
                    <div className="flex flex-col h-full justify-between">
                        <p className="text-xs text-slate-600 mt-2">Full access to billing, global templates, margins, and all projects.</p>
                        {!allowedRoles.includes('Admin') && <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mt-3 flex items-center gap-1">🔒 Requires Upgrade</span>}
                    </div>
                </Card>
                <Card title="Ops Director" className={`border-blue-100 ${!allowedRoles.includes('Ops Director') ? 'bg-slate-50 opacity-60 grayscale' : 'bg-blue-50'}`}>
                    <div className="flex flex-col h-full justify-between">
                        <p className="text-xs text-slate-600 mt-2">Can create projects, approve budgets, and set item bank pricing.</p>
                        {!allowedRoles.includes('Ops Director') && <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mt-3 flex items-center gap-1">🔒 Requires Prof. Plan</span>}
                    </div>
                </Card>
                <Card title="Site Supervisor" className={`border-amber-100 ${!allowedRoles.includes('Site Supervisor') ? 'bg-slate-50 opacity-60 grayscale' : 'bg-amber-50'}`}>
                    <div className="flex flex-col h-full justify-between">
                        <p className="text-xs text-slate-600 mt-2">Only sees active execution bundles, SOF checklist, and defect logging.</p>
                        {!allowedRoles.includes('Site Supervisor') && <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mt-3 flex items-center gap-1">🔒 Requires Upgrade</span>}
                    </div>
                </Card>
                <Card title="Vendor" className={`border-slate-200 ${!allowedRoles.includes('Vendor') ? 'bg-slate-50 opacity-60 grayscale' : 'bg-slate-50'}`}>
                    <div className="flex flex-col h-full justify-between">
                        <p className="text-xs text-slate-600 mt-2">External access restricted to assigned BOQ packages (blind margins).</p>
                        {!allowedRoles.includes('Vendor') && <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mt-3 flex items-center gap-1">🔒 Requires Ent. Plan</span>}
                    </div>
                </Card>
            </div>

            <Card title="Workspace Members">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-slate-600">
                        <thead className="text-xs uppercase text-slate-400 bg-slate-50 border-b border-slate-100">
                            <tr>
                                <th className="py-3 px-4 rounded-tl-lg">User</th>
                                <th className="py-3 px-4">Role</th>
                                <th className="py-3 px-4">Status</th>
                                <th className="py-3 px-4 text-right rounded-tr-lg">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {teamMembers.map((member) => (
                                <tr key={member.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                                    <td className="py-4 px-4">
                                        <div className="font-bold text-indigo-900">{member.name}</div>
                                        <div className="text-slate-500 text-xs">{member.email}</div>
                                    </td>
                                    <td className="py-4 px-4">
                                        <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${
                                            member.role === 'Admin' ? 'bg-indigo-100 text-indigo-700' :
                                            member.role === 'Ops Director' ? 'bg-blue-100 text-blue-700' :
                                            member.role === 'Site Supervisor' ? 'bg-amber-100 text-amber-700' :
                                            'bg-slate-100 text-slate-700'
                                        }`}>
                                            {member.role}
                                        </span>
                                    </td>
                                    <td className="py-4 px-4">
                                        <span className={`flex items-center gap-1.5 text-xs font-bold ${member.status === 'Active' ? 'text-emerald-600' : 'text-slate-400'}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${member.status === 'Active' ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                                            {member.status}
                                        </span>
                                    </td>
                                    <td className="py-4 px-4 text-right">
                                        {member.role !== 'Admin' && (
                                            <button 
                                                onClick={() => handleRemove(member.id)}
                                                className="text-rose-500 hover:text-rose-700 text-xs font-bold transition-colors"
                                            >
                                                Revoke
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            <AnimatePresence>
                {isInviteModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-indigo-950/40 backdrop-blur-sm">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-100"
                        >
                            <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                                <h2 className="text-xl font-black text-indigo-900">Invite Team Member</h2>
                                <button onClick={() => setIsInviteModalOpen(false)} className="text-slate-400 hover:text-slate-600">×</button>
                            </div>
                            <form onSubmit={handleInvite} className="p-6 space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Email Address</label>
                                    <input 
                                        type="email" 
                                        required
                                        value={emailInput}
                                        onChange={e => setEmailInput(e.target.value)}
                                        className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                        placeholder="colleague@studio.com"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Assign Role</label>
                                    <select 
                                        value={roleSelect}
                                        onChange={e => setRoleSelect(e.target.value as Role)}
                                        className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-white"
                                    >
                                        <option value="Admin" disabled={!allowedRoles.includes('Admin')}>Admin {!allowedRoles.includes('Admin') ? '(Requires Upgrade)' : ''}</option>
                                        <option value="Ops Director" disabled={!allowedRoles.includes('Ops Director')}>Ops Director {!allowedRoles.includes('Ops Director') ? '(Requires Upgrade)' : ''}</option>
                                        <option value="Site Supervisor" disabled={!allowedRoles.includes('Site Supervisor')}>Site Supervisor {!allowedRoles.includes('Site Supervisor') ? '(Requires Upgrade)' : ''}</option>
                                        <option value="Vendor" disabled={!allowedRoles.includes('Vendor')}>Vendor {!allowedRoles.includes('Vendor') ? '(Requires Enterprise)' : ''}</option>
                                    </select>
                                    {!allowedRoles.includes(roleSelect) && (
                                        <p className="text-xs text-rose-500 mt-2 font-medium">Selected role is not available on the {currentPlan} plan.</p>
                                    )}
                                </div>
                                <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                                    <button 
                                        type="button" 
                                        onClick={() => setIsInviteModalOpen(false)}
                                        className="px-4 py-2 text-slate-500 font-bold text-sm hover:text-slate-700"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        type="submit" 
                                        className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700 transition-colors shadow-sm"
                                    >
                                        Send Invite
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

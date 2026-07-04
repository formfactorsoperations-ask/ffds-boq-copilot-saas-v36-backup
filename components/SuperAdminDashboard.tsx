import React, { useState, useEffect } from 'react';
import { db, auth } from '../services/firebaseClient';
import { collection, getDocs, doc, setDoc, updateDoc } from 'firebase/firestore';
import { BuildingOfficeIcon, UserIcon, ShieldCheckIcon } from './Icons';
import { useOrg } from '../contexts/OrgContext';

export default function SuperAdminDashboard() {
    const { orgData, updateOrgData, currentUserAuth } = useOrg();
    
    const isAuthorized = currentUserAuth?.email === 'formfactors.operations@gmail.com';
    
    const [organizations, setOrganizations] = useState<any[]>([]);
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [newStudioName, setNewStudioName] = useState('');
    const [newAdminEmail, setNewAdminEmail] = useState('');
    const [newTierPlan, setNewTierPlan] = useState('Professional');
    const [newContactPerson, setNewContactPerson] = useState('');
    const [newPhone, setNewPhone] = useState('');
    const [newCity, setNewCity] = useState('');
    
    const [selectedUser, setSelectedUser] = useState<any>(null);
    const [editRole, setEditRole] = useState('');
    const [editTenant, setEditTenant] = useState('');

    const fetchData = async () => {
        setLoading(true);
        try {
            if (db) {
                const orgsSnap = await getDocs(collection(db, 'organizations'));
                const orgsList: any[] = [];
                orgsSnap.forEach(doc => {
                    orgsList.push({ id: doc.id, ...doc.data() });
                });
                setOrganizations(orgsList);

                const usersSnap = await getDocs(collection(db, 'users'));
                const usersList: any[] = [];
                usersSnap.forEach(doc => {
                    usersList.push({ id: doc.id, ...doc.data() });
                });
                setUsers(usersList);
            }
        } catch (e) {
            console.error('Error fetching admin data:', e);
            alert('Failed to fetch data. Ensure you have Super Admin privileges.');
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleCreateStudio = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newStudioName.trim()) return;
        
        try {
            if (db) {
                const newTenantId = 'tenant_' + Math.random().toString(36).substr(2, 9);
                await setDoc(doc(db, 'organizations', newTenantId), {
                    tenantId: newTenantId,
                    orgName: newStudioName,
                    adminEmail: newAdminEmail,
                    tierPlan: newTierPlan,
                    contactPerson: newContactPerson,
                    phone: newPhone,
                    city: newCity,
                    createdAt: new Date().toISOString()
                });
                setNewStudioName('');
                setNewAdminEmail('');
                setNewTierPlan('Professional');
                setNewContactPerson('');
                setNewPhone('');
                setNewCity('');
                fetchData();
            }
        } catch (e) {
            console.error('Error creating studio', e);
            alert('Error creating studio');
        }
    };

    const handleUpdateUser = async () => {
        if (!selectedUser || !db) return;
        try {
            await updateDoc(doc(db, 'users', selectedUser.id), {
                role: editRole,
                tenantId: editTenant
            });
            setSelectedUser(null);
            fetchData();
        } catch (e) {
            console.error('Error updating user', e);
            alert('Error updating user');
        }
    };

    const handleSwitchToStudio = async (org: any) => {
        if (!db || !auth?.currentUser) return;
        try {
            // Because User is Super Admin, we just update local context
            // Optionally we can update their user doc if we want the switch to be sticky
            const newOrg = { ...orgData, tenantId: org.id, orgName: org.orgName };
            updateOrgData(newOrg);
            await updateDoc(doc(db, 'users', auth.currentUser.uid), {
                tenantId: org.id
            });
            
            // Clear local caches to prevent seeing previous workspace's data while cloud sync initializes
            localStorage.removeItem('ffds_project_library');
            localStorage.removeItem('ffds_item_bank');
            localStorage.removeItem('ffds_draft_bank');
            localStorage.removeItem('ffds_templates');
            
            // alert(`Switched to workspace: ${org.orgName || org.id}`);
            // Force a reload to clear cache and navigate to project dashboard
            window.location.reload();
        } catch (e) {
            console.error('Error switching studio', e);
            alert('Error switching studio workspace');
        }
    };

    if (!isAuthorized) {
        return (
            <div className="flex-1 p-8 flex items-center justify-center bg-slate-50">
                <div className="text-center">
                    <ShieldCheckIcon className="w-16 h-16 text-red-500 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-indigo-900 mb-2">Unauthorized Access</h2>
                    <p className="text-slate-500">You must be a Platform Admin to view this page.</p>
                </div>
            </div>
        );
    }
    
    if (loading) {
        return (
            <div className="flex-1 p-8 flex items-center justify-center bg-slate-50">
                <p className="text-slate-500 font-medium">Loading Platform Data...</p>
            </div>
        );
    }

    return (
        <div className="flex-1 bg-slate-50 overflow-y-auto">
            <header className="px-4 sm:px-10 py-6 sm:py-8 bg-white border-b border-slate-200">
                <div className="flex items-center gap-4 text-indigo-600 mb-2">
                    <ShieldCheckIcon className="w-8 h-8" />
                    <h1 className="text-3xl font-bold text-indigo-900 tracking-tight">Platform Super Admin</h1>
                </div>
                <p className="text-slate-500">Manage all SaaS tenants, onboarding, and platform-wide authentication access.</p>
            </header>

            <div className="p-10 max-w-7xl mx-auto space-y-10">
                
                {/* Platform Health Overview */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                        <div className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Total Studios</div>
                        <div className="text-3xl font-black text-indigo-900">{organizations.length}</div>
                        <div className="text-xs font-medium text-emerald-600 mt-2 flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Active & Online
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                        <div className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Total Users</div>
                        <div className="text-3xl font-black text-indigo-900">{users.length}</div>
                        <div className="text-xs font-medium text-emerald-600 mt-2 flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Synced Platform Wide
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                        <div className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Platform Health</div>
                        <div className="text-3xl font-black text-emerald-500">99.9%</div>
                        <div className="text-xs font-medium text-slate-500 mt-2 flex items-center gap-1">
                            Operational | No Incidents
                        </div>
                    </div>
                </div>

                {/* Studios Management */}
                <section>
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold text-indigo-900 flex items-center gap-2">
                            <BuildingOfficeIcon className="w-6 h-6 text-slate-400" />
                            Registered Studios (Organizations)
                        </h2>
                        {orgData.tenantId !== 'demo-tenant-01' && (
                            <button 
                                onClick={() => handleSwitchToStudio({ id: 'demo-tenant-01', orgName: 'Main Platform Workspace' })}
                                className="px-4 py-2 bg-indigo-900 text-white font-bold rounded-xl text-sm hover:bg-indigo-800 transition"
                            >
                                Return to Main Platform
                            </button>
                        )}
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 mb-6 font-sans overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                            <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wider">Onboard New Studio</h3>
                            <p className="text-xs text-slate-500 mt-1">Provision a new dedicated tenant workspace for a client studio.</p>
                        </div>
                        <div className="p-6">
                            <form onSubmit={handleCreateStudio} className="space-y-5">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Studio Name</label>
                                        <input 
                                            type="text"
                                            required
                                            placeholder="e.g., Apex Design Consultants"
                                            value={newStudioName}
                                            onChange={(e) => setNewStudioName(e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">SaaS Plan Tier</label>
                                        <select 
                                            value={newTierPlan}
                                            onChange={(e) => setNewTierPlan(e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        >
                                            <option value="Free">Free / Trial</option>
                                            <option value="Professional">Professional (Standard)</option>
                                            <option value="Enterprise">Enterprise (Custom)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Primary Admin / Owner Email</label>
                                        <input 
                                            type="email"
                                            required
                                            placeholder="admin@studio.com"
                                            value={newAdminEmail}
                                            onChange={(e) => setNewAdminEmail(e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Primary Contact Person</label>
                                        <input 
                                            type="text"
                                            placeholder="e.g., Rahul Sharma"
                                            value={newContactPerson}
                                            onChange={(e) => setNewContactPerson(e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Phone Number</label>
                                        <input 
                                            type="tel"
                                            placeholder="e.g., +91 98765 43210"
                                            value={newPhone}
                                            onChange={(e) => setNewPhone(e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Base City / Region</label>
                                        <input 
                                            type="text"
                                            placeholder="e.g., Bangalore, KA"
                                            value={newCity}
                                            onChange={(e) => setNewCity(e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end pt-4 border-t border-slate-100">
                                    <button 
                                        type="submit"
                                        className="bg-indigo-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-indigo-800 transition shadow-sm hover:shadow-md flex items-center gap-2"
                                    >
                                        <BuildingOfficeIcon className="w-5 h-5"/>
                                        Provision Studio Workspace
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {organizations.map(org => (
                            <div key={org.id} className={`bg-white p-6 rounded-2xl shadow-sm border ${orgData.tenantId === org.id ? 'border-indigo-400 bg-indigo-50/20' : 'border-slate-200'} flex flex-col justify-between`}>
                                <div>
                                    <h3 className="font-bold text-indigo-900 mb-1 flex items-center justify-between">
                                        {org.orgName || 'Unnamed Studio'}
                                        {orgData.tenantId === org.id && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full uppercase tracking-wider">Active</span>}
                                    </h3>
                                    <div className="text-xs font-mono text-slate-500 mb-4 bg-slate-50 px-2 py-1 rounded inline-block">
                                        {org.id}
                                    </div>
                                    <div className="text-sm text-slate-600 space-y-1">
                                        <p className="flex justify-between"><span className="text-slate-400">Admin Email:</span> <span className="font-medium text-indigo-900 break-all">{org.adminEmail || 'N/A'}</span></p>
                                        <p className="flex justify-between"><span className="text-slate-400">Plan:</span> <span className="font-medium text-indigo-900">{org.tierPlan || 'Standard'}</span></p>
                                        <p className="flex justify-between"><span className="text-slate-400">Contact:</span> <span className="font-medium text-indigo-900">{org.contactPerson || 'N/A'}</span></p>
                                        <p className="flex justify-between"><span className="text-slate-400">Phone:</span> <span className="font-medium text-indigo-900">{org.phone || 'N/A'}</span></p>
                                        <p className="flex justify-between"><span className="text-slate-400">City:</span> <span className="font-medium text-indigo-900">{org.city || org.cityState || 'N/A'}</span></p>
                                    </div>
                                </div>
                                <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end">
                                    <button 
                                        onClick={() => handleSwitchToStudio(org)}
                                        disabled={orgData.tenantId === org.id}
                                        className={`px-4 py-2 text-sm font-bold rounded-xl transition ${
                                            orgData.tenantId === org.id 
                                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                                                : 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100 hover:text-indigo-800'
                                        }`}
                                    >
                                        {orgData.tenantId === org.id ? 'Current Workspace' : 'Login to Workspace'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <hr className="border-slate-200" />

                {/* Users Management */}
                <section>
                    <h2 className="text-xl font-bold text-indigo-900 flex items-center gap-2 mb-6">
                        <UserIcon className="w-6 h-6 text-slate-400" />
                        Platform Users Access Control
                    </h2>

                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <table className="w-full text-left text-sm text-slate-600 border-collapse">
                            <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-xs border-b border-slate-200">
                                <tr>
                                    <th className="p-4">Email</th>
                                    <th className="p-4">Tenant ID</th>
                                    <th className="p-4">Role</th>
                                    <th className="p-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map(user => (
                                    <tr key={user.id} className="border-b border-slate-100 hover:bg-slate-50">
                                        <td className="p-4 font-medium text-indigo-900">{user.email}</td>
                                        <td className="p-4 font-mono text-xs">{user.tenantId || 'demo-tenant-01'}</td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                                user.role === 'Super Admin' ? 'bg-purple-100 text-purple-700' :
                                                user.role === 'Admin' ? 'bg-blue-100 text-blue-700' :
                                                'bg-slate-100 text-slate-600'
                                            }`}>
                                                {user.role || 'Admin'}
                                            </span>
                                        </td>
                                        <td className="p-4 text-right">
                                            <button 
                                                onClick={() => {
                                                    setSelectedUser(user);
                                                    setEditRole(user.role || 'Admin');
                                                    setEditTenant(user.tenantId || 'demo-tenant-01');
                                                }}
                                                className="text-indigo-600 font-medium hover:text-indigo-800 text-sm"
                                            >
                                                Edit Access
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>

            {/* Edit User Modal */}
            {selectedUser && (
                <div className="fixed inset-0 bg-indigo-950/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
                        <div className="p-6 border-b border-slate-100">
                            <h3 className="font-bold text-lg text-indigo-900">Edit User Access</h3>
                            <p className="text-sm text-slate-500">{selectedUser.email}</p>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Assign to Tenant (Studio ID)</label>
                                <select 
                                    value={editTenant}
                                    onChange={(e) => setEditTenant(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                                >
                                    <option value="demo-tenant-01">demo-tenant-01 (Main FFDS)</option>
                                    {organizations.map(org => (
                                        <option key={org.id} value={org.id}>{org.id} ({org.orgName})</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Platform Role</label>
                                <select 
                                    value={editRole}
                                    onChange={(e) => setEditRole(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="Admin">Studio Admin</option>
                                    <option value="Ops Director">Ops Director</option>
                                    <option value="Site Supervisor">Site Supervisor</option>
                                    <option value="Super Admin">Platform Super Admin</option>
                                </select>
                            </div>
                        </div>
                        <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                            <button 
                                onClick={() => setSelectedUser(null)}
                                className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-200 rounded-xl transition"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleUpdateUser}
                                className="px-5 py-2.5 bg-indigo-600 text-white font-bold hover:bg-indigo-700 rounded-xl transition"
                            >
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { OrganizationContext, TeamMember, UserRole } from '../types';
import { auth, db } from '../services/firebaseClient';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { setStudioEmailBrand } from '../services/emailService';
import { rolesOf } from '../lib/roles';

interface OrgContextType {
    orgData: OrganizationContext;
    updateOrgData: (newData: Partial<OrganizationContext>) => void;
    teamMembers: TeamMember[];
    addTeamMember: (member: TeamMember) => void;
    removeTeamMember: (id: string) => void;
    /** The most senior of the signed-in person's roles. */
    currentRole: UserRole;
    /** All of their roles (lib/roles); most senior first, so `currentRoles[0]` is `currentRole`. */
    currentRoles: string[];
    /** Sets the role, and with `roles` every role they hold; without it, that one role alone. */
    setCurrentRole: (role: UserRole, roles?: string[]) => void;
    currentUserAuth: any; // Expose current user auth
}

const defaultOrg: OrganizationContext = {
    tenantId: 'demo-tenant-01',
    orgName: 'Interior Execution OS',
    contactEmail: 'hello@interiorops.com',
    officeAddress: '123 Business Avenue',
    cityState: 'Mumbai, Maharashtra',
    contactPhone: '+91 9999999999',
    designFeePercentage: 10,
    defaultGstRate: 18,
    themeColor: '#2563EB',
    defaultContractWordings: {
        forceMajeureText: 'Neither party shall be liable for any failure or delay in performance under this Agreement due to causes beyond its reasonable control, including but not limited to acts of God, war, strikes, or governmental orders.',
        revisionsText: 'Our standard terms include up to two major revisions per design phase without incurring additional costs.',
        paymentTermsText: 'Payments are to be made according to the agreed schedule. Work continues upon realization of funds.',
        clientObsText: 'The Client is responsible for providing timely feedback, approvals, and access to the site as required.'
    },
    defaultPaymentSchedules: [
        { title: 'Booking Amount', percentage: 10 },
        { title: 'Design Approval', percentage: 40 },
        { title: 'Material Procurement', percentage: 40 },
        { title: 'Handover', percentage: 10 },
    ],
    procurementLeadTimeWeeks: 4,
    isSetupComplete: true // Demo tenant is complete
};

const defaultTeam: TeamMember[] = [
    { id: '1', name: 'Rishabh Shetty', email: 'rishabh@ffds.in', role: 'Admin', status: 'Active' },
    { id: '2', name: 'Alia Bhatt', email: 'alia@ffds.in', role: 'Ops Director', status: 'Active' },
    { id: '3', name: 'Suresh Kumar', email: 'suresh.site@ffds.in', role: 'Site Supervisor', status: 'Pending' },
];

const OrgContext = createContext<OrgContextType | undefined>(undefined);

export function OrgProvider({ children }: { children: ReactNode }) {
    const [currentUserAuth, setCurrentUserAuth] = useState<any>(null);

    const [orgData, setOrgData] = useState<OrganizationContext>(() => {
        const saved = localStorage.getItem('ffds_org_context');
        return saved ? JSON.parse(saved) : defaultOrg;
    });

    /* Every email signs off with the studio's real details and logo (services/emailService). */
    useEffect(() => { setStudioEmailBrand(orgData); }, [orgData]);

    useEffect(() => {
        if (!auth) return;
        const unsubscribe = auth.onAuthStateChanged(async (user: any) => {
            setCurrentUserAuth(user);
            if (user && db) {
                try {
                    // Try to fetch organization profile using user id
                    const userDoc = await getDoc(doc(db, "users", user.uid));
                    if (userDoc.exists()) {
                        const data = userDoc.data();
                        /*
                          A client does not read the studio record: it carries the
                          studio's team list (names, emails, roles) and which
                          designer works on which project. Their portal copy
                          carries the studio's name, logo and contact details, so
                          the header and letterhead come from there.
                        */
                        if (data.role === 'Client') {
                            const pid = Array.isArray(data.projectIds) ? data.projectIds[0] : null;
                            const view = pid ? await getDoc(doc(db, "projects", pid, "portalView", "current")) : null;
                            const s: any = view?.exists() ? (view.data() as any)?.context?.portalStudio || {} : {};
                            setOrgData(prev => ({
                                ...prev,
                                tenantId: data.tenantId,
                                orgName: s.name || prev.orgName,
                                orgLogo: s.logoUrl || (prev as any).orgLogo,
                                contactPhone: s.phone, contactEmail: s.email, officeAddress: s.address,
                                cityState: s.cityState, gstin: s.gstin, legalName: s.legalName,
                                signatoryName: s.signatoryName, signatoryTitle: s.signatoryTitle,
                                tagline: s.tagline, about: s.about, themeColor: s.themeColor,
                                team: [],
                            } as any));
                            setTeamMembers([]);
                        } else if (data.tenantId) {
                            // If we have a tenant ID in the user doc, fetch the org document
                            const orgDoc = await getDoc(doc(db, "organizations", data.tenantId));
                            if (orgDoc.exists()) {
                                const fetchedOrg = orgDoc.data() as OrganizationContext;
                                setOrgData(prev => {
                                    const merged = { ...prev, ...fetchedOrg };
                                    localStorage.setItem('ffds_org_context', JSON.stringify(merged));
                                    return merged;
                                });
                                // Fetch team from org doc if it exists
                                if (fetchedOrg.team) {
                                    setTeamMembers(fetchedOrg.team);
                                }
                            } else {
                                // Just update the tenantId if org profile doesn't exist yet but user has tenantId
                                setOrgData(prev => {
                                    const merged = { ...prev, tenantId: data.tenantId, isSetupComplete: false, orgName: '' };
                                    localStorage.setItem('ffds_org_context', JSON.stringify(merged));
                                    return merged;
                                });
                            }
                        }
                    }
                } catch(e: any) {
                    if (e.message && e.message.includes('offline')) {
                        console.warn("User tenant context offline. Using local defaults.");
                    } else if (e.code === 'permission-denied' || e.message?.includes('Missing or insufficient permissions')) {
                         console.warn("User tenant context permission denied. Using local defaults.");
                    } else {
                        console.error("Error fetching user tenant context", e);
                    }
                }
            }
        });
        return () => unsubscribe();
    }, []);

    const [teamMembers, setTeamMembers] = useState<TeamMember[]>(() => {
        const saved = localStorage.getItem('ffds_team_members');
        return saved ? JSON.parse(saved) : defaultTeam;
    });

    const [currentRole, setCurrentRole] = useState<UserRole>(() => {
        const saved = localStorage.getItem('ffds_current_role');
        return (saved as UserRole) || 'Admin';
    });

    const updateOrgData = async (newData: Partial<OrganizationContext>) => {
        setOrgData(prev => {
            const updated = { ...prev, ...newData };
            localStorage.setItem('ffds_org_context', JSON.stringify(updated));
            return updated;
        });

        // Prevent saving to firestore if we are just switching the local tenant context
        const isContextSwitch = newData.tenantId && newData.tenantId !== orgData.tenantId;

        if (!isContextSwitch && db && orgData?.tenantId) {
            try {
                await updateDoc(doc(db, "organizations", orgData.tenantId), newData);
            } catch (e: any) {
                if (e.code === 'not-found') {
                    await setDoc(doc(db, "organizations", orgData.tenantId), { ...orgData, ...newData }, { merge: true });
                } else {
                    console.error("Could not sync orgData to firestore", e);
                }
            }
        }
    };

    const addTeamMember = async (member: TeamMember) => {
        setTeamMembers(prev => {
            const updated = [...prev, member];
            localStorage.setItem('ffds_team_members', JSON.stringify(updated));
            if (db && orgData?.tenantId) {
                updateDoc(doc(db, "organizations", orgData.tenantId), { team: updated }).catch(e => console.error("Could not sync team", e));
            }
            return updated;
        });
    };

    const removeTeamMember = async (id: string) => {
        setTeamMembers(prev => {
            const updated = prev.filter(m => m.id !== id);
            localStorage.setItem('ffds_team_members', JSON.stringify(updated));
            if (db && orgData?.tenantId) {
                updateDoc(doc(db, "organizations", orgData.tenantId), { team: updated }).catch(e => console.error("Could not sync team", e));
            }
            return updated;
        });
    };

    const [currentRoles, setCurrentRoles] = useState<string[]>(() => {
        try {
            const saved = JSON.parse(localStorage.getItem('ffds_current_roles') || 'null');
            if (Array.isArray(saved) && saved.length) return rolesOf(saved);
        } catch { /* storage off or garbled */ }
        return rolesOf(localStorage.getItem('ffds_current_role') || 'Admin');
    });

    const handleSetCurrentRole = (role: UserRole, roles?: string[]) => {
        const all = rolesOf([role, ...(roles || [])]);
        setCurrentRole(role);
        setCurrentRoles(all);
        localStorage.setItem('ffds_current_role', role);
        localStorage.setItem('ffds_current_roles', JSON.stringify(all));
    };

    return (
        <OrgContext.Provider value={{ 
            orgData, updateOrgData, 
            teamMembers, addTeamMember, removeTeamMember,
            currentRole, currentRoles, setCurrentRole: handleSetCurrentRole,
            currentUserAuth
        }}>
            {children}
        </OrgContext.Provider>
    );
}

export function useOrg() {
    const context = useContext(OrgContext);
    if (context === undefined) {
        throw new Error('useOrg must be used within an OrgProvider');
    }
    return context;
}
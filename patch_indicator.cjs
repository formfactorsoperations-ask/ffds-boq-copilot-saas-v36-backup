const fs = require('fs');
let content = fs.readFileSync('components/PaymentGatesTab.tsx', 'utf8');

content = content.replace(
    "const [loading, setLoading] = useState(true);",
    "const [loading, setLoading] = useState(true);\n    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');\n\n    const showSaveSuccess = () => {\n        setSaveStatus('saved');\n        setTimeout(() => setSaveStatus('idle'), 3000);\n    };"
);

content = content.replace(
    "const handleInitialize = async () => {\n        if (!initValue || typeof initValue !== 'number' || initValue <= 0) {\n            alert('Please enter a valid project value.');\n            return;\n        }\n\n        const batch = writeBatch(db);",
    "const handleInitialize = async () => {\n        if (!initValue || typeof initValue !== 'number' || initValue <= 0) {\n            alert('Please enter a valid project value.');\n            return;\n        }\n\n        setSaveStatus('saving');\n        const batch = writeBatch(db);"
);

content = content.replace(
    "await batch.commit();\n        setShowInitMenu(false);\n    };",
    "await batch.commit();\n        setShowInitMenu(false);\n        showSaveSuccess();\n    };"
);

content = content.replace(
    "const markInvoiceRaised = async (gateId: string) => {\n        const ref = doc(db, `organizations/${studioId}/projects/${projectId}/paymentGates`, gateId);\n        await updateDoc(ref, {\n            status: 'invoice_raised',\n            invoice_raised_date: new Date().toISOString()\n        });\n    };",
    "const markInvoiceRaised = async (gateId: string) => {\n        setSaveStatus('saving');\n        const ref = doc(db, `organizations/${studioId}/projects/${projectId}/paymentGates`, gateId);\n        await updateDoc(ref, {\n            status: 'invoice_raised',\n            invoice_raised_date: new Date().toISOString()\n        });\n        showSaveSuccess();\n    };"
);

content = content.replace(
    "const markPaid = async (gateId: string) => {\n        const ref = doc(db, `organizations/${studioId}/projects/${projectId}/paymentGates`, gateId);\n        await updateDoc(ref, {\n            status: 'paid',\n            paid_date: new Date().toISOString()\n        });\n    };",
    "const markPaid = async (gateId: string) => {\n        setSaveStatus('saving');\n        const ref = doc(db, `organizations/${studioId}/projects/${projectId}/paymentGates`, gateId);\n        await updateDoc(ref, {\n            status: 'paid',\n            paid_date: new Date().toISOString()\n        });\n        showSaveSuccess();\n    };"
);

content = content.replace(
    "<div>\n                    <h2 className=\"text-xl font-bold text-slate-900\">Payment Gates</h2>\n                    <p className=\"text-sm text-slate-500 mt-1\">Manage structured payment stages and track invoice aging.</p>\n                </div>",
    "<div className=\"flex items-center gap-4\">\n                    <div>\n                        <h2 className=\"text-xl font-bold text-slate-900\">Payment Gates</h2>\n                        <p className=\"text-sm text-slate-500 mt-1\">Manage structured payment stages and track invoice aging.</p>\n                    </div>\n                    \n                    {saveStatus === 'saving' && (\n                        <span className=\"text-xs text-slate-400 flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-md\">\n                            <div className=\"w-3 h-3 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin\"></div>\n                            Saving...\n                        </span>\n                    )}\n                    {saveStatus === 'saved' && (\n                        <span className=\"text-xs text-emerald-600 flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded-md transition-all duration-300\">\n                            <CheckCircle size={12} />\n                            All changes saved\n                        </span>\n                    )}\n                </div>"
);

fs.writeFileSync('components/PaymentGatesTab.tsx', content);
console.log('patched');

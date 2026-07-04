const fs = require('fs');

// Patch App.tsx
let appContent = fs.readFileSync('App.tsx', 'utf8');

if (!appContent.includes("import PaymentGatesTab")) {
    appContent = appContent.replace(
        'import PaymentCalculatorTab from "./components/PaymentCalculatorTab";',
        'import PaymentCalculatorTab from "./components/PaymentCalculatorTab";\nimport PaymentGatesTab from "./components/PaymentGatesTab";'
    );
}

if (!appContent.includes('activeTab === "payment-gates"')) {
    appContent = appContent.replace(
        '{activeTab === "payment-calc" && (',
        `{activeTab === "payment-gates" && (
                        <PaymentGatesTab
                          projectId={activeInternalId!}
                          studioId={orgData?.tenantId || "demo-tenant-01"}
                          projectContext={projectContext}
                        />
                      )}
                      {activeTab === "payment-calc" && (`
    );
}

fs.writeFileSync('App.tsx', appContent);

// Patch Header.tsx
let headerContent = fs.readFileSync('components/Header.tsx', 'utf8');

if (!headerContent.includes("id: 'payment-gates'")) {
    headerContent = headerContent.replace(
        "{ id: 'timeline', label: 'Timeline'",
        "{ id: 'payment-gates', label: 'Payment Gates', icon: <span className=\"text-lg grayscale-0 filter hover:brightness-110 transition-all\">💳</span>, group: 'Execution', roles: ['Admin', 'Ops Director'] },\n  { id: 'timeline', label: 'Timeline'"
    );
}

fs.writeFileSync('components/Header.tsx', headerContent);
console.log('Patched App.tsx and Header.tsx successfully.');

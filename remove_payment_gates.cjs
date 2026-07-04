const fs = require('fs');

// Patch App.tsx
let appContent = fs.readFileSync('App.tsx', 'utf8');

// Remove import
appContent = appContent.replace('import PaymentGatesTab from "./components/PaymentGatesTab";\n', '');
appContent = appContent.replace('import PaymentGatesTab from "./components/PaymentGatesTab";', '');

// Remove route/tab
const toRemoveApp = `{activeTab === "payment-gates" && (
                        <PaymentGatesTab
                          projectId={activeInternalId!}
                          studioId={orgData?.tenantId || "demo-tenant-01"}
                          projectContext={projectContext}
                        />
                      )}`;
appContent = appContent.replace(toRemoveApp, "");
appContent = appContent.replace(/\{activeTab === "payment-gates" && \(\s*<PaymentGatesTab[\s\S]*?\/>\s*\)\}/, "");

fs.writeFileSync('App.tsx', appContent);

// Patch Header.tsx
let headerContent = fs.readFileSync('components/Header.tsx', 'utf8');

const toRemoveHeader = `{ id: 'payment-gates', label: 'Payment Gates', icon: <span className="text-lg grayscale-0 filter hover:brightness-110 transition-all">💳</span>, group: 'Execution', roles: ['Admin', 'Ops Director'] },\n  `;

headerContent = headerContent.replace(toRemoveHeader, "");
fs.writeFileSync('components/Header.tsx', headerContent);

// Delete file
if (fs.existsSync('components/PaymentGatesTab.tsx')) {
    fs.unlinkSync('components/PaymentGatesTab.tsx');
}

console.log('Removed Payment Gates.');

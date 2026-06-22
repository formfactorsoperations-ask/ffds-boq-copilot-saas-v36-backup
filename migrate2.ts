import fs from 'fs';

let text = fs.readFileSync('components/Dashboard.tsx', 'utf-8');

text = text.replace(
    'const LiveMarquee = ({ items, onNavigate }: { items: any[], onNavigate: (route: string) => void }) => {',
    'const LiveMarquee = ({ items, onNavigate, dark }: { items: any[], onNavigate: (route: string) => void, dark?: boolean }) => {'
);


// Replace health accesses
text = text.replace(/health\.collected/g, 'health.actualReceived');
text = text.replace(/health\.designFee/g, '(health.actualReceived * 0.2)');
text = text.replace(/health\.unbilledAmount/g, 'Math.max(0, displayContractValue - (health.actualReceived || 0) - (health.outstandingAmount || 0))');
text = text.replace(/health\.isHealthy/g, '(health.healthStatus === "green" || health.healthStatus === "fully_paid" || health.healthStatus === "neutral" || health.healthStatus === "unconfigured")');

fs.writeFileSync('components/Dashboard.tsx', text);

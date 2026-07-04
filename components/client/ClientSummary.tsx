import React from 'react';
import { ProjectContext } from '../../types';

interface ClientSummaryProps {
  projectContext: ProjectContext;
}

const DetailItem: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div>
    <p className="text-sm text-slate-500">{label}</p>
    <p className="font-bold text-indigo-900 text-base">{value}</p>
  </div>
);

const ClientSummary: React.FC<ClientSummaryProps> = ({ projectContext }) => {
  return (
    <div className="space-y-4">
      <DetailItem label="Project" value={`${projectContext.config} - ${projectContext.location}`} />
      <DetailItem label="Client Name" value={projectContext.name} />
      <DetailItem label="Project Location" value={projectContext.location} />
      <DetailItem label="Date" value={new Date().toLocaleDateString('en-GB')} />
    </div>
  );
};

export default ClientSummary;
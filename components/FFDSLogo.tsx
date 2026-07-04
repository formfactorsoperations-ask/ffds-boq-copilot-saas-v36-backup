
import React from 'react';
import { useOrg } from '../contexts/OrgContext';

// Handles rendering the custom logo if available, or the text fallback.
// This ensures seamless integration everywhere.

export const FFDSLogo: React.FC<{ className?: string, mode?: 'full' | 'icon', customLogo?: string }> = ({ className, mode = 'full', customLogo }) => {
  const { orgData } = useOrg();
  
  if (customLogo) {
      if (mode === 'icon') {
          return (
            <div className={`overflow-hidden rounded-lg ${className} flex items-center justify-center`}>
                <img src={customLogo} alt="Logo" className="w-full h-full object-cover" />
            </div>
          );
      }
      return <img src={customLogo} alt="Organization Logo" className={`object-contain max-h-20 ${className}`} />;
  }

  const initial = orgData.orgName.charAt(0).toUpperCase();
  const nameParts = orgData.orgName.split(' ');
  const mainName = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ').toUpperCase() : orgData.orgName.toUpperCase();
  const subName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : 'OS';

  // Fallback: Elegant Text
  if (mode === 'icon') {
      return (
        <div className={`w-10 h-10 bg-gradient-to-br from-indigo-600 to-slate-900 text-white flex items-center justify-center font-extrabold text-xl rounded-xl shadow-lg ${className}`}>
            {initial}
        </div>
      )
  }

  return (
    <div className={`flex flex-col justify-center ${className}`}>
        <h1 className="font-extrabold text-2xl tracking-tight text-indigo-950 leading-none">{mainName}</h1>
        <p className="text-[10px] font-bold tracking-[0.3em] text-indigo-600 uppercase mt-1">{subName}</p>
    </div>
  );
};

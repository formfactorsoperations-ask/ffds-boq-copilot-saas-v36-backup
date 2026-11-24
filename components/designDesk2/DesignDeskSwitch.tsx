import React, { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { useOrg } from '../../contexts/OrgContext';
import DesignDeskTab from '../drawingReview/DesignDeskTab';

/*
  WHICH DESIGN DESK the studio sees on the Design Desk tab.

  Today's desk (components/drawingReview) stays the default. The studio is
  moved to Design Desk 2.0, and back, in Studio settings > Data & integrations
  (components/studio/DesignDeskSetting), by the roles that can edit Studio
  settings. Nothing on the desk itself changes it, so nobody at work on a
  drawing sees two desks or a switch. The choice is one field on the studio's
  record (designDesk); both desks read the same drawings, so nothing is moved
  or converted either way.
*/

const DeskTwo = React.lazy(() => import('./DeskTwo'));

interface Props {
  projects: any[];
  activeProjectId?: string | null;
}

export default function DesignDeskSwitch(props: Props) {
  const { orgData } = useOrg();
  if (orgData?.designDesk === 'new') {
    return (
      <Suspense fallback={<div className="grid min-h-[40vh] place-items-center text-slate-400"><Loader2 className="animate-spin" aria-label="Loading" /></div>}>
        <DeskTwo {...props} />
      </Suspense>
    );
  }
  return <DesignDeskTab {...props} />;
}

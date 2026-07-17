const fs = require('fs');
let content = fs.readFileSync('/app/applet/components/WeeklyProgressReportTab.tsx', 'utf-8');

const searchState = `            roomProgress: prevPulse?.roomProgress ? { ...prevPulse.roomProgress } : {},
            sectionVisibility: {`;
const replaceState = `            roomProgress: prevPulse?.roomProgress ? { ...prevPulse.roomProgress } : {},
            revisions: prevPulse?.revisions ? [...prevPulse.revisions] : [],
            selections: prevPulse?.selections ? [...prevPulse.selections] : [],
            sectionVisibility: {`;

content = content.replace(searchState, replaceState);

fs.writeFileSync('/app/applet/components/WeeklyProgressReportTab.tsx', content);

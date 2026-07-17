const fs = require('fs');
let content = fs.readFileSync('/app/applet/components/WeeklyProgressReportTab.tsx', 'utf-8');

const search = `    let currentPulse = pulseReports.find(p => p.weekNumber === selectedWeek);
    if (!currentPulse) {
        currentPulse = {
            id: \`pulse-wk\${selectedWeek}\`,
            weekNumber: selectedWeek,
            startDate: activeWeekRange.start.toISOString(),
            endDate: activeWeekRange.end.toISOString(),
            executiveBriefing: '',
            sectionVisibility: {
                weekAtGlance: true,
                governance: true,
                designProgress: true,
                revisions: true,
                financials: true,
                siteProgress: true,
                selections: false
            },
            studioNotes: {},
            manualActions: []
        };
    }`;

const replace = `    let currentPulse = pulseReports.find(p => p.weekNumber === selectedWeek);
    if (!currentPulse) {
        const prevPulse = pulseReports.find(p => p.weekNumber === selectedWeek - 1);
        currentPulse = {
            id: \`pulse-wk\${selectedWeek}\`,
            weekNumber: selectedWeek,
            startDate: activeWeekRange.start.toISOString(),
            endDate: activeWeekRange.end.toISOString(),
            executiveBriefing: '',
            roomProgress: prevPulse?.roomProgress ? { ...prevPulse.roomProgress } : {},
            sectionVisibility: {
                weekAtGlance: true,
                governance: true,
                designProgress: true,
                revisions: true,
                financials: true,
                siteProgress: true,
                selections: false
            },
            studioNotes: {},
            manualActions: []
        };
    }`;

content = content.replace(search, replace);
fs.writeFileSync('/app/applet/components/WeeklyProgressReportTab.tsx', content);

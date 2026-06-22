const fs = require('fs');

let content = fs.readFileSync('components/StudioDashboard.tsx', 'utf8');

// remove imports
content = content.replace(/import BoqHealthCheckDrawer.*?\n/, '');
content = content.replace(/import BookingPackModal.*?\n/, '');
content = content.replace(/import BookingPackDrawer.*?\n/, '');
content = content.replace(/import CompareVersionsModal.*?\n/, '');

// remove state vars
content = content.replace(/.*exportIncludeMargin.*\n/, '');
content = content.replace(/.*isBookingPackModalOpen.*\n/, '');
content = content.replace(/.*isBookingPackDrawerOpen.*\n/, '');
content = content.replace(/.*isHealthCheckOpen.*\n/, '');
content = content.replace(/.*showCompareModal.*\n/, '');
content = content.replace(/.*selectedVersionsToCompare.*\n/, '');

// The toggleLens feature
content = content.replace(/.*toggleLens.*\n.*setLensEnabled.*\n.*setAuditData.*\n.*\};\n/, '');

fs.writeFileSync('components/StudioDashboard.tsx', content);

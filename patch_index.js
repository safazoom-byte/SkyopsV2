const fs = require('fs');
let code = fs.readFileSync('index.tsx', 'utf8');

// 1. Import ReportsDisplay
if (!code.includes('ReportsDisplay')) {
  code = code.replace(
    'import { StationStatistics } from "./components/StationStatistics";',
    'import { StationStatistics } from "./components/StationStatistics";\nimport { ReportsDisplay } from "./components/ReportsDisplay";'
  );
}

// 2. Update activeTab state
code = code.replace(
  /\| "program"/g,
  '| "program"\n    | "reports"'
);

// 3. Desktop nav
code = code.replace(
  /"program",\n              "statistics",/g,
  '"program",\n              "reports",\n              "statistics",'
);

// 4. Mobile nav
code = code.replace(
  /{ id: "program", icon: CalendarDays, label: "Roster" },/g,
  '{ id: "program", icon: CalendarDays, label: "Roster" },\n          { id: "reports", icon: PieChart, label: "Reports" },'
);

// We need an icon for Reports, let's use FileText or ClipboardList, but they might not be imported. 
// We can use PieChart for stats, and maybe LayoutDashboard or another one for Reports.
// Or we can just import FileText from lucide-react if it's not there.

fs.writeFileSync('index.tsx', code);

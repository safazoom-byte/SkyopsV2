import re

with open("components/ProgramDisplay.tsx", "r") as f:
    code = f.read()

# Replace `offStaff`
code = re.sub(
    r'const offStaff = activeStaff\.filter\(\(s\) => !workingIds\.has\(s\.id\)\);',
    r'const offStaff = activeStaff.filter((s) => !workingIds.has(s.id) && isStaffActiveOnDate(s, prog.dateString!));',
    code
)
code = re.sub(
    r'const offStaff = activeStaff\.filter\(s => !workingIds\.has\(s\.id\)\);',
    r'const offStaff = activeStaff.filter(s => !workingIds.has(s.id) && isStaffActiveOnDate(s, prog.dateString!));',
    code
)

# For the weekly audit `localStaff` and `rosterStaff`
# In `generatePDF` (around 850)
code = re.sub(
    r'const localStaff = activeStaff\.filter\(\(s\) => s\.type === "Local"\);',
    r'const localStaff = activeStaff.filter((s) => s.type === "Local" && isStaffActiveInPeriod(s, activePrograms));',
    code
)
code = re.sub(
    r'const rosterStaff = activeStaff\.filter\(\(s\) => s\.type === "Roster"\);',
    r'const rosterStaff = activeStaff.filter((s) => s.type === "Roster" && isStaffActiveInPeriod(s, activePrograms));',
    code
)

# For `sortedMatrixStaff`
code = re.sub(
    r'const sortedMatrixStaff = \[\.\.\.activeStaff\]',
    r'const sortedMatrixStaff = [...activeStaff].filter(s => isStaffActiveInPeriod(s, activePrograms))',
    code
)

code = re.sub(
    r'const sortedMatrixStaffPdf = \[\.\.\.staff\]',
    r'const sortedMatrixStaffPdf = [...staff].filter(s => s.isActive !== false && isStaffActiveInPeriod(s, activePrograms))',
    code
)

# Replace `isStaffActiveOnDate` import
code = re.sub(
    r'isStaffActiveOnDate,',
    r'isStaffActiveOnDate, isStaffActiveInPeriod,',
    code
)

with open("components/ProgramDisplay.tsx", "w") as f:
    f.write(code)


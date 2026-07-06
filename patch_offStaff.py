import re
with open("components/ProgramDisplay.tsx", "r") as f:
    code = f.read()

# Replace `activeStaff.filter((s) => !workingIds.has(s.id))`
# with `activeStaff.filter((s) => !workingIds.has(s.id) && isStaffActiveOnDate(s, prog.dateString || dateStr || p.dateString!))`
# Wait, we need to know the variable name for date in each context.

import re

with open("components/ProgramDisplay.tsx", "r") as f:
    content = f.read()

old_ref = """                  const refWorkingIds = new Set(
                    refProg.assignments.map((a) => a.staffId),
                  );
                  const refOffStaff = activeStaff.filter(
                    (s) => !refWorkingIds.has(s.id),
                  );"""

new_ref = """                  const refWorkingIds = new Set(
                    refProg.assignments.map((a) => a.staffId),
                  );
                  const refOffStaff = activeStaff.filter(
                    (s) => !refWorkingIds.has(s.id) && isStaffActiveOnDate(s, refProg.dateString!),
                  );"""

content = content.replace(old_ref, new_ref)

with open("components/ProgramDisplay.tsx", "w") as f:
    f.write(content)

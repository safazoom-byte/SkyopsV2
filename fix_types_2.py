import re
with open("types.ts", "r") as f:
    code = f.read()

func_code = """
export const isStaffActiveInPeriod = (staff: Staff, programs: DailyProgram[]): boolean => {
  if (programs.length === 0) return staff.isActive !== false;
  return programs.some(p => isStaffActiveOnDate(staff, p.dateString!));
};
"""

if "export const isStaffActiveInPeriod" not in code:
    code = code + "\n" + func_code
    with open("types.ts", "w") as f:
        f.write(code)

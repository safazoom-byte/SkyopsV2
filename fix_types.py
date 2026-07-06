import re
with open("types.ts", "r") as f:
    code = f.read()

func_code = """
export const isStaffActiveOnDate = (staff: Staff, dateString: string): boolean => {
  if (staff.isActive === false) return false;
  if (staff.workFromDate && dateString < staff.workFromDate) return false;
  if (staff.workToDate && dateString > staff.workToDate) return false;
  return true;
};
"""

if "export const isStaffActiveOnDate" not in code:
    code = code + "\n" + func_code
    with open("types.ts", "w") as f:
        f.write(code)

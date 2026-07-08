import re

with open("types.ts", "r") as f:
    content = f.read()

old_func = """export const isStaffActiveOnDate = (staff: Staff, dateString: string): boolean => {
  if (staff.isActive === false) return false;
  if (staff.type !== "Roster") {
    if (staff.workFromDate && dateString < staff.workFromDate) return false;
    if (staff.workToDate && dateString > staff.workToDate) return false;
  }
  return true;
};"""

new_func = """export const isStaffActiveOnDate = (staff: Staff, dateString: string): boolean => {
  if (staff.isActive === false) return false;
  
  // Deactivation date overrides everything
  if (staff.workToDate && dateString > staff.workToDate) return false;
  
  if (staff.type === "Roster") {
    // If they have roster periods, they are active only during those periods
    if (staff.rosterPeriods && staff.rosterPeriods.length > 0) {
      return staff.rosterPeriods.some(p => dateString >= p.start && dateString <= p.end);
    }
  }
  
  if (staff.workFromDate && dateString < staff.workFromDate) return false;
  
  return true;
};"""

content = content.replace(old_func, new_func)

with open("types.ts", "w") as f:
    f.write(content)

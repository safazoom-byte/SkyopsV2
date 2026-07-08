import re

with open("components/ProgramCheck.tsx", "r") as f:
    code = f.read()

# Fix getShiftsForDate logic and other compilation errors

# 1. Fix getShiftsForDate
old_get_shifts = """    const getShiftsForDate = (allShifts: ShiftConfig[], dateString: string) => {
      const d = new Date(dateString);
      const dayName = d.toLocaleDateString("en-US", { weekday: "long" });
      return allShifts.filter((s) => {
        if (!s.isActive) return false;
        if (s.pattern === "Once" && s.pickupDate === dateString) return true;
        if (s.pattern === "Daily") {
          return d >= new Date(s.pickupDate) && (!s.endDate || d <= new Date(s.endDate));
        }
        if (s.pattern === "Weekly" && s.daysOfWeek?.includes(dayName)) {
          return d >= new Date(s.pickupDate) && (!s.endDate || d <= new Date(s.endDate));
        }
        if (s.pattern === "Custom" && s.customDates?.includes(dateString)) {
          return true;
        }
        return false;
      });
    };"""

new_get_shifts = """    const getShiftsForDate = (allShifts: ShiftConfig[], dateString: string) => {
      return allShifts.filter((s) => s.pickupDate === dateString);
    };"""

code = code.replace(old_get_shifts, new_get_shifts)

with open("components/ProgramCheck.tsx", "w") as f:
    f.write(code)

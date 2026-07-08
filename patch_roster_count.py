import re

with open("services/geminiService.ts", "r") as f:
    content = f.read()

old_roster_count = """    let rosterCount = 0;
    data.staff
      .filter((s) => s.type === "Roster")
      .forEach((s) => {
        const onLeave = data.leaveRequests?.some(
          (l) => l.staffId === s.id && l.startDate <= dStr && l.endDate >= dStr,
        );
        let inContract = false;
        if (s.rosterPeriods && s.rosterPeriods.length > 0) {
          inContract = s.rosterPeriods.some(
            (p) => dStr >= p.start && dStr <= p.end,
          );
        } else if (s.workFromDate && s.workToDate) {
          inContract = dStr >= s.workFromDate && dStr <= s.workToDate;
        }
        if (!onLeave && inContract) rosterCount++;
      });"""

new_roster_count = """    let rosterCount = 0;
    data.staff
      .filter((s) => s.type === "Roster")
      .forEach((s) => {
        const onLeave = data.leaveRequests?.some(
          (l) => l.staffId === s.id && l.startDate <= dStr && l.endDate >= dStr,
        );
        if (!onLeave && isStaffActiveOnDate(s, dStr)) rosterCount++;
      });"""

content = content.replace(old_roster_count, new_roster_count)

with open("services/geminiService.ts", "w") as f:
    f.write(content)

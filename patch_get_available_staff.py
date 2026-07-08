import re

with open("services/geminiService.ts", "r") as f:
    content = f.read()

# Replace the contract check block with isStaffActiveOnDate
old_check = """          // 2. Check Contract (Roster)
          if (s.type === "Roster") {
            if (s.rosterPeriods && s.rosterPeriods.length > 0) {
              const inContract = s.rosterPeriods.some(
                (p) => dStr >= p.start && dStr <= p.end,
              );
              if (!inContract) return false;
            } else if (s.workFromDate && s.workToDate) {
              if (dStr < s.workFromDate || dStr > s.workToDate) return false;
            }
          }"""

new_check = """          // 2. Check Active Status / Contract
          if (!isStaffActiveOnDate(s, dStr)) return false;
          
          if (s.type === "Roster") {
            if (s.rosterPeriods && s.rosterPeriods.length > 0) {
              const inContract = s.rosterPeriods.some(
                (p) => dStr >= p.start && dStr <= p.end,
              );
              if (!inContract) return false;
            }
          }"""

content = content.replace(old_check, new_check)

with open("services/geminiService.ts", "w") as f:
    f.write(content)

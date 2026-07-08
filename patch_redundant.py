import re

with open("services/geminiService.ts", "r") as f:
    content = f.read()

old = """          // 2. Check Active Status / Contract
          if (!isStaffActiveOnDate(s, dStr)) return false;
          
          if (s.type === "Roster") {
            if (s.rosterPeriods && s.rosterPeriods.length > 0) {
              const inContract = s.rosterPeriods.some(
                (p) => dStr >= p.start && dStr <= p.end,
              );
              if (!inContract) return false;
            }
          }"""

new = """          // 2. Check Active Status / Contract
          if (!isStaffActiveOnDate(s, dStr)) return false;"""

content = content.replace(old, new)

with open("services/geminiService.ts", "w") as f:
    f.write(content)

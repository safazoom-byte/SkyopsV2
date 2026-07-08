import re

with open("services/geminiService.ts", "r") as f:
    content = f.read()

old_surplus = "    dailySurplus[dayOffset] = localStaff.length - dailyLocalDemand[dayOffset];"
new_surplus = "    const activeLocalToday = localStaff.filter(s => isStaffActiveOnDate(s, dStr)).length;\n    dailySurplus[dayOffset] = activeLocalToday - dailyLocalDemand[dayOffset];"

content = content.replace(old_surplus, new_surplus)

with open("services/geminiService.ts", "w") as f:
    f.write(content)

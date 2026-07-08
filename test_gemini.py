import re

with open("services/geminiService.ts", "r") as f:
    content = f.read()

import_pattern = r'import \{([\s\S]*?)\} from "../types";'
def add_import(match):
    imports = match.group(1)
    if "isStaffActiveOnDate" not in imports:
        imports += "  isStaffActiveOnDate,\n"
    return f'import {{{imports}}} from "../types";'

content = re.sub(import_pattern, add_import, content)

filter_pattern = r'  data\.staff = data\.staff\.filter\(\(s\) => s\.isActive !== false\);'

new_filter = """  const periodDates: string[] = [];
  for (let i = 0; i < config.numDays; i++) {
    const d = new Date(config.startDate);
    d.setDate(d.getDate() + i);
    periodDates.push(d.toISOString().split("T")[0]);
  }

  data.staff = data.staff.filter((s) => {
    if (s.isActive === false) return false;
    return periodDates.some(dateStr => isStaffActiveOnDate(s, dateStr));
  });"""

content = re.sub(filter_pattern, new_filter, content)

with open("services/geminiService.ts", "w") as f:
    f.write(content)

import re

with open("components/ProgramDisplay.tsx", "r") as f:
    code = f.read()

# Pattern 1 (Line 1431-1433)
p1 = """          let isRosterOutOfContract = false;
          if (s.workFromDate && s.workFromDate > prog.dateString!) isRosterOutOfContract = true;
          if (s.workToDate && s.workToDate < prog.dateString!) isRosterOutOfContract = true;"""

r1 = """          let isRosterOutOfContract = false;
          if (s.type === "Roster") {
            if (s.workFromDate && s.workFromDate > prog.dateString!) isRosterOutOfContract = true;
            if (s.workToDate && s.workToDate < prog.dateString!) isRosterOutOfContract = true;
          }"""

code = code.replace(p1, r1)

# Pattern 2 (Line 1823-1825)
p2 = """          let isRosterOutOfContract = false;
          if (s.workFromDate && s.workFromDate > prog.dateString!) isRosterOutOfContract = true;
          if (s.workToDate && s.workToDate < prog.dateString!) isRosterOutOfContract = true;"""

r2 = """          let isRosterOutOfContract = false;
          if (s.type === "Roster") {
            if (s.workFromDate && s.workFromDate > prog.dateString!) isRosterOutOfContract = true;
            if (s.workToDate && s.workToDate < prog.dateString!) isRosterOutOfContract = true;
          }"""

code = code.replace(p2, r2)

with open("components/ProgramDisplay.tsx", "w") as f:
    f.write(code)

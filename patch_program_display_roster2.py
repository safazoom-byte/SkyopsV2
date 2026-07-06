import re

with open("components/ProgramDisplay.tsx", "r") as f:
    code = f.read()

def replacer(match):
    return """        let isRosterOutOfContract = false;
        if (s.type === "Roster") {
          if (s.rosterPeriods && s.rosterPeriods.length > 0) {
            isRosterOutOfContract = !s.rosterPeriods.some(
              (p) => prog.dateString! >= p.start && prog.dateString! <= p.end,
            );
          } else {
            if (s.workFromDate && prog.dateString! < s.workFromDate) isRosterOutOfContract = true;
            if (s.workToDate && prog.dateString! > s.workToDate) isRosterOutOfContract = true;
          }
        }"""

code = re.sub(
    r"        let isRosterOutOfContract = false;\n        if \(s\.type === \"Roster\"\) \{\n          if \(s\.rosterPeriods && s\.rosterPeriods\.length > 0\) \{\n            isRosterOutOfContract = !s\.rosterPeriods\.some\(\n              \(p\) => prog\.dateString! >= p\.start && prog\.dateString! <= p\.end,\n            \);\n          \} else if \(s\.workFromDate && s\.workToDate\) \{\n            isRosterOutOfContract =\n              prog\.dateString! < s\.workFromDate \|\|\n              prog\.dateString! > s\.workToDate;\n          \}\n        \}",
    replacer,
    code,
    flags=re.MULTILINE
)

def replacer2(match):
    return """                    let isRosterOutOfContract = false;
                    if (s.type === "Roster") {
                      if (s.rosterPeriods && s.rosterPeriods.length > 0) {
                        isRosterOutOfContract = !s.rosterPeriods.some(
                          (p) =>
                            prog.dateString! >= p.start &&
                            prog.dateString! <= p.end,
                        );
                      } else {
                        if (s.workFromDate && prog.dateString! < s.workFromDate) isRosterOutOfContract = true;
                        if (s.workToDate && prog.dateString! > s.workToDate) isRosterOutOfContract = true;
                      }
                    }"""

code = re.sub(
    r"                    let isRosterOutOfContract = false;\n                    if \(s\.type === \"Roster\"\) \{\n                      if \(s\.rosterPeriods && s\.rosterPeriods\.length > 0\) \{\n                        isRosterOutOfContract = !s\.rosterPeriods\.some\(\n                          \(p\) =>\n                            prog\.dateString! >= p\.start &&\n                            prog\.dateString! <= p\.end,\n                        \);\n                      \} else if \(s\.workFromDate && s\.workToDate\) \{\n                        isRosterOutOfContract =\n                          prog\.dateString! < s\.workFromDate \|\|\n                          prog\.dateString! > s\.workToDate;\n                      \}\n                    \}",
    replacer2,
    code,
    flags=re.MULTILINE
)

def replacer3(match):
    return """                    let isRosterOutOfContract = false;
                    if (s.type === "Roster") {
                      if (s.rosterPeriods && s.rosterPeriods.length > 0) {
                        isRosterOutOfContract = !s.rosterPeriods.some(
                          (p) =>
                            refProg.dateString! >= p.start &&
                            refProg.dateString! <= p.end,
                        );
                      } else {
                        if (s.workFromDate && refProg.dateString! < s.workFromDate) isRosterOutOfContract = true;
                        if (s.workToDate && refProg.dateString! > s.workToDate) isRosterOutOfContract = true;
                      }
                    }"""

code = re.sub(
    r"                    let isRosterOutOfContract = false;\n                    if \(s\.type === \"Roster\"\) \{\n                      if \(s\.rosterPeriods && s\.rosterPeriods\.length > 0\) \{\n                        isRosterOutOfContract = !s\.rosterPeriods\.some\(\n                          \(p\) =>\n                            refProg\.dateString! >= p\.start &&\n                            refProg\.dateString! <= p\.end,\n                        \);\n                      \} else if \(s\.workFromDate && s\.workToDate\) \{\n                        isRosterOutOfContract =\n                          refProg\.dateString! < s\.workFromDate \|\|\n                          refProg\.dateString! > s\.workToDate;\n                      \}\n                    \}",
    replacer3,
    code,
    flags=re.MULTILINE
)


with open("components/ProgramDisplay.tsx", "w") as f:
    f.write(code)

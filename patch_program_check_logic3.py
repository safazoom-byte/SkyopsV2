import re

with open("components/ProgramCheck.tsx", "r") as f:
    code = f.read()

# Fix inference
code = code.replace("const staffMap = new Map(staff.map(s => [s.id, s]));", "const staffMap = new Map<string, Staff>(staff.map(s => [s.id, s]));")
code = code.replace("const shiftMap = new Map(shifts.map(s => [s.id, s]));", "const shiftMap = new Map<string, ShiftConfig>(shifts.map(s => [s.id, s]));")
code = code.replace("const coversRole = (a: any, roleCode: string) => {", "const coversRole = (a: any, roleCode: string) => {") # just to be safe

with open("components/ProgramCheck.tsx", "w") as f:
    f.write(code)

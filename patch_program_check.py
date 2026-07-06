import re

with open("components/ProgramCheck.tsx", "r") as f:
    code = f.read()

code = code.replace("dp.dateString || ''", "pDate")
code = code.replace("dp.dateString", "pDate")

with open("components/ProgramCheck.tsx", "w") as f:
    f.write(code)

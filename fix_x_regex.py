import re
with open("components/ShiftManager.tsx", "r") as f:
    code = f.read()

code = re.sub(r'import\s*\{\s*X,\s*ShiftConfig', 'import { ShiftConfig', code)

with open("components/ShiftManager.tsx", "w") as f:
    f.write(code)


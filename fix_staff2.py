import re
with open("components/StaffManager.tsx", "r") as f:
    code = f.read()

code = re.sub(r"              \)\}\n\s*<div className=\"space-y-4 pt-6", r"              <div className=\"space-y-4 pt-6", code)

with open("components/StaffManager.tsx", "w") as f:
    f.write(code)

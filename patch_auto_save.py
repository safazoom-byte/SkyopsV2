import re

with open("components/ProgramDisplay.tsx", "r") as f:
    content = f.read()

content = content.replace(
    "const interval = setInterval(doAutoSave, 1 * 60 * 1000); // 1 minute",
    "const interval = setInterval(doAutoSave, 5 * 60 * 1000); // 5 minutes"
)

with open("components/ProgramDisplay.tsx", "w") as f:
    f.write(content)
print("Patched ProgramDisplay.tsx")

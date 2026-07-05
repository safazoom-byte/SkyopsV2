with open("components/ShiftManager.tsx", "r") as f:
    code = f.read()

code = code.replace("import {", "import { X, ", 1)
code = code.replace("<Trash2 size={16} />", "<X size={16} />")

with open("components/ShiftManager.tsx", "w") as f:
    f.write(code)


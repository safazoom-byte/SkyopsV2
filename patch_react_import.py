import re

with open("components/ProgramCheck.tsx", "r") as f:
    code = f.read()

code = code.replace("import React, { useMemo } from 'react';", "import * as React from 'react';\nimport { useMemo } from 'react';")

with open("components/ProgramCheck.tsx", "w") as f:
    f.write(code)

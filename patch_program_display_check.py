import re

with open("components/ProgramDisplay.tsx", "r") as f:
    code = f.read()

search = """                <ProgramCheck
                  staff={staff}
                  shifts={shifts}
                  programs={activePrograms}
                  leaveRequests={leaveRequests}
                  startDate={startDate}
                  endDate={endDate}
                />"""

replace = """                <ProgramCheck
                  staff={staff}
                  shifts={shifts}
                  programs={activePrograms}
                  leaveRequests={leaveRequests}
                  flights={flights}
                  startDate={startDate}
                  endDate={endDate}
                />"""

code = code.replace(search, replace)

with open("components/ProgramDisplay.tsx", "w") as f:
    f.write(code)

import re

with open("components/StaffManager.tsx", "r") as f:
    code = f.read()

old_code = """                        <span
                          className={`text-[7px] md:text-[8px] font-black uppercase tracking-widest ${member.isActive === false ? "text-rose-500" : isRoster ? "text-amber-600" : "text-blue-600"}`}
                        >
                          {member.isActive === false
                            ? "DEACTIVATED"
                            : `${member.type} AGENT`}
                        </span>"""

new_code = """                        <span
                          className={`text-[7px] md:text-[8px] font-black uppercase tracking-widest ${member.isActive === false ? "text-rose-500" : member.workToDate ? "text-rose-600" : isRoster ? "text-amber-600" : "text-blue-600"}`}
                        >
                          {member.isActive === false
                            ? "DEACTIVATED"
                            : member.workToDate ? `ACTIVE TILL ${new Date(member.workToDate).toLocaleDateString("en-GB", {day:"2-digit", month:"short", year:"2-digit"}).replace(/ /g,"").toUpperCase()}` : `${member.type} AGENT`}
                        </span>"""

if old_code in code:
    code = code.replace(old_code, new_code)
    print("Replaced card code")
else:
    print("Could not find card code")

with open("components/StaffManager.tsx", "w") as f:
    f.write(code)

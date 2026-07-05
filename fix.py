import re
with open("components/ShiftManager.tsx", "r") as f:
    code = f.read()

# 1. replace roles block
match = re.search(r'<td className="px-4 py-2">\s*<div className="flex flex-wrap gap-1">\s*\{AVAILABLE_SKILLS\.map\(\(skill\) => \([\s\S]*?\}\s*<\/div>\s*<\/td>\s*<td \s*className="px-4 py-2"\s*onDragOver=\{handleDragOver\}', code)

if match:
    new_roles = """<td className="px-4 py-2">
                                    <div className="flex flex-col gap-1 w-24">
                                      <button 
                                        onClick={() => setExpandedRolesShiftId(expandedRolesShiftId === s.id ? null : s.id)}
                                        className="text-[9px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded px-2 py-1 flex items-center justify-between hover:bg-indigo-100 transition-colors"
                                      >
                                        <span>{expandedRolesShiftId === s.id ? "HIDE ROLES" : "SHOW ROLES"}</span>
                                        <ChevronDown size={12} className={`transition-transform ${expandedRolesShiftId === s.id ? 'rotate-180' : ''}`} />
                                      </button>
                                      {expandedRolesShiftId === s.id && AVAILABLE_SKILLS.map((skill) => (
                                        <div
                                          key={skill}
                                          className="flex items-center gap-1 bg-white border border-slate-200 rounded px-1.5 py-0.5"
                                        >
                                          <span
                                            className="text-[9px] font-bold text-slate-500"
                                            title={skill}
                                          >
                                            {getSkillCode(skill)}
                                          </span>
                                          <button
                                            onClick={() => {
                                              const newCount = Math.max(
                                                0,
                                                (s.roleCounts?.[skill] || 0) -
                                                  1,
                                              );
                                              onUpdate({
                                                ...s,
                                                roleCounts: {
                                                  ...s.roleCounts,
                                                  [skill]: newCount,
                                                },
                                              });
                                            }}
                                            className="text-slate-300 hover:text-slate-600"
                                          >
                                            <Minus size={10} />
                                          </button>
                                          <span className="text-[10px] font-black w-3 text-center">
                                            {s.roleCounts?.[skill] || 0}
                                          </span>
                                          <button
                                            onClick={() => {
                                              const newCount =
                                                (s.roleCounts?.[skill] || 0) +
                                                1;
                                              onUpdate({
                                                ...s,
                                                roleCounts: {
                                                  ...s.roleCounts,
                                                  [skill]: newCount,
                                                },
                                              });
                                            }}
                                            className="text-slate-300 hover:text-slate-600"
                                          >
                                            <Plus size={10} />
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  </td>
                                  <td 
                                    className="px-4 py-2"
                                    onDragOver={handleDragOver}"""
    code = code[:match.start()] + new_roles + code[match.end():]
    print("Match replaced successfully.")
else:
    print("Match for roles not found")

with open("components/ShiftManager.tsx", "w") as f:
    f.write(code)


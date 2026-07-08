import re

with open("components/ProgramDisplay.tsx", "r") as f:
    content = f.read()

matrix_render_old = """                    let content: React.ReactNode = (
                      <span className="text-slate-300">-</span>
                    );
                    let cellClass = `px-4 py-2 text-center border-r border-slate-100 ${isCellModified ? "bg-indigo-100/50 shadow-inner" : ""}`;
                    if (assign) {"""

matrix_render_new = """                    let content: React.ReactNode = (
                      <span className="text-slate-300">-</span>
                    );
                    let cellClass = `px-4 py-2 text-center border-r border-slate-100 ${isCellModified ? "bg-indigo-100/50 shadow-inner" : ""}`;
                    if (!isStaffActiveOnDate(s, p.dateString!)) {
                       content = <span className="text-slate-200">/</span>;
                       cellClass = `px-4 py-2 text-center border-r border-slate-50 bg-slate-50`;
                    } else if (assign) {"""

content = content.replace(matrix_render_old, matrix_render_new)

with open("components/ProgramDisplay.tsx", "w") as f:
    f.write(content)

import re
with open("components/ShiftManager.tsx", "r") as f:
    code = f.read()

# Add isFormOpen state
code = code.replace("const [editingId, setEditingId] = useState<string | null>(null);", "const [editingId, setEditingId] = useState<string | null>(null);\n  const [isFormOpen, setIsFormOpen] = useState(false);")

# Add "Add Duty" button to the header
header_btn_match = r'(<button className="flex-1 px-6 py-4 md:px-8 md:py-5 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center gap-3 hover:bg-white/10 transition-all">\s*<FileDown size=\{18\} className="text-emerald-400" />\s*<span className="text-\[9px\] md:text-\[10px\] font-black uppercase tracking-widest text-white">\s*Report\s*</span>\s*</button>)'
new_btns = r"""\1
          <button
            onClick={() => {
              setEditingId(null);
              resetForm();
              setIsFormOpen(true);
            }}
            className="flex-1 px-6 py-4 md:px-8 md:py-5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl flex items-center justify-center gap-3 transition-all group shadow-xl shadow-blue-600/20"
          >
            <Plus size={16} className="group-hover:scale-110 transition-transform" />
            <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest italic">
              New Duty
            </span>
          </button>"""
code = re.sub(header_btn_match, new_btns, code)

# Change grid layout and wrap the form in a modal
grid_match = re.search(r'<div className="grid grid-cols-1 xl:grid-cols-4 gap-8 md:gap-10">\s*<div className="xl:col-span-1">\s*<div className="bg-white p-6 md:p-10 rounded-3xl md:rounded-\[3\.5rem\] shadow-sm border border-slate-100 xl:sticky xl:top-24 max-h-\[85vh\] overflow-y-auto no-scrollbar">', code)
if grid_match:
    print("Found grid_match")

# replace grid layout start
# we want to turn it into:
# <div>
#   {(isFormOpen || editingId) && ( <div className="fixed inset-0 z-[1500] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"> <div className="bg-white p-6 md:p-10 rounded-3xl md:rounded-[3.5rem] shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"> ... )}
code = code.replace('<div className="grid grid-cols-1 xl:grid-cols-4 gap-8 md:gap-10">\n        <div className="xl:col-span-1">\n          <div className="bg-white p-6 md:p-10 rounded-3xl md:rounded-[3.5rem] shadow-sm border border-slate-100 xl:sticky xl:top-24 max-h-[85vh] overflow-y-auto no-scrollbar">', 
'''<div>
      {(isFormOpen || editingId) && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-white p-6 md:p-10 rounded-3xl md:rounded-[3.5rem] shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto relative no-scrollbar">
            <button
              onClick={() => {
                setIsFormOpen(false);
                setEditingId(null);
                resetForm();
              }}
              className="absolute top-6 right-6 p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-500 transition-colors"
            >
              <Trash2 size={16} />
            </button>''')

# Now find the end of the form
form_end_match = r'(</form>\s*</div>\s*</div>\s*<div className="xl:col-span-3 space-y-8 md:space-y-10">)'
code = re.sub(form_end_match, r'</form>\n          </div>\n        </div>\n      )}\n\n      <div className="space-y-8 md:space-y-10">', code)

with open("components/ShiftManager.tsx", "w") as f:
    f.write(code)


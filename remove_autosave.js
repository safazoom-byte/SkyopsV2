import fs from 'fs';
let content = fs.readFileSync('components/ProgramDisplay.tsx', 'utf8');

const hookStart = content.indexOf('  useEffect(() => {\n    const doAutoSave = async () => {');
if (hookStart !== -1) {
   const hookEndStr = '  }, [startDate, endDate]);\n';
   const hookEnd = content.indexOf(hookEndStr, hookStart) + hookEndStr.length;
   content = content.slice(0, hookStart) + content.slice(hookEnd);
   fs.writeFileSync('components/ProgramDisplay.tsx', content);
   console.log('Removed doAutoSave hook');
} else {
   console.log('Hook not found');
}

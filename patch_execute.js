const fs = require('fs');
const content = fs.readFileSync('components/ProgramDisplay.tsx', 'utf8');

const regex = /const executeMove = \([\s\S]*?programsChanged = false;/;
const replacement = `const executeMove = (
    staffId: string,
    currentShiftId: string,
    date: string,
    role: string,
    targetShiftId: string,
    targetDate: string,
  ) => {
    const newPrograms = [...programs];
    const sourceProgIndex = newPrograms.findIndex((p) => p.dateString === date);
    const targetProgIndex = newPrograms.findIndex((p) => p.dateString === targetDate);
    if (sourceProgIndex === -1 || targetProgIndex === -1) return;
    
    const sourceProg = { ...newPrograms[sourceProgIndex], assignments: [...newPrograms[sourceProgIndex].assignments] };
    newPrograms[sourceProgIndex] = sourceProg;
    
    let targetProg = sourceProg;
    if (sourceProgIndex !== targetProgIndex) {
        targetProg = { ...newPrograms[targetProgIndex], assignments: [...newPrograms[targetProgIndex].assignments] };
        newPrograms[targetProgIndex] = targetProg;
    }

    const isTargetAbsence = targetShiftId.startsWith("ABSENCE");
    let currentLeaves = [...leaveRequests];
    let leavesChanged = false;
    let programsChanged = false;`;

const newContent = content.replace(regex, replacement);

const regex2 = /if \(\!currentShiftId\.startsWith\("ABSENCE"\)\) \{[\s\S]*?const oldIdx = prog\.assignments\.findIndex\([\s\S]*?if \(oldIdx \!\=\= -1\) \{[\s\S]*?prog\.assignments\.splice\(oldIdx, 1\);/g;
const replacement2 = `if (!currentShiftId.startsWith("ABSENCE")) {
      // If dropped onto the same shift it was already in, move to front
      if (currentShiftId === targetShiftId && date === targetDate) {
        const oldIdx = sourceProg.assignments.findIndex(
          (a) => a.staffId === staffId && a.shiftId === currentShiftId,
        );
        if (oldIdx !== -1) {
          const shiftAssignments = sourceProg.assignments.filter(a => a.shiftId === currentShiftId);
          const minSort = Math.min(0, ...shiftAssignments.map(a => a.manualSortIndex || 0));
          sourceProg.assignments[oldIdx] = { ...sourceProg.assignments[oldIdx], manualSortIndex: minSort - 1 };
          onUpdatePrograms(newPrograms, [date]);
        }
        return;
      }

      const oldIdx = sourceProg.assignments.findIndex(
        (a) => a.staffId === staffId && a.shiftId === currentShiftId,
      );
      if (oldIdx !== -1) {
        sourceProg.assignments.splice(oldIdx, 1);`;

const newContent2 = newContent.replace(/if \(\!currentShiftId\.startsWith\("ABSENCE"\)\) \{[\s\S]*?const oldIdx = prog\.assignments\.findIndex\([\s\S]*?\(a\) => a\.staffId === staffId && a\.shiftId === currentShiftId,[\s\S]*?\);[\s\S]*?if \(oldIdx \!\=\= -1\) \{[\s\S]*?prog\.assignments\.splice\(oldIdx, 1\);/, replacement2);

const regex3 = /if \(\!isTargetAbsence && targetShiftId \!\=\= "OFFDUTY"\) \{[\s\S]*?const exists = prog\.assignments\.some\(/;
const replacement3 = `if (!isTargetAbsence && targetShiftId !== "OFFDUTY") {
      const exists = targetProg.assignments.some(`;
const newContent3 = newContent2.replace(regex3, replacement3);

const regex4 = /const maxSort = Math\.max\(0, \.\.\.prog\.assignments\.map\(a => a\.manualSortIndex \|\| 0\)\);[\s\S]*?prog\.assignments\.push\(\{/;
const replacement4 = `const maxSort = Math.max(0, ...targetProg.assignments.map(a => a.manualSortIndex || 0));
        targetProg.assignments.push({`;
const newContent4 = newContent3.replace(regex4, replacement4);

const regex5 = /onUpdatePrograms\(newPrograms, \[targetDate\]\);/;
const replacement5 = `const changedDates = date === targetDate ? [targetDate] : [date, targetDate];
        onUpdatePrograms(newPrograms, changedDates);`;
const newContent5 = newContent4.replace(regex5, replacement5);

fs.writeFileSync('components/ProgramDisplay.tsx', newContent5);

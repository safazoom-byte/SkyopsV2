import fs from 'fs';
let content = fs.readFileSync('index.tsx', 'utf8');

const insertPoint = content.indexOf('  const confirmGenerateProgram');

const hookStr = `
  useEffect(() => {
    let channel: any = null;
    if (supabase && cloudStatus === "connected") {
       channel = supabase.channel('schema-db-changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'programs' },
          (payload) => {
             if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
               const p = payload.new;
               let notes = {};
               let shiftDrivers = {};
               let actualOffDuty: any[] = [];
               
               if (Array.isArray(p.off_duty)) {
                 const notesHack = p.off_duty.find((o: any) => o.staffId === "NOTES_HACK");
                 const driversHack = p.off_duty.find((o: any) => o.staffId === "DRIVERS_HACK");
                 if (notesHack) notes = notesHack.data;
                 if (driversHack) shiftDrivers = driversHack.data;
                 actualOffDuty = p.off_duty.filter((o: any) => o.staffId !== "NOTES_HACK" && o.staffId !== "DRIVERS_HACK");
               }
               
               const mappedProg = {
                 day: p.day,
                 dateString: p.date_string,
                 assignments: p.assignments || [],
                 offDuty: actualOffDuty,
                 notes: notes,
                 shiftDrivers: shiftDrivers,
               };
               
               setPrograms(prev => {
                  const newProgs = [...prev];
                  const idx = newProgs.findIndex(prog => prog.dateString === mappedProg.dateString);
                  
                  if (idx !== -1) {
                    // Check if anything actually changed to avoid unnecessary re-renders
                    if (JSON.stringify(newProgs[idx]) === JSON.stringify(mappedProg)) {
                      return prev;
                    }
                    newProgs[idx] = mappedProg;
                  } else {
                    newProgs.push(mappedProg);
                  }
                  return newProgs.sort((a, b) => (a.dateString || "").localeCompare(b.dateString || ""));
               });
             } else if (payload.eventType === 'DELETE') {
               setPrograms(prev => prev.filter(prog => prog.dateString !== payload.old.date_string));
             }
          }
        )
        .subscribe();
    }
    return () => {
      if (channel && supabase) {
        supabase.removeChannel(channel);
      }
    };
  }, [supabase, cloudStatus]);
`;

content = content.slice(0, insertPoint) + hookStr + '\n' + content.slice(insertPoint);
fs.writeFileSync('index.tsx', content);

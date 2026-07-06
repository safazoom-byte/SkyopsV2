import re

with open("index.tsx", "r") as f:
    code = f.read()

onadd_search = """              const isDuplicate = flights.some(
                (existing) =>
                  existing.date === f.date &&
                  normalizeFlightNumber(existing.flightNumber) === normFNum
              );
              if (isDuplicate) {
                alert(`Flight ${f.flightNumber} already exists on ${f.date}. Duplicates are not allowed.`);
                return;
              }"""

onadd_replace = """              const duplicateIdx = flights.findIndex(
                (existing) =>
                  existing.date === f.date &&
                  normalizeFlightNumber(existing.flightNumber) === normFNum
              );
              if (duplicateIdx !== -1) {
                const existing = flights[duplicateIdx];
                if (window.confirm(`Flight ${f.flightNumber} already exists on ${f.date}. Do you want to delete the old one and create the new one?`)) {
                  const newFlights = [...flights];
                  newFlights.splice(duplicateIdx, 1);
                  setFlights([...newFlights, f]);
                  db.deleteFlight(existing.id);
                  db.upsertFlight(f);
                  db.logAction("UPDATE", "FLIGHT", f.id, `Replaced existing flight ${f.flightNumber}`);
                }
                return;
              }"""

code = code.replace(onadd_search, onadd_replace)

onupdate_search = """              const isDuplicate = flights.some(
                (existing) =>
                  existing.id !== f.id &&
                  existing.date === f.date &&
                  normalizeFlightNumber(existing.flightNumber) === normFNum
              );
              if (isDuplicate) {
                alert(`Flight ${f.flightNumber} already exists on ${f.date}. Duplicates are not allowed.`);
                return;
              }"""

onupdate_replace = """              const duplicateIdx = flights.findIndex(
                (existing) =>
                  existing.id !== f.id &&
                  existing.date === f.date &&
                  normalizeFlightNumber(existing.flightNumber) === normFNum
              );
              if (duplicateIdx !== -1) {
                const existing = flights[duplicateIdx];
                if (window.confirm(`Flight ${f.flightNumber} already exists on ${f.date}. Do you want to delete the old one and replace it with this update?`)) {
                   const newFlights = [...flights].filter(fl => fl.id !== existing.id && fl.id !== f.id);
                   setFlights([...newFlights, f]);
                   db.deleteFlight(existing.id);
                   db.upsertFlight(f);
                   db.logAction("UPDATE", "FLIGHT", f.id, `Updated flight ${f.flightNumber} replacing duplicate`);
                }
                return;
              }"""

code = code.replace(onupdate_search, onupdate_replace)

with open("index.tsx", "w") as f:
    f.write(code)

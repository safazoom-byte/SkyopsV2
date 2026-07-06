import re

with open("index.tsx", "r") as f:
    code = f.read()

onaddflight_search = """            onAddFlight={(f) => {
              if (userProfile && !userProfile.isActive) return;
              setFlights((p) => [...p, f]);
              db.upsertFlight(f);
            }}"""

onaddflight_replace = """            onAddFlight={(f) => {
              if (userProfile && !userProfile.isActive) return;
              const normFNum = normalizeFlightNumber(f.flightNumber);
              const duplicateIdx = flights.findIndex(
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
              }
              setFlights((p) => [...p, f]);
              db.upsertFlight(f);
            }}"""

onupdateflight_search = """            onUpdateFlight={(f) => {
              if (userProfile && !userProfile.isActive) return;
              setFlights((p) => p.map((o) => (o.id === f.id ? f : o)));
              db.upsertFlight(f);
            }}"""

onupdateflight_replace = """            onUpdateFlight={(f) => {
              if (userProfile && !userProfile.isActive) return;
              const normFNum = normalizeFlightNumber(f.flightNumber);
              const duplicateIdx = flights.findIndex(
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
              }
              setFlights((p) => p.map((o) => (o.id === f.id ? f : o)));
              db.upsertFlight(f);
            }}"""

code = code.replace(onaddflight_search, onaddflight_replace)
code = code.replace(onupdateflight_search, onupdateflight_replace)

with open("index.tsx", "w") as f:
    f.write(code)

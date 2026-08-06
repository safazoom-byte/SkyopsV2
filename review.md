# Comprehensive CRUD Review Findings

Based on the review of the database operations and state synchronization, I have identified several critical race conditions and architectural issues that cause user edits to revert.

1. **`DELETE` + `INSERT` Pattern in `savePrograms`:**
   In `supabaseService.ts`, the `savePrograms` function currently deletes the program for the given dates and then re-inserts them. This triggers two Realtime events (`DELETE`, then `INSERT`). When the client receives the `DELETE` event, it removes the program from local state, causing the UI to briefly lose the data. When the `INSERT` event arrives, it restores the data. Any concurrent edits made during this gap are overwritten. **Fix:** Use standard `upsert` instead.

2. **Missing `await` on Database Operations (Global Issue):**
   Across `index.tsx`, almost all database operations (`db.upsertStaff`, `db.upsertFlight`, `db.savePrograms`, `db.deleteStaff`, etc.) are called synchronously without `await`. While this provides an "optimistic update" feel, it leads to race conditions. If a user performs actions rapidly, local state can diverge from the database, and concurrent operations can overwrite each other.

3. **Stale Closures in Async Functions (`executeMove`):**
   The drag-and-drop logic (`executeMove`) reads the current state (like `leaveRequests`) at the beginning of the function. Because it contains `await` calls, if a user performs two rapid drag-and-drop actions, the second action will read the *old* state before the first action has finished updating it. This results in the first action being overwritten locally, causing it to "revert."

4. **Unconditional Saves in `onUpdatePrograms`:**
   When a user modifies a leave (e.g., from Days Off to Annual Leave), `executeMove` correctly updates the leave but *also* unconditionally calls `onUpdatePrograms` for that date, even though the shift assignments didn't change. This triggers the destructive `DELETE` + `INSERT` cycle mentioned in point 1, exacerbating the problem.

5. **No Rollback on Network Failure:**
   Because local state is updated immediately without awaiting the database result, if the network request fails, the UI will continue to show the user's edit as successful. Upon refreshing the page (which triggers `syncCloudData`), the app will pull the true database state, causing the user's edits to "mysteriously" revert.

I am ready to implement the fixes for these issues. Should I proceed?

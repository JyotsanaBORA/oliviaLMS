# GTI Workflow Verification

These manual checks cover the GTI-only workflow controls added across the API and React clients.

## 1. GTI vs Non-GTI Lead Updates
1. Sign in as an Agent2 that belongs to the GTI organization.
2. Edit any GTI lead and update the draft date plus a disposition reason. Submit and verify the changes persist and the lead is immediately marked "Disposed" with status "Dead".
3. Repeat the same action against a lead that belongs to a non-GTI org. Confirm the draft date and disposition changes are ignored and no error is raised for the non-GTI path.
4. Use the browser dev tools (or Mongo shell) to confirm the GTI document now has `draftDate`, `disposition1`, `isDisposed`, and `disposedBy` set while the non-GTI lead remains unchanged.

## 2. Role-Based Draft Date Editing
1. While logged in as Agent2 (GTI org), open the Update Lead modal and verify the "Draft Date (GTI Only)" field appears, auto-formats to `dd/mm/yyyy`, and saves successfully.
2. Attempt to type letters or an invalid date (`32/13/2025`). The UI should highlight the field, block submission, and show the error toast.
3. Sign in as Agent1 and open the same lead. Confirm there is no draft date input and that a manual `PUT /api/leads/:id` request with `draftDate` returns HTTP 403.
4. Repeat as an Admin user to ensure the draft date input renders in the lead-details view and sends successfully.

## 3. Admin Visibility Across Views
1. Open the Admin dashboard lead list and confirm each card shows:
   - `Disposed` pill when `isDisposed` is true
   - The disposition reason text (when present)
   - `Disposed By` label populated with the user or ObjectId
   - `Draft Date` formatted as `dd/mm/yyyy`
2. Open the Admin lead-details modal for the same record and verify the "GTI Workflow Snapshot" panel lists the same four values.
3. Switch to a non-GTI lead and confirm the panel still renders but shows `Active`, a `—` reason, no disposer, and blank draft date (ensuring admins can view all fields even when unset).
4. Finally, hit `GET /api/leads` directly and confirm the JSON payload now includes populated `disposition1`, `isDisposed`, `disposedBy`, and `draftDate` values for GTI leads.

## 4. Agent1 Create vs Dispose Flow
1. Sign in as an Agent1 that belongs to GTI and open the "Add Lead" modal. Leave the GTI disposition dropdown on the default `Keep lead active` option, submit a valid lead, and confirm:
   - The success toast says "Lead added successfully!".
   - The Admin dashboard shows the lead as `Active` with status `New` (or whichever default was chosen) and no disposition info.
2. Still as GTI Agent1, open the modal again, select any canned disposition reason (or choose `Other` and fill out the custom note), and submit.
   - Verify the footer button switches to **Dispose Lead**, the success toast reads "Lead disposed successfully!", and no assignment modal opens.
   - Inspect the network response and confirm `data.status = "Dead"`, `data.isDisposed = true`, `data.disposition1` matches the reason, and `data.disposedBy` returns the Agent1 user document.
   - Refresh Admin dashboard and ensure the card shows the `Disposed` pill, `Reason`, `Disposed By`, and the status badge now reads `Dead`.
3. Repeat Step 2 but send the `POST /api/leads` call manually via Postman/cURL without a `disposition1` payload and observe the API returns HTTP 400 with `"Disposition reason is required when disposing a lead"`.
4. Sign in as an Agent1 belonging to a non-GTI org, submit the same payloads (with and without `isDisposed`), and confirm the API ignores the disposal flags, continues to assign leads per the existing workflow, and the Admin dashboard keeps showing them as `Active`.

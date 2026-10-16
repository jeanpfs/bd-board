# Phase B - Design Proposal: Three-Dot Menu and Edit/Delete Modals

## 1. Safely Editable Project Fields

Based on `bd config --help` and `bd --help`, the fields that are **safe to edit after initialization** for a registered project are:

- **Project Name** (Project Label/Name) — plain text field, no risk of conflicting with bead IDs
- **Project Directory Path** — folder picker, **essential to recover moved/renamed projects**
- **Prefix** — ⚠️ **NOT RECOMMENDED TO EDIT** — the prefix is embedded in every bead ID. Changing it after initialization would break references. Left out of the edit scope.

Reason: `bd rename-prefix` exists in the CLI and is a **destructive** operation that recomputes every ID, so it is not safe to expose through the UI without an explicit warning. This field stays read-only in the modal.

## 2. Behavior With Multiple Broken Projects on Startup

**Proposed decision**: show one modal at a time, in sequential order (list order in `projects.json`).

Each modal includes:

- Title: `⚠️ Repair Project: {name}`
- Description: "The project path is no longer valid. Please select a new location."
- Editable fields: **project name** + **folder picker**
- Action button: "Repair" (instead of "Save")
- Cancel button: "Cancel"

After repairing a project:

- The new folder is validated
- If invalid: show the error in the modal (keep it open so the user can correct it)
- If valid: close the modal and move to the next broken project (if any)
- If the user cancels: stop the sequence and let them interact with the dashboard

**Code flow**:

- The `useValidateProjectsOnMount` hook keeps `currentBrokenIndex` and a `brokenProjects` list
- Each time a modal closes successfully, increment the index and refetch the project list
- When there are no more broken projects, the state goes back to null and no modal is shown

## 3. Visual Placement of the Three-Dot Menu

### Project Rail (project-rail.tsx)

**Challenge**: the rail is compact (232px, 48px when collapsed). Each project item is already a tight link/button.

**Proposed solution**:

- **Expanded mode (232px)**:
  - Add a menu icon (⋮) or (···) ALIGNED TO THE RIGHT of each project, revealed on **hover**
  - Layout: `[Project icon] [Project name] [Menu ⋮]` with adequate gap/spacing
  - Dropdown menu over the project card, with options:
    - "Edit" → opens the edit modal
    - "Delete" → opens the confirmation modal
- **Collapsed mode (48px)**:
  - Each item is a centered icon
  - On **hover**, show a tooltip + menu button (or long-press on mobile)
  - The menu can appear as a **popover** next to the icon

### Dashboard - Project Cards (project-card.tsx)

**Current layout**: card with project image/badge, name, status counts, etc.

**Proposed solution**:

- Add a menu icon (⋮) in the **top-right corner** of the card, revealed on **hover**
- Dropdown menu with options:
  - "Edit" → opens the edit modal
  - "Delete" → opens the confirmation modal
- Does not break the existing layout (the card already has room in the top-right corner)

### Delete Confirmation Modal

- Title: "Delete Project: {name}"
- Description: "Are you sure you want to delete this project from the registry? The folder will not be deleted, but the project will no longer be accessible from the application."
- Buttons:
  - "Cancel"
  - "Delete" (destructive/red variant)

After confirmation:

- Call `removeProject(id)`
- Refetch the project list
- Success toast: "Project removed"
- On error: error toast with the message

## 4. Relationship With the "Copy Configuration" Modal (New Project Init Flow)

**Current state**: there is no "copy config from another project" implementation in the Init flow.

**Component reuse analysis**:

- **Edit Modal (Repair/Edit)**: reusable, since it handles name + folder changes
- **Delete Modal**: specific to deletion, no immediate reuse
- **Folder Picker**: reusable component (`pickProjectDirectory()`)

**Relationship**:

- Editing an **existing** project = changing the name/folder of something already initialized
- Init of a new project = starting from scratch, optionally copying config from an existing one
- These are **distinct** operations in terms of data flow (renameMutation vs. initMutation), but they share:
  - Folder picker UI
  - Path validation logic (`checkProjectPath`)
  - Error handling

**Recommendation**: do not share the `EditProjectModal` with the Init flow. Keep them separate for clarity, but **extract reusable UI components**:

- `ProjectPathSelector` — folder picker + validation component
- `ProjectNameInput` — name input component
- Use these components in both modals

## 5. Implementation Schedule

### Phase B.1 (Backend Plumbing) — ✅ ALREADY DONE

- ✅ `removeProject()` wrapper in `src/lib/server.ts`
- ✅ `checkProjectPath()` for validation
- ✅ `useValidateProjectsOnMount` hook
- ✅ EditProjectModal with `isRepair` prop

### Phase B.2 (Three-Dot Menu UI) — AWAITING APPROVAL

1. Add the menu icon (⋮) and popover to the rail and cards
2. Implement the delete confirmation modal
3. Test flows: repair, edit, delete
4. E2E tests for the new flows

### Phase B.3 (Reusable Components) — OPTIONAL

1. Extract `ProjectPathSelector` and `ProjectNameInput`
2. Use them in the Init flow once "copy config" is implemented

---

## Questions for Approval

1. **Order of broken projects**: use the `projects.json` order (simple) or add "lastUsed" logic? (Proposal: simple, current order)

2. **Editable fields**: only name + folder, or allow editing another field too? (Proposal: name + folder)

3. **Cancel behavior**: if the user cancels the repair of a broken project, return to the dashboard or stay in the modal? (Proposal: return to the dashboard)

4. **Visual feedback**: spinner/loading while validating a new path? (Proposal: yes, Loader2 as already done in init)

---

**Ready to implement as soon as you give the OK.**

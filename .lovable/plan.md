# Plan: Remove Teams, Add Multi-Project Admin Membership

## Goal

- Drop the "teams" concept entirely (no team leaders, no team filtering).
- A single employee can be admin of **multiple projects**. Admin role membership is a list, managed only by Super Admin.
- Project admins can switch / filter reports by project (one project, several, or all of their projects).
- Regular employees still belong to exactly one project (their punching project).

## Data model changes

### `employees/{uid}`
- Remove: `teamId`, `teamName`, `role: 'leader'`.
- Keep: `role: 'superadmin' | 'admin' | 'employee'`.
- Add: `adminProjects: string[]` — list of project IDs this user can admin (only meaningful when `role === 'admin'`).
- Keep `projectId` as the employee's "home" project (where they punch attendance). For pure admins with no punching, this can be the first item of `adminProjects` or null.

### `attendance/{id}`
- Remove: `teamId`, `teamName`.
- Keep: `projectId`, `projectName`, `uid`, in/out timestamps & coords.

### Remove collection
- `teams/*` — delete the collection and all references.

## Firestore rules

- Remove `isLeader()`, `myTeamId()`, `teams` rules block.
- New helper:
  ```
  function adminProjects() { return myEmp().adminProjects; }
  function isAdminOf(pid) { return isAdmin() && adminProjects().hasAny([pid]); }
  ```
- `employees`/`attendance` read+write allowed if `isSuperAdmin()` or `isAdminOf(resource.data.projectId)`.
- Create allowed if `isAdminOf(request.resource.data.projectId)`.

## Auth context

- `Role` type drops `'leader'`.
- `EmployeeDoc` loses team fields, gains `adminProjects?: string[]`.
- Sign-in validation: if user is admin, the typed Project ID must be in `adminProjects`. The chosen project becomes the "active project" for the session (stored in context + localStorage).
- Super admin still signs in with blank project ID.

## Routes

- **Delete** `src/routes/admin.teams.tsx` + routeTree entry.
- **`/login`**: unchanged UI, but validation hits `adminProjects` list.
- **`/admin`** dashboard: 
  - Add a **Project filter dropdown** at the top — options: each project in `adminProjects` + "All my projects".
  - Stat cards, unpunched list, and Excel export respect the filter.
- **`/admin/employees`**: list/create employees scoped to currently-selected project (single project at a time for create); admin may switch project from the same dropdown. Remove team column & team assignment field.
- **`/admin/attendance`**: project filter dropdown drives the query (one or all). Remove team column / team-wise sheets; Excel now groups by **project** (one sheet per project + summary).
- **`/super`**: 
  - Project create unchanged.
  - "Add Admin" flow updated: pick an existing employee (by email) **or** create new auth user, then add the project ID to their `adminProjects` array (arrayUnion). Also expose "Remove admin from project" action.
- **`/app`** (employee punch): remove team stamping; keep `projectId`/`projectName`.

## UI: project picker

Small reusable `<ProjectPicker>` reading `profile.adminProjects` (superadmin gets full list from `projects` collection). Selection persisted in `localStorage('activeProjectId')`. "All" value = empty string → queries omit the project filter (superadmin) or use `where('projectId','in', adminProjects)` (admin).

## Excel export

`downloadProjectWise(range)`:
- Summary sheet: project, total employees, present today, absent today, leave balance totals.
- One sheet per project with attendance rows for the date range.
- Respects current filter (single project → just that sheet).

## Migration notes

- Existing `teams/*` docs: ignored (can be deleted manually in console).
- Existing employees with `role: 'leader'` → treat as `'employee'` at read time (defensive in auth context).
- Existing admin docs without `adminProjects`: fall back to `[projectId]` if `projectId` is set.

## Execution order

1. Update `Role` + `EmployeeDoc` + auth-context sign-in validation, with `adminProjects` fallback.
2. Update `firestore.rules` (remove team/leader, add `isAdminOf`).
3. Delete `admin.teams.tsx` and remove from `routeTree.gen.ts` + admin nav links.
4. Update `/super` to manage `adminProjects` via arrayUnion/arrayRemove on existing employees.
5. Add `<ProjectPicker>` + active-project context.
6. Update `admin.index.tsx`, `admin.employees.tsx`, `admin.attendance.tsx` to use the picker, drop team UI/queries, and rewrite Excel export project-wise.
7. Update `app.index.tsx` punch logic to remove team stamping.

## Required action after deploy

- Publish updated `firestore.rules`.
- For each existing project admin, Super Admin must re-open `/super` once and click "Add Admin" again so the user's `adminProjects` array is populated (or run a one-time backfill which I can add as a button on `/super`).

Confirm and I'll execute in this order.

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { db } from "@/lib/firebase";
import {
  collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where,
} from "firebase/firestore";
import { createAuthUser } from "@/lib/firebase-admin-create";
import { useAuth } from "@/lib/auth-context";
import type { Assignment } from "@/lib/auth-context";
import { toast } from "sonner";
import { KeyRound, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { ProjectPicker, useAvailableProjects } from "@/components/ProjectPicker";
import { loadAllOffices, type Office } from "@/lib/offices";
import { nextEmployeeId, peekNextEmployeeId } from "@/lib/employee-id";

export const Route = createFileRoute("/admin/employees")({
  component: () => (
    <RequireAuth role="staff">
      <EmployeesPage />
    </RequireAuth>
  ),
});

interface EmpRow {
  id: string;
  employeeID: string;
  name: string;
  email: string;
  officeLat: number;
  officeLng: number;
  role: "admin" | "employee" | "superadmin";
  projectId?: string | null;
  projectName?: string | null;
  projectIds?: string[];
  assignments?: Assignment[];
  totalLeaves?: number;
  usedLeaves?: number;
  branches?: string[];
}

interface FormState {
  employeeID: string;
  name: string;
  email: string;
  password: string;
  role: "employee" | "admin";
  totalLeaves: string;
  usedLeaves: string;
  branches: string;
  assignments: Assignment[];
}

const emptyForm: FormState = {
  employeeID: "",
  name: "",
  email: "",
  password: "",
  role: "employee",
  totalLeaves: "12",
  usedLeaves: "0",
  branches: "",
  assignments: [],
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function deriveAssignments(r: EmpRow): Assignment[] {
  if (r.assignments && r.assignments.length > 0) return r.assignments;
  if (r.projectId) {
    return [{
      projectId: r.projectId,
      projectName: r.projectName ?? r.projectId,
      officeLat: r.officeLat ?? 0,
      officeLng: r.officeLng ?? 0,
    }];
  }
  return [];
}

function EmployeesPage() {
  const { profile, activeProjectId, setActiveProjectId, adminProjectIds } = useAuth();
  const isSuper = profile?.role === "superadmin";
  const { projects } = useAvailableProjects();

  const [rows, setRows] = useState<EmpRow[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EmpRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);

  const canEdit = isSuper || profile?.role === "admin";

  const load = async () => {
    setLoading(true);
    try {
      const scopeIds = activeProjectId
        ? [activeProjectId]
        : isSuper
        ? []
        : adminProjectIds;
      let list: EmpRow[] = [];
      if (isSuper && scopeIds.length === 0) {
        const s = await getDocs(collection(db, "employees"));
        list = s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<EmpRow, "id">) }));
      } else {
        // Combine results from projectIds array-contains-any AND legacy projectId in (...)
        const snaps = await Promise.all([
          ...chunk(scopeIds, 10).map((ids) =>
            getDocs(query(collection(db, "employees"), where("projectIds", "array-contains-any", ids))),
          ),
          ...chunk(scopeIds, 30).map((ids) =>
            getDocs(query(collection(db, "employees"), where("projectId", "in", ids))),
          ),
        ]);
        const byId = new Map<string, EmpRow>();
        snaps.flatMap((s) => s.docs).forEach((d) => {
          byId.set(d.id, { id: d.id, ...(d.data() as Omit<EmpRow, "id">) });
        });
        list = Array.from(byId.values());
      }

      // Sort: superadmin/admin at the top, then employees numerically by their employeeID
      list.sort((a, b) => {
        const roleWeight = (r: string) => {
          if (r === "superadmin") return 0;
          if (r === "admin") return 1;
          return 2;
        };
        const rA = roleWeight(a.role);
        const rB = roleWeight(b.role);
        if (rA !== rB) return rA - rB;

        const numA = parseInt(a.employeeID?.replace(/\D/g, "") || "0", 10);
        const numB = parseInt(b.employeeID?.replace(/\D/g, "") || "0", 10);
        if (numA !== numB) return numA - numB;
        return (a.employeeID || "").localeCompare(b.employeeID || "");
      });

      setRows(list);
    } catch (e) {
      toast.error(
        (e instanceof Error ? e.message : "Failed to load") +
        " — make sure the latest firestore.rules are Published in the Firebase Console.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [activeProjectId, isSuper, adminProjectIds.join("|")]);

  useEffect(() => {
    loadAllOffices()
      .then(setOffices)
      .catch(() => toast.error("Failed to load office locations"));
  }, []);

  const officesForProject = (projectId: string) =>
    offices.filter((o) => o.projectId === projectId);

  const openNew = async () => {
    if (!activeProjectId) {
      toast.error("Select a project from the picker before creating an employee.");
      return;
    }
    const pname = projects.find((p) => p.id === activeProjectId)?.name ?? activeProjectId;
    const projectOffices = officesForProject(activeProjectId);
    if (projectOffices.length === 0) {
      toast.error("No office locations for this project. Ask super admin to add offices first.");
      return;
    }
    const firstOffice = projectOffices[0];
    let newId = "";
    try {
      newId = await peekNextEmployeeId();
    } catch {
      toast.error("Failed to generate preview employee ID");
      return;
    }
    setEditing(null);
    setForm({
      ...emptyForm,
      employeeID: newId,
      assignments: [{
        projectId: activeProjectId,
        projectName: pname,
        officeId: firstOffice.id,
        officeName: firstOffice.name,
        officeLat: firstOffice.lat,
        officeLng: firstOffice.lng,
      }],
    });
    setOpen(true);
  };

  const openEdit = (r: EmpRow) => {
    setEditing(r);
    setForm({
      employeeID: r.employeeID,
      name: r.name,
      email: r.email,
      password: "",
      role: (r.role === "superadmin" ? "admin" : r.role) as "employee" | "admin",
      totalLeaves: String(r.totalLeaves ?? 12),
      usedLeaves: String(r.usedLeaves ?? 0),
      branches: (r.branches ?? []).join(", "),
      assignments: deriveAssignments(r),
    });
    setOpen(true);
  };

  const addAssignmentRow = () => {
    setForm((f) => ({
      ...f,
      assignments: [...f.assignments, { projectId: "", projectName: "", officeId: "", officeName: "", officeLat: 0, officeLng: 0 }],
    }));
  };
  const updateAssignment = (idx: number, patch: Partial<Assignment>) => {
    setForm((f) => ({
      ...f,
      assignments: f.assignments.map((a, i) => {
        if (i !== idx) return a;
        const merged = { ...a, ...patch };
        if (patch.projectId !== undefined) {
          const proj = projects.find((p) => p.id === patch.projectId);
          if (proj) merged.projectName = proj.name;
          const locs = officesForProject(patch.projectId);
          if (locs.length > 0) {
            merged.officeId = locs[0].id;
            merged.officeName = locs[0].name;
            merged.officeLat = locs[0].lat;
            merged.officeLng = locs[0].lng;
          } else {
            merged.officeId = "";
            merged.officeName = "";
            merged.officeLat = 0;
            merged.officeLng = 0;
          }
        }
        if (patch.officeId !== undefined) {
          const office = offices.find((o) => o.id === patch.officeId);
          if (office) {
            merged.officeName = office.name;
            merged.officeLat = office.lat;
            merged.officeLng = office.lng;
          }
        }
        return merged;
      }),
    }));
  };
  const removeAssignment = (idx: number) => {
    setForm((f) => ({ ...f, assignments: f.assignments.filter((_, i) => i !== idx) }));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = form.assignments
      .filter((a) => a.projectId.trim())
      .map((a) => ({
        projectId: a.projectId.trim(),
        projectName: (a.projectName || a.projectId).trim(),
        officeId: a.officeId || undefined,
        officeName: a.officeName || undefined,
        officeLat: Number(a.officeLat),
        officeLng: Number(a.officeLng),
      }));
    if (cleaned.length === 0) return toast.error("Add at least one project assignment.");
    for (const a of cleaned) {
      if (!a.officeId) return toast.error(`Select an office location for ${a.projectId}`);
      if (isNaN(a.officeLat) || isNaN(a.officeLng)) return toast.error(`Invalid coordinates for ${a.projectId}`);
    }
    const totalLeaves = parseInt(form.totalLeaves, 10) || 0;
    const usedLeaves = parseInt(form.usedLeaves, 10) || 0;
    const branches = form.branches.split(",").map((s) => s.trim()).filter(Boolean);
    const primary = cleaned[0];
    const projectIds = cleaned.map((a) => a.projectId);
    setBusy(true);
    try {
      if (editing) {
        await updateDoc(doc(db, "employees", editing.id), {
          employeeID: form.employeeID,
          name: form.name,
          role: form.role,
          totalLeaves,
          usedLeaves,
          branches,
          assignments: cleaned,
          projectIds,
          projectId: primary.projectId,
          projectName: primary.projectName,
          officeLat: primary.officeLat,
          officeLng: primary.officeLng,
        });
        toast.success("Employee updated");
      } else {
        if (form.password.length < 6) {
          setBusy(false);
          return toast.error("Password must be at least 6 characters");
        }
        const reservedId = await nextEmployeeId();
        const uid = await createAuthUser(form.email.trim(), form.password);
        await setDoc(doc(db, "employees", uid), {
          employeeID: reservedId,
          name: form.name,
          email: form.email.trim(),
          role: form.role,
          assignments: cleaned,
          projectIds,
          projectId: primary.projectId,
          projectName: primary.projectName,
          officeLat: primary.officeLat,
          officeLng: primary.officeLng,
          totalLeaves,
          usedLeaves: 0,
          branches,
          createdAt: serverTimestamp(),
        });
        toast.success("Employee created");
      }
      setOpen(false);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      toast.error(msg.replace("Firebase: ", ""));
    } finally {
      setBusy(false);
    }
  };

  const resequenceEmployeeIds = async () => {
    console.log("resequenceEmployeeIds: Button clicked");
    if (!confirm("Are you sure you want to re-sequence all employee IDs sequentially? This will update all employees and their corresponding attendance/request logs to match.")) {
      console.log("resequenceEmployeeIds: Cancelled by user");
      return;
    }
    setBusy(true);
    try {
      console.log("resequenceEmployeeIds: Fetching employees...");
      const empSnap = await getDocs(collection(db, "employees"));
      console.log(`resequenceEmployeeIds: Found ${empSnap.docs.length} total employee docs`);
      
      const emps = empSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<EmpRow, "id">) }))
        .filter((e) => e.role === "employee");
      console.log(`resequenceEmployeeIds: Filtered to ${emps.length} employees`);

      // Sort numerically by the numeric suffix of their current employeeID, falling back to name/email
      emps.sort((a, b) => {
        const numA = parseInt(a.employeeID?.replace(/\D/g, "") || "0", 10);
        const numB = parseInt(b.employeeID?.replace(/\D/g, "") || "0", 10);
        if (numA !== numB) return numA - numB;
        return a.email.localeCompare(b.email);
      });

      console.log("resequenceEmployeeIds: Sorted list:", emps.map(e => `${e.name} (${e.employeeID})`));

      let updatedCount = 0;
      for (let i = 0; i < emps.length; i++) {
        const emp = emps[i];
        const newID = `EMP${String(i + 1).padStart(3, "0")}`;
        console.log(`resequenceEmployeeIds: Processing ${emp.name}. Current: ${emp.employeeID}, Target: ${newID}`);

        if (emp.employeeID !== newID) {
          console.log(`resequenceEmployeeIds: Updating ${emp.name} to ${newID}...`);
          // Update employee profile
          await updateDoc(doc(db, "employees", emp.id), { employeeID: newID });

          // Update attendance logs
          const attSnap = await getDocs(query(collection(db, "attendance"), where("uid", "==", emp.id)));
          console.log(`resequenceEmployeeIds: Found ${attSnap.docs.length} attendance logs to update`);
          for (const d of attSnap.docs) {
            await updateDoc(doc(db, "attendance", d.id), { employeeID: newID });
          }

          // Update leave requests
          const leaveSnap = await getDocs(query(collection(db, "leaveRequests"), where("uid", "==", emp.id)));
          console.log(`resequenceEmployeeIds: Found ${leaveSnap.docs.length} leave requests to update`);
          for (const d of leaveSnap.docs) {
            await updateDoc(doc(db, "leaveRequests", d.id), { employeeID: newID });
          }

          // Update WFH requests
          const wfhSnap = await getDocs(query(collection(db, "wfhRequests"), where("uid", "==", emp.id)));
          console.log(`resequenceEmployeeIds: Found ${wfhSnap.docs.length} WFH requests to update`);
          for (const d of wfhSnap.docs) {
            await updateDoc(doc(db, "wfhRequests", d.id), { employeeID: newID });
          }

          // Update regularization requests
          const regSnap = await getDocs(query(collection(db, "regularizationRequests"), where("uid", "==", emp.id)));
          console.log(`resequenceEmployeeIds: Found ${regSnap.docs.length} regularization requests to update`);
          for (const d of regSnap.docs) {
            await updateDoc(doc(db, "regularizationRequests", d.id), { employeeID: newID });
          }

          updatedCount++;
        }
      }

      // Update database next employee counter reference
      console.log(`resequenceEmployeeIds: Setting employeeCounter.next to ${emps.length + 1}`);
      const COUNTER_REF = doc(db, "meta", "employeeCounter");
      await setDoc(COUNTER_REF, { next: emps.length + 1 }, { merge: true });

      toast.success(`Successfully re-sequenced employee IDs. Updated ${updatedCount} employees.`);
      console.log("resequenceEmployeeIds: Finished successfully");
      await load();
    } catch (e) {
      console.error("resequenceEmployeeIds error:", e);
      toast.error(e instanceof Error ? e.message : "Failed to re-sequence IDs");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: EmpRow) => {
    try {
      await deleteDoc(doc(db, "employees", r.id));
      toast.success("Employee profile deleted. Firebase Auth account must be removed manually.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const resetPassword = async (r: EmpRow) => {
    try {
      await sendPasswordResetEmail(auth, r.email);
      toast.success(`Password reset email sent to ${r.email}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send reset email");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Employees</h1>
          <p className="text-sm text-muted-foreground">Create and manage employee accounts with per-project office locations.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ProjectPicker projects={projects} value={activeProjectId} onChange={setActiveProjectId} />
          {canEdit && (
            <Button variant="outline" onClick={resequenceEmployeeIds} disabled={busy}>
              Re-sequence IDs
            </Button>
          )}
          {canEdit && <Button onClick={openNew}><Plus className="mr-1 h-4 w-4" /> New employee</Button>}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-3">ID</th>
                    <th className="p-3">Name</th>
                    <th className="p-3">Email</th>
                    <th className="p-3">Projects</th>
                    <th className="p-3">Leaves</th>
                    <th className="p-3">Role</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const asg = deriveAssignments(r);
                    return (
                    <tr key={r.id} className="border-t">
                      <td className="p-3 font-mono text-xs">{r.employeeID}</td>
                      <td className="p-3">{r.name}</td>
                      <td className="p-3">{r.email}</td>
                      <td className="p-3 text-xs">
                        <div className="flex flex-wrap gap-1">
                          {asg.length === 0 ? <span className="text-muted-foreground">—</span> :
                            asg.map((a) => (
                              <Badge key={`${a.projectId}-${a.officeId ?? a.officeName ?? ""}`} variant="secondary" title={`${a.officeName ?? "Office"}: ${a.officeLat?.toFixed?.(5)}, ${a.officeLng?.toFixed?.(5)}`}>
                                {a.projectId}{a.officeName ? ` / ${a.officeName}` : ""}
                              </Badge>
                            ))
                          }
                        </div>
                      </td>
                      <td className="p-3 text-xs">
                        {(() => {
                          const remaining = (r.totalLeaves ?? 0) - (r.usedLeaves ?? 0);
                          return (
                            <span className="flex items-center gap-1.5">
                              <Badge variant={remaining <= 0 ? "destructive" : remaining <= 3 ? "outline" : "secondary"}>
                                {remaining} remaining
                              </Badge>
                              <span className="text-xs text-muted-foreground">of {r.totalLeaves ?? 0}</span>
                            </span>
                          );
                        })()}
                      </td>
                      <td className="p-3"><Badge variant={r.role === "admin" || r.role === "superadmin" ? "default" : "secondary"}>{r.role}</Badge></td>
                      <td className="p-3">
                        {canEdit && (
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                            {isSuper && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="sm" variant="ghost" title="Send password reset email"><KeyRound className="h-4 w-4" /></Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Send password reset to {r.name}?</AlertDialogTitle>
                                    <AlertDialogDescription>A reset link will be emailed to {r.email}.</AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => resetPassword(r)}>Send email</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete {r.name}?</AlertDialogTitle>
                                  <AlertDialogDescription>This removes the Firestore profile. Auth account must be deleted manually.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => remove(r)}>Delete</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        )}
                      </td>
                    </tr>
                  );})}
                  {rows.length === 0 && (
                    <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No employees yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editing ? "Edit employee" : "New employee"}</DialogTitle>
            <DialogDescription>
              Assign one or more projects and pick the office location for each. Coordinates come from the office master data.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto min-h-0 px-1 pr-4">
            <form onSubmit={save} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Employee ID</Label>
                  <Input
                    value={form.employeeID}
                    onChange={(e) => setForm({ ...form, employeeID: e.target.value })}
                    required
                    readOnly={!editing}
                    className={!editing ? "bg-muted" : undefined}
                  />
                  {!editing && <p className="text-xs text-muted-foreground">Auto-generated in series (EMP001, EMP002, …)</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "employee" | "admin" })}>
                    <option value="employee">Employee</option>
                    <option value="admin" disabled={!isSuper}>Admin (super only)</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required disabled={!!editing} />
              </div>
              {!editing && (
                <div className="space-y-1.5">
                  <Label>Initial password</Label>
                  <Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} />
                </div>
              )}

              <div className="space-y-2 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <Label>Project assignments</Label>
                  <Button type="button" size="sm" variant="outline" onClick={addAssignmentRow}>
                    <Plus className="mr-1 h-3 w-3" /> Add project
                  </Button>
                </div>
                {form.assignments.length === 0 && (
                  <p className="text-xs text-muted-foreground">No projects assigned yet.</p>
                )}
                {form.assignments.map((a, idx) => {
                  const locs = officesForProject(a.projectId);
                  return (
                  <div key={idx} className="grid grid-cols-12 gap-2 rounded-md bg-muted/40 p-2">
                    <div className="col-span-5 space-y-1">
                      <Label className="text-xs">Project</Label>
                      <select
                        className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                        value={a.projectId}
                        onChange={(e) => updateAssignment(idx, { projectId: e.target.value })}
                        required
                      >
                        <option value="">Select…</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>{p.name} ({p.id})</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-5 space-y-1">
                      <Label className="text-xs">Office location</Label>
                      <select
                        className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                        value={a.officeId ?? ""}
                        onChange={(e) => updateAssignment(idx, { officeId: e.target.value })}
                        required
                        disabled={!a.projectId}
                      >
                        <option value="">{a.projectId ? (locs.length ? "Select…" : "No offices — add in Super Admin") : "Select project first"}</option>
                        {locs.map((o) => (
                          <option key={o.id} value={o.id}>{o.name}</option>
                        ))}
                      </select>
                      {a.officeLat && a.officeLng ? (
                        <p className="text-[10px] text-muted-foreground font-mono">{a.officeLat.toFixed(5)}, {a.officeLng.toFixed(5)}</p>
                      ) : null}
                    </div>
                    <div className="col-span-2 flex items-end justify-end">
                      <Button type="button" size="sm" variant="ghost" onClick={() => removeAssignment(idx)}>
                        <X className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                );})}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Total leaves</Label>
                  <Input type="number" min="0" value={form.totalLeaves} onChange={(e) => setForm({ ...form, totalLeaves: e.target.value })} required />
                </div>
                {editing && (
                  <div className="space-y-1.5">
                    <Label>Used leaves <span className="text-xs text-muted-foreground">(admin override)</span></Label>
                    <div className="flex gap-1.5">
                      <Input type="number" min="0" value={form.usedLeaves} onChange={(e) => setForm({ ...form, usedLeaves: e.target.value })} required className="flex-1" />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        title="Reset used leaves to 0 (new cycle)"
                        onClick={() => setForm({ ...form, usedLeaves: "0" })}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Remaining: <strong>{Math.max(0, parseInt(form.totalLeaves || "0") - parseInt(form.usedLeaves || "0"))}</strong> of {form.totalLeaves}
                    </p>
                  </div>
                )}
              </div>
            </form>
          </div>
          <DialogFooter className="shrink-0">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={busy} onClick={(e) => { e.preventDefault(); save(e); }}>{busy ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

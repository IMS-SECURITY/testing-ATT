import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { db } from "@/lib/firebase";
import {
  addDoc, collection, deleteDoc, doc, getDocs, query, serverTimestamp, updateDoc, where,
} from "firebase/firestore";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import * as XLSX from "xlsx";
import { Download, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { ProjectPicker, useAvailableProjects } from "@/components/ProjectPicker";

export const Route = createFileRoute("/admin/attendance")({
  component: () => (
    <RequireAuth role="staff">
      <AttendancePage />
    </RequireAuth>
  ),
});

interface Row {
  id: string;
  uid: string;
  employeeID: string;
  name: string;
  email: string;
  date: string;
  time: string;
  lat: number;
  lng: number;
  punchOutTime?: string;
  punchOutLat?: number;
  punchOutLng?: number;
  projectId?: string | null;
  projectName?: string | null;
  status?: string;
  onDutyAtName?: string;
}


type Range = "day" | "week" | "month" | "all";

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function AttendancePage() {
  const { profile, activeProjectId, setActiveProjectId, adminProjectIds } = useAuth();
  const isSuper = profile?.role === "superadmin";
  const isAdmin = profile?.role === "admin" || isSuper;
  const { projects } = useAvailableProjects();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>("day");
  const [anchor, setAnchor] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [empFilter, setEmpFilter] = useState("");
  const [groupByProject, setGroupByProject] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const scopeIds = activeProjectId
        ? [activeProjectId]
        : isSuper
        ? []
        : adminProjectIds;
      const snaps = await Promise.all(
        isSuper && scopeIds.length === 0
          ? [getDocs(collection(db, "attendance"))]
          : chunk(scopeIds, 30).map((ids) =>
              getDocs(query(collection(db, "attendance"), where("projectId", "in", ids))),
            ),
      );
      const list = snaps.flatMap((s) => s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Row, "id">) })));
      list.sort((a, b) => (a.date < b.date ? 1 : -1));
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

  const filtered = useMemo(() => {
    const a = new Date(anchor + "T00:00:00");
    let from = "", to = "";
    if (range === "day") { from = to = anchor; }
    else if (range === "week") {
      from = format(startOfWeek(a, { weekStartsOn: 1 }), "yyyy-MM-dd");
      to = format(endOfWeek(a, { weekStartsOn: 1 }), "yyyy-MM-dd");
    } else if (range === "month") {
      from = format(startOfMonth(a), "yyyy-MM-dd");
      to = format(endOfMonth(a), "yyyy-MM-dd");
    }
    return rows.filter((r) => {
      if (range !== "all" && (r.date < from || r.date > to)) return false;
      if (empFilter && !r.name?.toLowerCase().includes(empFilter.toLowerCase()) && !r.employeeID?.toLowerCase().includes(empFilter.toLowerCase())) return false;
      return true;
    });
  }, [rows, range, anchor, empFilter]);

  const toExportRows = (list: Row[]) => list.map((r) => ({
    EmployeeID: r.employeeID, Name: r.name, Email: r.email,
    Project: r.projectId ?? "",
    Date: r.date, "Punch In": r.time, "Punch Out": r.punchOutTime ?? "",
    "In Latitude": r.lat, "In Longitude": r.lng,
    "Out Latitude": r.punchOutLat ?? "", "Out Longitude": r.punchOutLng ?? "",
  }));

  const exportXlsx = () => {
    const ws = XLSX.utils.json_to_sheet(toExportRows(filtered));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");
    XLSX.writeFile(wb, `attendance-${range}-${anchor}.xlsx`);
  };

  const exportCsv = () => {
    const ws = XLSX.utils.json_to_sheet(toExportRows(filtered));
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `attendance-${range}-${anchor}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportProjectWiseXlsx = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toExportRows(filtered)), "All");
    const byProject = new Map<string, Row[]>();
    filtered.forEach((r) => {
      const key = r.projectId ?? "Unassigned";
      const arr = byProject.get(key) ?? [];
      arr.push(r);
      byProject.set(key, arr);
    });
    byProject.forEach((list, pid) => {
      const sheetName = pid.substring(0, 28) || "Unassigned";
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toExportRows(list)), sheetName);
    });
    XLSX.writeFile(wb, `attendance-by-project-${range}-${anchor}.xlsx`);
  };

  const remove = async (r: Row) => {
    await deleteDoc(doc(db, "attendance", r.id));
    toast.success("Entry deleted");
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Attendance</h1>
          <p className="text-sm text-muted-foreground">Filter, correct, and export by project.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ProjectPicker projects={projects} value={activeProjectId} onChange={setActiveProjectId} />
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="mr-1 h-4 w-4" /> CSV</Button>
          <Button variant="outline" size="sm" onClick={exportXlsx}><Download className="mr-1 h-4 w-4" /> Excel</Button>
          {isAdmin && <Button variant="secondary" size="sm" onClick={exportProjectWiseXlsx}><Download className="mr-1 h-4 w-4" /> Project-wise Excel</Button>}
          {isAdmin && <Button size="sm" onClick={() => setNewOpen(true)}><Plus className="mr-1 h-4 w-4" /> Add entry</Button>}
        </div>
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Range</Label>
              <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={range} onChange={(e) => setRange(e.target.value as Range)}>
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
                <option value="all">All</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Reference date</Label>
              <Input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} disabled={range === "all"} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Search employee</Label>
              <Input placeholder="Name or ID…" value={empFilter} onChange={(e) => setEmpFilter(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant={groupByProject ? "default" : "outline"} onClick={() => setGroupByProject((v) => !v)}>
              {groupByProject ? "Ungroup" : "Group by project"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-3">Date</th>
                    <th className="p-3">In</th>
                    <th className="p-3">Out</th>
                    <th className="p-3">Employee</th>
                    <th className="p-3">ID</th>
                    <th className="p-3">Project</th>
                    <th className="p-3">Location</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const groups: { key: string; list: Row[] }[] = groupByProject
                      ? Array.from(
                          filtered.reduce((m, r) => {
                            const k = r.projectId ?? "Unassigned";
                            const arr = m.get(k) ?? [];
                            arr.push(r);
                            m.set(k, arr);
                            return m;
                          }, new Map<string, Row[]>()).entries()
                        ).map(([key, list]) => ({ key, list }))
                      : [{ key: "", list: filtered }];
                    return groups.flatMap((g) => [
                      ...(groupByProject ? [(
                        <tr key={`g-${g.key}`} className="bg-muted/30">
                          <td colSpan={8} className="p-2 text-xs font-semibold uppercase text-muted-foreground">
                            {g.key} — {g.list.length}
                          </td>
                        </tr>
                      )] : []),
                      ...g.list.map((r) => (
                        <tr key={r.id} className="border-t">
                          <td className="p-3">{r.date}</td>
                          <td className="p-3 font-mono">
                            {r.status === "on_duty"
                              ? <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700">On Duty{r.onDutyAtName ? ` @ ${r.onDutyAtName}` : ""}</span>
                              : r.time}
                          </td>
                          <td className="p-3 font-mono">{r.status === "on_duty" ? "—" : (r.punchOutTime ?? <span className="text-muted-foreground">—</span>)}</td>
                          <td className="p-3">{r.name}</td>
                          <td className="p-3 font-mono text-xs">{r.employeeID}</td>
                          <td className="p-3 text-xs">{r.projectId ?? <span className="text-muted-foreground">—</span>}</td>
                          <td className="p-3 text-xs text-muted-foreground">{r.lat?.toFixed(5)}, {r.lng?.toFixed(5)}</td>
                          <td className="p-3">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" onClick={() => { setEditing(r); setEditOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="sm" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete entry?</AlertDialogTitle>
                                    <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => remove(r)}>Delete</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </td>
                        </tr>
                      )),

                    ]);
                  })()}
                  {filtered.length === 0 && (
                    <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No records</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <EditDialog open={editOpen} onOpenChange={setEditOpen} row={editing} onSaved={load} />
      <NewDialog open={newOpen} onOpenChange={setNewOpen} onSaved={load} />
    </div>
  );
}

function EditDialog({ open, onOpenChange, row, onSaved }: { open: boolean; onOpenChange: (b: boolean) => void; row: Row | null; onSaved: () => void }) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (row) { setDate(row.date); setTime(row.time); }
  }, [row]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!row) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, "attendance", row.id), { date, time });
      toast.success("Entry corrected");
      onOpenChange(false);
      onSaved();
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Correct entry</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Time (HH:MM:SS)</Label>
            <Input type="time" step={1} value={time} onChange={(e) => setTime(e.target.value)} required />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface EmpLite { id: string; employeeID: string; name: string; email: string; officeLat: number; officeLng: number; projectId?: string | null; projectName?: string | null }

function NewDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (b: boolean) => void; onSaved: () => void }) {
  const { activeProjectId } = useAuth();
  const [employees, setEmployees] = useState<EmpLite[]>([]);
  const [empId, setEmpId] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [time, setTime] = useState(format(new Date(), "HH:mm:ss"));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !activeProjectId) return;
    getDocs(query(collection(db, "employees"), where("projectId", "==", activeProjectId), where("role", "==", "employee"))).then((s) => {
      setEmployees(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<EmpLite, "id">) })));
    });
  }, [open, activeProjectId]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const emp = employees.find((x) => x.id === empId);
    if (!emp) return toast.error("Pick an employee");
    setBusy(true);
    try {
      await addDoc(collection(db, "attendance"), {
        uid: emp.id,
        employeeID: emp.employeeID,
        name: emp.name,
        email: emp.email,
        projectId: emp.projectId ?? activeProjectId,
        projectName: emp.projectName ?? null,
        date, time,
        lat: emp.officeLat, lng: emp.officeLng,
        manual: true,
        createdAt: serverTimestamp(),
      });
      toast.success("Entry added");
      onOpenChange(false);
      onSaved();
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add manual entry</DialogTitle></DialogHeader>
        {!activeProjectId ? (
          <p className="text-sm text-muted-foreground">Select a project from the picker first.</p>
        ) : (
          <form onSubmit={save} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Employee</Label>
              <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={empId} onChange={(e) => setEmpId(e.target.value)} required>
                <option value="">Select…</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.employeeID})</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>Time</Label>
                <Input type="time" step={1} value={time} onChange={(e) => setTime(e.target.value)} required />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

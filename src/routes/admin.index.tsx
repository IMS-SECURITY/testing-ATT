import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, doc, updateDoc } from "firebase/firestore";
import { Users, CalendarCheck, UserX, Download } from "lucide-react";
import { format, subDays, getDay } from "date-fns";
import * as XLSX from "xlsx";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { ProjectPicker, useAvailableProjects } from "@/components/ProjectPicker";

export const Route = createFileRoute("/admin/")({
  component: () => (
    <RequireAuth role="staff">
      <AdminDashboard />
    </RequireAuth>
  ),
});

interface Emp {
  id: string;
  employeeID: string;
  name: string;
  email: string;
  role: string;
  totalLeaves?: number;
  usedLeaves?: number;
  projectId?: string | null;
  projectName?: string | null;
}

interface Att { uid: string; date: string; projectId?: string | null; projectName?: string | null; status?: string }

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function AdminDashboard() {
  const { profile, activeProjectId, setActiveProjectId, adminProjectIds } = useAuth();
  const isSuper = profile?.role === "superadmin";
  const { projects } = useAvailableProjects();

  const [employees, setEmployees] = useState<Emp[]>([]);
  const [attendanceToday, setAttendanceToday] = useState<Set<string>>(new Set());
  const [allAttendance, setAllAttendance] = useState<Att[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUnpunched, setShowUnpunched] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const scopeIds = activeProjectId

          ? [activeProjectId]
          : isSuper
          ? [] // super = all
          : adminProjectIds;

        // Build queries (handle "in" chunking up to 30; array-contains-any up to 10)
        const empSnaps = await Promise.all(
          isSuper && scopeIds.length === 0
            ? [getDocs(collection(db, "employees"))]
            : [
                ...chunk(scopeIds, 10).map((ids) =>
                  getDocs(query(collection(db, "employees"), where("projectIds", "array-contains-any", ids))),
                ),
                ...chunk(scopeIds, 30).map((ids) =>
                  getDocs(query(collection(db, "employees"), where("projectId", "in", ids))),
                ),
              ],
        );
        const attSnaps = await Promise.all(
          isSuper && scopeIds.length === 0
            ? [getDocs(collection(db, "attendance"))]
            : chunk(scopeIds, 30).map((ids) =>
                getDocs(query(collection(db, "attendance"), where("projectId", "in", ids))),
              ),
        );
        const empMap = new Map<string, Emp>();
        empSnaps.flatMap((s) => s.docs).forEach((d) => empMap.set(d.id, { id: d.id, ...(d.data() as Omit<Emp, "id">) }));
        const emps: Emp[] = Array.from(empMap.values());

        const atts: Att[] = attSnaps.flatMap((s) => s.docs.map((d) => {
          const x = d.data() as Att; return { uid: x.uid, date: x.date, projectId: x.projectId ?? null, projectName: x.projectName ?? null, status: x.status };
        }));
        setEmployees(emps);
        setAllAttendance(atts);
        const today = format(new Date(), "yyyy-MM-dd");
        setAttendanceToday(new Set(atts.filter((a) => a.date === today && a.status !== "on_duty").map((a) => a.uid)));

      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [isSuper, activeProjectId, adminProjectIds.join("|")]);

  const workforce = useMemo(
    () => employees.filter((e) => e.role === "employee"),
    [employees],
  );
  const unpunched = useMemo(
    () => workforce.filter((e) => !attendanceToday.has(e.id)),
    [workforce, attendanceToday],
  );

  const reconcileLeaves = async () => {
    const days: string[] = [];
    for (let i = 1; i <= 30; i++) {
      const d = subDays(new Date(), i);
      const dow = getDay(d);
      if (dow === 0 || dow === 6) continue;
      days.push(format(d, "yyyy-MM-dd"));
    }
    const presentMap = new Map<string, Set<string>>();
    allAttendance.forEach((a) => {
      const s = presentMap.get(a.uid) ?? new Set<string>();
      s.add(a.date);
      presentMap.set(a.uid, s);
    });
    let updated = 0;
    for (const emp of workforce) {
      const present = presentMap.get(emp.id) ?? new Set<string>();
      const absent = days.filter((d) => !present.has(d)).length;
      if ((emp.usedLeaves ?? -1) !== absent) {
        try {
          await updateDoc(doc(db, "employees", emp.id), { usedLeaves: absent });
          updated++;
        } catch (e) { console.error(e); }
      }
    }
    toast.success(`Reconciled leaves for ${updated} employees`);
    setEmployees((prev) => prev.map((e) => {
      if (e.role !== "employee") return e;
      const present = presentMap.get(e.id) ?? new Set<string>();
      const absent = days.filter((d) => !present.has(d)).length;
      return { ...e, usedLeaves: absent };
    }));
  };

  const downloadProjectWise = () => {
    const wb = XLSX.utils.book_new();
    // Summary sheet: by project
    const empByProject = new Map<string, Emp[]>();
    workforce.forEach((e) => {
      const key = e.projectId ?? "Unassigned";
      const arr = empByProject.get(key) ?? [];
      arr.push(e);
      empByProject.set(key, arr);
    });
    const summary: Record<string, string | number>[] = [];
    empByProject.forEach((list, pid) => {
      summary.push({
        Project: pid,
        Employees: list.length,
        "Total Leaves": list.reduce((s, e) => s + (e.totalLeaves ?? 0), 0),
        "Used Leaves": list.reduce((s, e) => s + (e.usedLeaves ?? 0), 0),
        "Remaining Leaves": list.reduce((s, e) => s + ((e.totalLeaves ?? 0) - (e.usedLeaves ?? 0)), 0),
      });
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Summary");

    const attByProject = new Map<string, Att[]>();
    allAttendance.forEach((a) => {
      const key = a.projectId ?? "Unassigned";
      const arr = attByProject.get(key) ?? [];
      arr.push(a);
      attByProject.set(key, arr);
    });
    const empById = new Map(employees.map((e) => [e.id, e]));
    attByProject.forEach((list, pid) => {
      const rows = list.map((a) => {
        const e = empById.get(a.uid);
        return {
          Date: a.date,
          EmployeeID: e?.employeeID ?? a.uid,
          Name: e?.name ?? "",
          Email: e?.email ?? "",
          Project: pid,
        };
      });
      const name = pid.substring(0, 28) || "Unassigned";
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
    });
    XLSX.writeFile(wb, `attendance-by-project-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {isSuper ? "Super Admin — all projects" : `Admin of ${adminProjectIds.length} project${adminProjectIds.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ProjectPicker projects={projects} value={activeProjectId} onChange={setActiveProjectId} />
          <Button size="sm" variant="outline" onClick={reconcileLeaves}>Reconcile Leaves</Button>
          <Button size="sm" variant="secondary" onClick={downloadProjectWise}>
            <Download className="mr-1 h-4 w-4" /> Project Excel
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat icon={<Users className="h-5 w-5" />} label="Employees" value={workforce.length} />
        <Stat icon={<CalendarCheck className="h-5 w-5" />} label="Punched in today" value={attendanceToday.size} />
        <button onClick={() => setShowUnpunched(true)} className="text-left">
          <Card className="h-full transition hover:bg-accent">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="rounded-full bg-destructive/10 p-3 text-destructive"><UserX className="h-5 w-5" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Not punched today</p>
                <p className="text-2xl font-bold">{unpunched.length}</p>
              </div>
            </CardContent>
          </Card>
        </button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Employees</CardTitle>
            <CardDescription>{activeProjectId ? `Project: ${activeProjectId}` : "Across all your projects"}</CardDescription>
          </div>
          <Link to="/admin/employees"><Button size="sm">Manage</Button></Link>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : employees.length === 0 ? (
            <p className="text-sm text-muted-foreground">No employees yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-2">ID</th><th className="p-2">Name</th><th className="p-2">Project</th>
                    <th className="p-2">Remaining Leaves</th><th className="p-2">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((e) => (
                    <tr key={e.id} className="border-t">
                      <td className="p-2 font-mono text-xs">{e.employeeID}</td>
                      <td className="p-2">{e.name}</td>
                      <td className="p-2 text-xs">{e.projectId ?? "—"}</td>
                      <td className="p-2">
                        <Badge variant={(e.totalLeaves ?? 0) - (e.usedLeaves ?? 0) <= 0 ? "destructive" : "secondary"}>
                          {(e.totalLeaves ?? 0) - (e.usedLeaves ?? 0)} / {e.totalLeaves ?? 0}
                        </Badge>
                      </td>
                      <td className="p-2"><Badge variant={e.role === "admin" || e.role === "superadmin" ? "default" : "secondary"}>{e.role}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Leave & WFH Requests</CardTitle>
            <CardDescription>Manage employee leave and work from home requests</CardDescription>
          </div>
          <Link to="/admin/requests"><Button size="sm">Manage</Button></Link>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Review and approve pending leave and WFH requests from employees.</p>
        </CardContent>
      </Card>

      <Dialog open={showUnpunched} onOpenChange={setShowUnpunched}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Not punched today ({unpunched.length})</DialogTitle>
          </DialogHeader>
          {unpunched.length === 0 ? (
            <p className="text-sm text-muted-foreground">Everyone has punched in. 🎉</p>
          ) : (
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="p-2">ID</th><th className="p-2">Name</th><th className="p-2">Email</th><th className="p-2">Project</th></tr>
                </thead>
                <tbody>
                  {unpunched.map((e) => (
                    <tr key={e.id} className="border-t">
                      <td className="p-2 font-mono text-xs">{e.employeeID}</td>
                      <td className="p-2">{e.name}</td>
                      <td className="p-2 text-xs">{e.email}</td>
                      <td className="p-2 text-xs">{e.projectId ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-6">
        <div className="rounded-full bg-primary/10 p-3 text-primary">{icon}</div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

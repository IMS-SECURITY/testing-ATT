import { jsx, jsxs } from "react/jsx-runtime";
import { Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { R as RequireAuth } from "./RequireAuth-BnkDJcWl.js";
import { B as Button, C as Card, d as CardContent, a as CardHeader, b as CardTitle, c as CardDescription } from "./card-BXMydX4U.js";
import { B as Badge } from "./badge-Cjy_ry0J.js";
import { D as Dialog, a as DialogContent, b as DialogHeader, c as DialogTitle } from "./dialog-BXiTal8K.js";
import { u as useAuth, d as db } from "./router-B753KT4Y.js";
import { getDocs, collection, query, where, updateDoc, doc } from "firebase/firestore";
import { Download, Users, CalendarCheck, UserX } from "lucide-react";
import { format, subDays, getDay } from "date-fns";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { u as useAvailableProjects, P as ProjectPicker } from "./ProjectPicker-gRdGcCKW.js";
import "@radix-ui/react-slot";
import "class-variance-authority";
import "clsx";
import "tailwind-merge";
import "@radix-ui/react-dialog";
import "@tanstack/react-query";
import "firebase/auth";
import "firebase/app";
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
function AdminDashboard() {
  const {
    profile,
    activeProjectId,
    setActiveProjectId,
    adminProjectIds
  } = useAuth();
  const isSuper = profile?.role === "superadmin";
  const {
    projects
  } = useAvailableProjects();
  const [employees, setEmployees] = useState([]);
  const [attendanceToday, setAttendanceToday] = useState(/* @__PURE__ */ new Set());
  const [allAttendance, setAllAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUnpunched, setShowUnpunched] = useState(false);
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const scopeIds = activeProjectId ? [activeProjectId] : isSuper ? [] : adminProjectIds;
        const empSnaps = await Promise.all(isSuper && scopeIds.length === 0 ? [getDocs(collection(db, "employees"))] : [...chunk(scopeIds, 10).map((ids) => getDocs(query(collection(db, "employees"), where("projectIds", "array-contains-any", ids)))), ...chunk(scopeIds, 30).map((ids) => getDocs(query(collection(db, "employees"), where("projectId", "in", ids))))]);
        const attSnaps = await Promise.all(isSuper && scopeIds.length === 0 ? [getDocs(collection(db, "attendance"))] : chunk(scopeIds, 30).map((ids) => getDocs(query(collection(db, "attendance"), where("projectId", "in", ids)))));
        const empMap = /* @__PURE__ */ new Map();
        empSnaps.flatMap((s) => s.docs).forEach((d) => empMap.set(d.id, {
          id: d.id,
          ...d.data()
        }));
        const emps = Array.from(empMap.values());
        const atts = attSnaps.flatMap((s) => s.docs.map((d) => {
          const x = d.data();
          return {
            uid: x.uid,
            date: x.date,
            projectId: x.projectId ?? null,
            projectName: x.projectName ?? null,
            status: x.status
          };
        }));
        setEmployees(emps);
        setAllAttendance(atts);
        const today = format(/* @__PURE__ */ new Date(), "yyyy-MM-dd");
        setAttendanceToday(new Set(atts.filter((a) => a.date === today && a.status !== "on_duty").map((a) => a.uid)));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [isSuper, activeProjectId, adminProjectIds.join("|")]);
  const workforce = useMemo(() => employees.filter((e) => e.role === "employee"), [employees]);
  const unpunched = useMemo(() => workforce.filter((e) => !attendanceToday.has(e.id)), [workforce, attendanceToday]);
  const reconcileLeaves = async () => {
    const days = [];
    for (let i = 1; i <= 30; i++) {
      const d = subDays(/* @__PURE__ */ new Date(), i);
      const dow = getDay(d);
      if (dow === 0 || dow === 6) continue;
      days.push(format(d, "yyyy-MM-dd"));
    }
    const presentMap = /* @__PURE__ */ new Map();
    allAttendance.forEach((a) => {
      const s = presentMap.get(a.uid) ?? /* @__PURE__ */ new Set();
      s.add(a.date);
      presentMap.set(a.uid, s);
    });
    let updated = 0;
    for (const emp of workforce) {
      const present = presentMap.get(emp.id) ?? /* @__PURE__ */ new Set();
      const absent = days.filter((d) => !present.has(d)).length;
      if ((emp.usedLeaves ?? -1) !== absent) {
        try {
          await updateDoc(doc(db, "employees", emp.id), {
            usedLeaves: absent
          });
          updated++;
        } catch (e) {
          console.error(e);
        }
      }
    }
    toast.success(`Reconciled leaves for ${updated} employees`);
    setEmployees((prev) => prev.map((e) => {
      if (e.role !== "employee") return e;
      const present = presentMap.get(e.id) ?? /* @__PURE__ */ new Set();
      const absent = days.filter((d) => !present.has(d)).length;
      return {
        ...e,
        usedLeaves: absent
      };
    }));
  };
  const downloadProjectWise = () => {
    const wb = XLSX.utils.book_new();
    const empByProject = /* @__PURE__ */ new Map();
    workforce.forEach((e) => {
      const key = e.projectId ?? "Unassigned";
      const arr = empByProject.get(key) ?? [];
      arr.push(e);
      empByProject.set(key, arr);
    });
    const summary = [];
    empByProject.forEach((list, pid) => {
      summary.push({
        Project: pid,
        Employees: list.length,
        "Total Leaves": list.reduce((s, e) => s + (e.totalLeaves ?? 0), 0),
        "Used Leaves": list.reduce((s, e) => s + (e.usedLeaves ?? 0), 0),
        "Remaining Leaves": list.reduce((s, e) => s + ((e.totalLeaves ?? 0) - (e.usedLeaves ?? 0)), 0)
      });
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Summary");
    const attByProject = /* @__PURE__ */ new Map();
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
          Project: pid
        };
      });
      const name = pid.substring(0, 28) || "Unassigned";
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
    });
    XLSX.writeFile(wb, `attendance-by-project-${format(/* @__PURE__ */ new Date(), "yyyy-MM-dd")}.xlsx`);
  };
  return /* @__PURE__ */ jsxs("div", { className: "space-y-6", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-end justify-between gap-3", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h1", { className: "text-2xl font-bold", children: "Admin Dashboard" }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground", children: isSuper ? "Super Admin — all projects" : `Admin of ${adminProjectIds.length} project${adminProjectIds.length === 1 ? "" : "s"}` })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
        /* @__PURE__ */ jsx(ProjectPicker, { projects, value: activeProjectId, onChange: setActiveProjectId }),
        /* @__PURE__ */ jsx(Button, { size: "sm", variant: "outline", onClick: reconcileLeaves, children: "Reconcile Leaves" }),
        /* @__PURE__ */ jsxs(Button, { size: "sm", variant: "secondary", onClick: downloadProjectWise, children: [
          /* @__PURE__ */ jsx(Download, { className: "mr-1 h-4 w-4" }),
          " Project Excel"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid gap-4 sm:grid-cols-2 lg:grid-cols-3", children: [
      /* @__PURE__ */ jsx(Stat, { icon: /* @__PURE__ */ jsx(Users, { className: "h-5 w-5" }), label: "Employees", value: workforce.length }),
      /* @__PURE__ */ jsx(Stat, { icon: /* @__PURE__ */ jsx(CalendarCheck, { className: "h-5 w-5" }), label: "Punched in today", value: attendanceToday.size }),
      /* @__PURE__ */ jsx("button", { onClick: () => setShowUnpunched(true), className: "text-left", children: /* @__PURE__ */ jsx(Card, { className: "h-full transition hover:bg-accent", children: /* @__PURE__ */ jsxs(CardContent, { className: "flex items-center gap-4 p-6", children: [
        /* @__PURE__ */ jsx("div", { className: "rounded-full bg-destructive/10 p-3 text-destructive", children: /* @__PURE__ */ jsx(UserX, { className: "h-5 w-5" }) }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground", children: "Not punched today" }),
          /* @__PURE__ */ jsx("p", { className: "text-2xl font-bold", children: unpunched.length })
        ] })
      ] }) }) })
    ] }),
    /* @__PURE__ */ jsxs(Card, { children: [
      /* @__PURE__ */ jsxs(CardHeader, { className: "flex flex-row items-center justify-between", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx(CardTitle, { children: "Employees" }),
          /* @__PURE__ */ jsx(CardDescription, { children: activeProjectId ? `Project: ${activeProjectId}` : "Across all your projects" })
        ] }),
        /* @__PURE__ */ jsx(Link, { to: "/admin/employees", children: /* @__PURE__ */ jsx(Button, { size: "sm", children: "Manage" }) })
      ] }),
      /* @__PURE__ */ jsx(CardContent, { children: loading ? /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground", children: "Loading…" }) : employees.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground", children: "No employees yet." }) : /* @__PURE__ */ jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxs("table", { className: "w-full text-sm", children: [
        /* @__PURE__ */ jsx("thead", { className: "text-left text-xs uppercase text-muted-foreground", children: /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("th", { className: "p-2", children: "ID" }),
          /* @__PURE__ */ jsx("th", { className: "p-2", children: "Name" }),
          /* @__PURE__ */ jsx("th", { className: "p-2", children: "Project" }),
          /* @__PURE__ */ jsx("th", { className: "p-2", children: "Remaining Leaves" }),
          /* @__PURE__ */ jsx("th", { className: "p-2", children: "Role" })
        ] }) }),
        /* @__PURE__ */ jsx("tbody", { children: employees.map((e) => /* @__PURE__ */ jsxs("tr", { className: "border-t", children: [
          /* @__PURE__ */ jsx("td", { className: "p-2 font-mono text-xs", children: e.employeeID }),
          /* @__PURE__ */ jsx("td", { className: "p-2", children: e.name }),
          /* @__PURE__ */ jsx("td", { className: "p-2 text-xs", children: e.projectId ?? "—" }),
          /* @__PURE__ */ jsx("td", { className: "p-2", children: /* @__PURE__ */ jsxs(Badge, { variant: (e.totalLeaves ?? 0) - (e.usedLeaves ?? 0) <= 0 ? "destructive" : "secondary", children: [
            (e.totalLeaves ?? 0) - (e.usedLeaves ?? 0),
            " / ",
            e.totalLeaves ?? 0
          ] }) }),
          /* @__PURE__ */ jsx("td", { className: "p-2", children: /* @__PURE__ */ jsx(Badge, { variant: e.role === "admin" || e.role === "superadmin" ? "default" : "secondary", children: e.role }) })
        ] }, e.id)) })
      ] }) }) })
    ] }),
    /* @__PURE__ */ jsx(Dialog, { open: showUnpunched, onOpenChange: setShowUnpunched, children: /* @__PURE__ */ jsxs(DialogContent, { className: "max-w-2xl", children: [
      /* @__PURE__ */ jsx(DialogHeader, { children: /* @__PURE__ */ jsxs(DialogTitle, { children: [
        "Not punched today (",
        unpunched.length,
        ")"
      ] }) }),
      unpunched.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground", children: "Everyone has punched in. 🎉" }) : /* @__PURE__ */ jsx("div", { className: "max-h-96 overflow-auto", children: /* @__PURE__ */ jsxs("table", { className: "w-full text-sm", children: [
        /* @__PURE__ */ jsx("thead", { className: "text-left text-xs uppercase text-muted-foreground", children: /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("th", { className: "p-2", children: "ID" }),
          /* @__PURE__ */ jsx("th", { className: "p-2", children: "Name" }),
          /* @__PURE__ */ jsx("th", { className: "p-2", children: "Email" }),
          /* @__PURE__ */ jsx("th", { className: "p-2", children: "Project" })
        ] }) }),
        /* @__PURE__ */ jsx("tbody", { children: unpunched.map((e) => /* @__PURE__ */ jsxs("tr", { className: "border-t", children: [
          /* @__PURE__ */ jsx("td", { className: "p-2 font-mono text-xs", children: e.employeeID }),
          /* @__PURE__ */ jsx("td", { className: "p-2", children: e.name }),
          /* @__PURE__ */ jsx("td", { className: "p-2 text-xs", children: e.email }),
          /* @__PURE__ */ jsx("td", { className: "p-2 text-xs", children: e.projectId ?? "—" })
        ] }, e.id)) })
      ] }) })
    ] }) })
  ] });
}
function Stat({
  icon,
  label,
  value
}) {
  return /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsxs(CardContent, { className: "flex items-center gap-4 p-6", children: [
    /* @__PURE__ */ jsx("div", { className: "rounded-full bg-primary/10 p-3 text-primary", children: icon }),
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground", children: label }),
      /* @__PURE__ */ jsx("p", { className: "text-2xl font-bold", children: value })
    ] })
  ] }) });
}
const SplitComponent = () => /* @__PURE__ */ jsx(RequireAuth, { role: "staff", children: /* @__PURE__ */ jsx(AdminDashboard, {}) });
export {
  SplitComponent as component
};

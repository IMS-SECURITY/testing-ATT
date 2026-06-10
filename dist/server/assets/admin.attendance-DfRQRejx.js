import { jsx, jsxs } from "react/jsx-runtime";
import { useState, useEffect, useMemo } from "react";
import { R as RequireAuth } from "./RequireAuth-BnkDJcWl.js";
import { B as Button, C as Card, d as CardContent } from "./card-BXMydX4U.js";
import { L as Label, I as Input } from "./label-DGkNwAzF.js";
import { D as Dialog, a as DialogContent, b as DialogHeader, c as DialogTitle, d as DialogFooter } from "./dialog-BXiTal8K.js";
import { A as AlertDialog, a as AlertDialogTrigger, b as AlertDialogContent, c as AlertDialogHeader, d as AlertDialogTitle, e as AlertDialogDescription, f as AlertDialogFooter, g as AlertDialogCancel, h as AlertDialogAction } from "./alert-dialog-DNvj5fDK.js";
import { u as useAuth, d as db } from "./router-B753KT4Y.js";
import { getDocs, collection, query, where, deleteDoc, doc, updateDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import * as XLSX from "xlsx";
import { Download, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { u as useAvailableProjects, P as ProjectPicker } from "./ProjectPicker-gRdGcCKW.js";
import "@tanstack/react-router";
import "@radix-ui/react-slot";
import "class-variance-authority";
import "clsx";
import "tailwind-merge";
import "@radix-ui/react-label";
import "@radix-ui/react-dialog";
import "@radix-ui/react-alert-dialog";
import "@tanstack/react-query";
import "firebase/auth";
import "firebase/app";
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
function AttendancePage() {
  const {
    profile,
    activeProjectId,
    setActiveProjectId,
    adminProjectIds
  } = useAuth();
  const isSuper = profile?.role === "superadmin";
  const isAdmin = profile?.role === "admin" || isSuper;
  const {
    projects
  } = useAvailableProjects();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("day");
  const [anchor, setAnchor] = useState(() => format(/* @__PURE__ */ new Date(), "yyyy-MM-dd"));
  const [empFilter, setEmpFilter] = useState("");
  const [groupByProject, setGroupByProject] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      const scopeIds = activeProjectId ? [activeProjectId] : isSuper ? [] : adminProjectIds;
      const snaps = await Promise.all(isSuper && scopeIds.length === 0 ? [getDocs(collection(db, "attendance"))] : chunk(scopeIds, 30).map((ids) => getDocs(query(collection(db, "attendance"), where("projectId", "in", ids)))));
      const list = snaps.flatMap((s) => s.docs.map((d) => ({
        id: d.id,
        ...d.data()
      })));
      list.sort((a, b) => a.date < b.date ? 1 : -1);
      setRows(list);
    } catch (e) {
      toast.error((e instanceof Error ? e.message : "Failed to load") + " — make sure the latest firestore.rules are Published in the Firebase Console.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, [activeProjectId, isSuper, adminProjectIds.join("|")]);
  const filtered = useMemo(() => {
    const a = /* @__PURE__ */ new Date(anchor + "T00:00:00");
    let from = "", to = "";
    if (range === "day") {
      from = to = anchor;
    } else if (range === "week") {
      from = format(startOfWeek(a, {
        weekStartsOn: 1
      }), "yyyy-MM-dd");
      to = format(endOfWeek(a, {
        weekStartsOn: 1
      }), "yyyy-MM-dd");
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
  const toExportRows = (list) => list.map((r) => ({
    EmployeeID: r.employeeID,
    Name: r.name,
    Email: r.email,
    Project: r.projectId ?? "",
    Date: r.date,
    "Punch In": r.time,
    "Punch Out": r.punchOutTime ?? "",
    "In Latitude": r.lat,
    "In Longitude": r.lng,
    "Out Latitude": r.punchOutLat ?? "",
    "Out Longitude": r.punchOutLng ?? ""
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
    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-${range}-${anchor}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const exportProjectWiseXlsx = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toExportRows(filtered)), "All");
    const byProject = /* @__PURE__ */ new Map();
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
  const remove = async (r) => {
    await deleteDoc(doc(db, "attendance", r.id));
    toast.success("Entry deleted");
    await load();
  };
  return /* @__PURE__ */ jsxs("div", { className: "space-y-6", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-end justify-between gap-3", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h1", { className: "text-2xl font-bold", children: "Attendance" }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground", children: "Filter, correct, and export by project." })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-2", children: [
        /* @__PURE__ */ jsx(ProjectPicker, { projects, value: activeProjectId, onChange: setActiveProjectId }),
        /* @__PURE__ */ jsxs(Button, { variant: "outline", size: "sm", onClick: exportCsv, children: [
          /* @__PURE__ */ jsx(Download, { className: "mr-1 h-4 w-4" }),
          " CSV"
        ] }),
        /* @__PURE__ */ jsxs(Button, { variant: "outline", size: "sm", onClick: exportXlsx, children: [
          /* @__PURE__ */ jsx(Download, { className: "mr-1 h-4 w-4" }),
          " Excel"
        ] }),
        isAdmin && /* @__PURE__ */ jsxs(Button, { variant: "secondary", size: "sm", onClick: exportProjectWiseXlsx, children: [
          /* @__PURE__ */ jsx(Download, { className: "mr-1 h-4 w-4" }),
          " Project-wise Excel"
        ] }),
        isAdmin && /* @__PURE__ */ jsxs(Button, { size: "sm", onClick: () => setNewOpen(true), children: [
          /* @__PURE__ */ jsx(Plus, { className: "mr-1 h-4 w-4" }),
          " Add entry"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsxs(CardContent, { className: "space-y-3 p-4", children: [
      /* @__PURE__ */ jsxs("div", { className: "grid gap-3 sm:grid-cols-4", children: [
        /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsx(Label, { children: "Range" }),
          /* @__PURE__ */ jsxs("select", { className: "h-9 w-full rounded-md border bg-background px-2 text-sm", value: range, onChange: (e) => setRange(e.target.value), children: [
            /* @__PURE__ */ jsx("option", { value: "day", children: "Day" }),
            /* @__PURE__ */ jsx("option", { value: "week", children: "Week" }),
            /* @__PURE__ */ jsx("option", { value: "month", children: "Month" }),
            /* @__PURE__ */ jsx("option", { value: "all", children: "All" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsx(Label, { children: "Reference date" }),
          /* @__PURE__ */ jsx(Input, { type: "date", value: anchor, onChange: (e) => setAnchor(e.target.value), disabled: range === "all" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-1.5 sm:col-span-2", children: [
          /* @__PURE__ */ jsx(Label, { children: "Search employee" }),
          /* @__PURE__ */ jsx(Input, { placeholder: "Name or ID…", value: empFilter, onChange: (e) => setEmpFilter(e.target.value) })
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-2 pt-1", children: /* @__PURE__ */ jsx(Button, { size: "sm", variant: groupByProject ? "default" : "outline", onClick: () => setGroupByProject((v) => !v), children: groupByProject ? "Ungroup" : "Group by project" }) })
    ] }) }),
    /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsx(CardContent, { className: "p-0", children: loading ? /* @__PURE__ */ jsx("p", { className: "p-6 text-sm text-muted-foreground", children: "Loading…" }) : /* @__PURE__ */ jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxs("table", { className: "w-full text-sm", children: [
      /* @__PURE__ */ jsx("thead", { className: "bg-muted/50 text-left text-xs uppercase text-muted-foreground", children: /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("th", { className: "p-3", children: "Date" }),
        /* @__PURE__ */ jsx("th", { className: "p-3", children: "In" }),
        /* @__PURE__ */ jsx("th", { className: "p-3", children: "Out" }),
        /* @__PURE__ */ jsx("th", { className: "p-3", children: "Employee" }),
        /* @__PURE__ */ jsx("th", { className: "p-3", children: "ID" }),
        /* @__PURE__ */ jsx("th", { className: "p-3", children: "Project" }),
        /* @__PURE__ */ jsx("th", { className: "p-3", children: "Location" }),
        /* @__PURE__ */ jsx("th", { className: "p-3 text-right", children: "Actions" })
      ] }) }),
      /* @__PURE__ */ jsxs("tbody", { children: [
        (() => {
          const groups = groupByProject ? Array.from(filtered.reduce((m, r) => {
            const k = r.projectId ?? "Unassigned";
            const arr = m.get(k) ?? [];
            arr.push(r);
            m.set(k, arr);
            return m;
          }, /* @__PURE__ */ new Map()).entries()).map(([key, list]) => ({
            key,
            list
          })) : [{
            key: "",
            list: filtered
          }];
          return groups.flatMap((g) => [...groupByProject ? [/* @__PURE__ */ jsx("tr", { className: "bg-muted/30", children: /* @__PURE__ */ jsxs("td", { colSpan: 8, className: "p-2 text-xs font-semibold uppercase text-muted-foreground", children: [
            g.key,
            " — ",
            g.list.length
          ] }) }, `g-${g.key}`)] : [], ...g.list.map((r) => /* @__PURE__ */ jsxs("tr", { className: "border-t", children: [
            /* @__PURE__ */ jsx("td", { className: "p-3", children: r.date }),
            /* @__PURE__ */ jsx("td", { className: "p-3 font-mono", children: r.status === "on_duty" ? /* @__PURE__ */ jsxs("span", { className: "rounded bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700", children: [
              "On Duty",
              r.onDutyAtName ? ` @ ${r.onDutyAtName}` : ""
            ] }) : r.time }),
            /* @__PURE__ */ jsx("td", { className: "p-3 font-mono", children: r.status === "on_duty" ? "—" : r.punchOutTime ?? /* @__PURE__ */ jsx("span", { className: "text-muted-foreground", children: "—" }) }),
            /* @__PURE__ */ jsx("td", { className: "p-3", children: r.name }),
            /* @__PURE__ */ jsx("td", { className: "p-3 font-mono text-xs", children: r.employeeID }),
            /* @__PURE__ */ jsx("td", { className: "p-3 text-xs", children: r.projectId ?? /* @__PURE__ */ jsx("span", { className: "text-muted-foreground", children: "—" }) }),
            /* @__PURE__ */ jsxs("td", { className: "p-3 text-xs text-muted-foreground", children: [
              r.lat?.toFixed(5),
              ", ",
              r.lng?.toFixed(5)
            ] }),
            /* @__PURE__ */ jsx("td", { className: "p-3", children: /* @__PURE__ */ jsxs("div", { className: "flex justify-end gap-1", children: [
              /* @__PURE__ */ jsx(Button, { size: "sm", variant: "ghost", onClick: () => {
                setEditing(r);
                setEditOpen(true);
              }, children: /* @__PURE__ */ jsx(Pencil, { className: "h-4 w-4" }) }),
              /* @__PURE__ */ jsxs(AlertDialog, { children: [
                /* @__PURE__ */ jsx(AlertDialogTrigger, { asChild: true, children: /* @__PURE__ */ jsx(Button, { size: "sm", variant: "ghost", children: /* @__PURE__ */ jsx(Trash2, { className: "h-4 w-4 text-destructive" }) }) }),
                /* @__PURE__ */ jsxs(AlertDialogContent, { children: [
                  /* @__PURE__ */ jsxs(AlertDialogHeader, { children: [
                    /* @__PURE__ */ jsx(AlertDialogTitle, { children: "Delete entry?" }),
                    /* @__PURE__ */ jsx(AlertDialogDescription, { children: "This action cannot be undone." })
                  ] }),
                  /* @__PURE__ */ jsxs(AlertDialogFooter, { children: [
                    /* @__PURE__ */ jsx(AlertDialogCancel, { children: "Cancel" }),
                    /* @__PURE__ */ jsx(AlertDialogAction, { onClick: () => remove(r), children: "Delete" })
                  ] })
                ] })
              ] })
            ] }) })
          ] }, r.id))]);
        })(),
        filtered.length === 0 && /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", { colSpan: 8, className: "p-6 text-center text-muted-foreground", children: "No records" }) })
      ] })
    ] }) }) }) }),
    /* @__PURE__ */ jsx(EditDialog, { open: editOpen, onOpenChange: setEditOpen, row: editing, onSaved: load }),
    /* @__PURE__ */ jsx(NewDialog, { open: newOpen, onOpenChange: setNewOpen, onSaved: load })
  ] });
}
function EditDialog({
  open,
  onOpenChange,
  row,
  onSaved
}) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (row) {
      setDate(row.date);
      setTime(row.time);
    }
  }, [row]);
  const save = async (e) => {
    e.preventDefault();
    if (!row) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, "attendance", row.id), {
        date,
        time
      });
      toast.success("Entry corrected");
      onOpenChange(false);
      onSaved();
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsx(Dialog, { open, onOpenChange, children: /* @__PURE__ */ jsxs(DialogContent, { children: [
    /* @__PURE__ */ jsx(DialogHeader, { children: /* @__PURE__ */ jsx(DialogTitle, { children: "Correct entry" }) }),
    /* @__PURE__ */ jsxs("form", { onSubmit: save, className: "space-y-3", children: [
      /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsx(Label, { children: "Date" }),
        /* @__PURE__ */ jsx(Input, { type: "date", value: date, onChange: (e) => setDate(e.target.value), required: true })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsx(Label, { children: "Time (HH:MM:SS)" }),
        /* @__PURE__ */ jsx(Input, { type: "time", step: 1, value: time, onChange: (e) => setTime(e.target.value), required: true })
      ] }),
      /* @__PURE__ */ jsxs(DialogFooter, { children: [
        /* @__PURE__ */ jsx(Button, { type: "button", variant: "outline", onClick: () => onOpenChange(false), children: "Cancel" }),
        /* @__PURE__ */ jsx(Button, { type: "submit", disabled: busy, children: busy ? "Saving…" : "Save" })
      ] })
    ] })
  ] }) });
}
function NewDialog({
  open,
  onOpenChange,
  onSaved
}) {
  const {
    activeProjectId
  } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [empId, setEmpId] = useState("");
  const [date, setDate] = useState(format(/* @__PURE__ */ new Date(), "yyyy-MM-dd"));
  const [time, setTime] = useState(format(/* @__PURE__ */ new Date(), "HH:mm:ss"));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open || !activeProjectId) return;
    getDocs(query(collection(db, "employees"), where("projectId", "==", activeProjectId), where("role", "==", "employee"))).then((s) => {
      setEmployees(s.docs.map((d) => ({
        id: d.id,
        ...d.data()
      })));
    });
  }, [open, activeProjectId]);
  const save = async (e) => {
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
        date,
        time,
        lat: emp.officeLat,
        lng: emp.officeLng,
        manual: true,
        createdAt: serverTimestamp()
      });
      toast.success("Entry added");
      onOpenChange(false);
      onSaved();
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsx(Dialog, { open, onOpenChange, children: /* @__PURE__ */ jsxs(DialogContent, { children: [
    /* @__PURE__ */ jsx(DialogHeader, { children: /* @__PURE__ */ jsx(DialogTitle, { children: "Add manual entry" }) }),
    !activeProjectId ? /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground", children: "Select a project from the picker first." }) : /* @__PURE__ */ jsxs("form", { onSubmit: save, className: "space-y-3", children: [
      /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsx(Label, { children: "Employee" }),
        /* @__PURE__ */ jsxs("select", { className: "h-9 w-full rounded-md border bg-background px-2 text-sm", value: empId, onChange: (e) => setEmpId(e.target.value), required: true, children: [
          /* @__PURE__ */ jsx("option", { value: "", children: "Select…" }),
          employees.map((e) => /* @__PURE__ */ jsxs("option", { value: e.id, children: [
            e.name,
            " (",
            e.employeeID,
            ")"
          ] }, e.id))
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
        /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsx(Label, { children: "Date" }),
          /* @__PURE__ */ jsx(Input, { type: "date", value: date, onChange: (e) => setDate(e.target.value), required: true })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsx(Label, { children: "Time" }),
          /* @__PURE__ */ jsx(Input, { type: "time", step: 1, value: time, onChange: (e) => setTime(e.target.value), required: true })
        ] })
      ] }),
      /* @__PURE__ */ jsxs(DialogFooter, { children: [
        /* @__PURE__ */ jsx(Button, { type: "button", variant: "outline", onClick: () => onOpenChange(false), children: "Cancel" }),
        /* @__PURE__ */ jsx(Button, { type: "submit", disabled: busy, children: busy ? "Saving…" : "Save" })
      ] })
    ] })
  ] }) });
}
const SplitComponent = () => /* @__PURE__ */ jsx(RequireAuth, { role: "staff", children: /* @__PURE__ */ jsx(AttendancePage, {}) });
export {
  SplitComponent as component
};

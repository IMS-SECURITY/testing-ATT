import { jsx, jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { R as RequireAuth } from "./RequireAuth-BnkDJcWl.js";
import { B as Button, C as Card, d as CardContent } from "./card-BXMydX4U.js";
import { L as Label, I as Input } from "./label-DGkNwAzF.js";
import { B as Badge } from "./badge-Cjy_ry0J.js";
import { D as Dialog, a as DialogContent, b as DialogHeader, c as DialogTitle, e as DialogDescription, d as DialogFooter } from "./dialog-BXiTal8K.js";
import { A as AlertDialog, a as AlertDialogTrigger, b as AlertDialogContent, c as AlertDialogHeader, d as AlertDialogTitle, e as AlertDialogDescription, f as AlertDialogFooter, g as AlertDialogCancel, h as AlertDialogAction } from "./alert-dialog-DNvj5fDK.js";
import { d as db, u as useAuth, a as auth } from "./router-B753KT4Y.js";
import { runTransaction, serverTimestamp, doc, getDocs, collection, query, where, deleteDoc, updateDoc, setDoc } from "firebase/firestore";
import { l as loadAllOffices, a as createAuthUser } from "./offices-BsXaHCwV.js";
import { toast } from "sonner";
import { Plus, Pencil, KeyRound, Trash2, X } from "lucide-react";
import { sendPasswordResetEmail } from "firebase/auth";
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
import "firebase/app";
const COUNTER_REF = doc(db, "meta", "employeeCounter");
async function nextEmployeeId() {
  const id = await runTransaction(db, async (tx) => {
    const snap = await tx.get(COUNTER_REF);
    const next = snap.exists() ? snap.data().next : 1;
    tx.set(COUNTER_REF, { next: next + 1, updatedAt: serverTimestamp() }, { merge: true });
    return `EMP${String(next).padStart(3, "0")}`;
  });
  return id;
}
const emptyForm = {
  employeeID: "",
  name: "",
  email: "",
  password: "",
  role: "employee",
  totalLeaves: "12",
  branches: "",
  assignments: []
};
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
function deriveAssignments(r) {
  if (r.assignments && r.assignments.length > 0) return r.assignments;
  if (r.projectId) {
    return [{
      projectId: r.projectId,
      projectName: r.projectName ?? r.projectId,
      officeLat: r.officeLat ?? 0,
      officeLng: r.officeLng ?? 0
    }];
  }
  return [];
}
function EmployeesPage() {
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
  const [rows, setRows] = useState([]);
  const [offices, setOffices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const canEdit = isSuper || profile?.role === "admin";
  const load = async () => {
    setLoading(true);
    try {
      const scopeIds = activeProjectId ? [activeProjectId] : isSuper ? [] : adminProjectIds;
      if (isSuper && scopeIds.length === 0) {
        const s = await getDocs(collection(db, "employees"));
        setRows(s.docs.map((d) => ({
          id: d.id,
          ...d.data()
        })));
      } else {
        const snaps = await Promise.all([...chunk(scopeIds, 10).map((ids) => getDocs(query(collection(db, "employees"), where("projectIds", "array-contains-any", ids)))), ...chunk(scopeIds, 30).map((ids) => getDocs(query(collection(db, "employees"), where("projectId", "in", ids))))]);
        const byId = /* @__PURE__ */ new Map();
        snaps.flatMap((s) => s.docs).forEach((d) => {
          byId.set(d.id, {
            id: d.id,
            ...d.data()
          });
        });
        setRows(Array.from(byId.values()));
      }
    } catch (e) {
      toast.error((e instanceof Error ? e.message : "Failed to load") + " — make sure the latest firestore.rules are Published in the Firebase Console.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, [activeProjectId, isSuper, adminProjectIds.join("|")]);
  useEffect(() => {
    loadAllOffices().then(setOffices).catch(() => toast.error("Failed to load office locations"));
  }, []);
  const officesForProject = (projectId) => offices.filter((o) => o.projectId === projectId);
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
      newId = await nextEmployeeId();
    } catch {
      toast.error("Failed to generate employee ID");
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
        officeLng: firstOffice.lng
      }]
    });
    setOpen(true);
  };
  const openEdit = (r) => {
    setEditing(r);
    setForm({
      employeeID: r.employeeID,
      name: r.name,
      email: r.email,
      password: "",
      role: r.role === "superadmin" ? "admin" : r.role,
      totalLeaves: String(r.totalLeaves ?? 12),
      branches: (r.branches ?? []).join(", "),
      assignments: deriveAssignments(r)
    });
    setOpen(true);
  };
  const addAssignmentRow = () => {
    setForm((f) => ({
      ...f,
      assignments: [...f.assignments, {
        projectId: "",
        projectName: "",
        officeId: "",
        officeName: "",
        officeLat: 0,
        officeLng: 0
      }]
    }));
  };
  const updateAssignment = (idx, patch) => {
    setForm((f) => ({
      ...f,
      assignments: f.assignments.map((a, i) => {
        if (i !== idx) return a;
        const merged = {
          ...a,
          ...patch
        };
        if (patch.projectId !== void 0) {
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
        if (patch.officeId !== void 0) {
          const office = offices.find((o) => o.id === patch.officeId);
          if (office) {
            merged.officeName = office.name;
            merged.officeLat = office.lat;
            merged.officeLng = office.lng;
          }
        }
        return merged;
      })
    }));
  };
  const removeAssignment = (idx) => {
    setForm((f) => ({
      ...f,
      assignments: f.assignments.filter((_, i) => i !== idx)
    }));
  };
  const save = async (e) => {
    e.preventDefault();
    const cleaned = form.assignments.filter((a) => a.projectId.trim()).map((a) => ({
      projectId: a.projectId.trim(),
      projectName: (a.projectName || a.projectId).trim(),
      officeId: a.officeId || void 0,
      officeName: a.officeName || void 0,
      officeLat: Number(a.officeLat),
      officeLng: Number(a.officeLng)
    }));
    if (cleaned.length === 0) return toast.error("Add at least one project assignment.");
    for (const a of cleaned) {
      if (!a.officeId) return toast.error(`Select an office location for ${a.projectId}`);
      if (isNaN(a.officeLat) || isNaN(a.officeLng)) return toast.error(`Invalid coordinates for ${a.projectId}`);
    }
    const totalLeaves = parseInt(form.totalLeaves, 10) || 0;
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
          branches,
          assignments: cleaned,
          projectIds,
          projectId: primary.projectId,
          projectName: primary.projectName,
          officeLat: primary.officeLat,
          officeLng: primary.officeLng
        });
        toast.success("Employee updated");
      } else {
        if (form.password.length < 6) {
          setBusy(false);
          return toast.error("Password must be at least 6 characters");
        }
        const uid = await createAuthUser(form.email.trim(), form.password);
        await setDoc(doc(db, "employees", uid), {
          employeeID: form.employeeID,
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
          createdAt: serverTimestamp()
        });
        toast.success("Employee created");
      }
      setOpen(false);
      await load();
    } catch (e2) {
      const msg = e2 instanceof Error ? e2.message : "Save failed";
      toast.error(msg.replace("Firebase: ", ""));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (r) => {
    try {
      await deleteDoc(doc(db, "employees", r.id));
      toast.success("Employee profile deleted. Firebase Auth account must be removed manually.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };
  const resetPassword = async (r) => {
    try {
      await sendPasswordResetEmail(auth, r.email);
      toast.success(`Password reset email sent to ${r.email}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send reset email");
    }
  };
  return /* @__PURE__ */ jsxs("div", { className: "space-y-6", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h1", { className: "text-2xl font-bold", children: "Employees" }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground", children: "Create and manage employee accounts with per-project office locations." })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
        /* @__PURE__ */ jsx(ProjectPicker, { projects, value: activeProjectId, onChange: setActiveProjectId }),
        canEdit && /* @__PURE__ */ jsxs(Button, { onClick: openNew, children: [
          /* @__PURE__ */ jsx(Plus, { className: "mr-1 h-4 w-4" }),
          " New employee"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsx(CardContent, { className: "p-0", children: loading ? /* @__PURE__ */ jsx("p", { className: "p-6 text-sm text-muted-foreground", children: "Loading…" }) : /* @__PURE__ */ jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxs("table", { className: "w-full text-sm", children: [
      /* @__PURE__ */ jsx("thead", { className: "bg-muted/50 text-left text-xs uppercase text-muted-foreground", children: /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("th", { className: "p-3", children: "ID" }),
        /* @__PURE__ */ jsx("th", { className: "p-3", children: "Name" }),
        /* @__PURE__ */ jsx("th", { className: "p-3", children: "Email" }),
        /* @__PURE__ */ jsx("th", { className: "p-3", children: "Projects" }),
        /* @__PURE__ */ jsx("th", { className: "p-3", children: "Leaves" }),
        /* @__PURE__ */ jsx("th", { className: "p-3", children: "Role" }),
        /* @__PURE__ */ jsx("th", { className: "p-3 text-right", children: "Actions" })
      ] }) }),
      /* @__PURE__ */ jsxs("tbody", { children: [
        rows.map((r) => {
          const asg = deriveAssignments(r);
          return /* @__PURE__ */ jsxs("tr", { className: "border-t", children: [
            /* @__PURE__ */ jsx("td", { className: "p-3 font-mono text-xs", children: r.employeeID }),
            /* @__PURE__ */ jsx("td", { className: "p-3", children: r.name }),
            /* @__PURE__ */ jsx("td", { className: "p-3", children: r.email }),
            /* @__PURE__ */ jsx("td", { className: "p-3 text-xs", children: /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-1", children: asg.length === 0 ? /* @__PURE__ */ jsx("span", { className: "text-muted-foreground", children: "—" }) : asg.map((a) => /* @__PURE__ */ jsxs(Badge, { variant: "secondary", title: `${a.officeName ?? "Office"}: ${a.officeLat?.toFixed?.(5)}, ${a.officeLng?.toFixed?.(5)}`, children: [
              a.projectId,
              a.officeName ? ` / ${a.officeName}` : ""
            ] }, `${a.projectId}-${a.officeId ?? a.officeName ?? ""}`)) }) }),
            /* @__PURE__ */ jsx("td", { className: "p-3 text-xs", children: /* @__PURE__ */ jsxs(Badge, { variant: (r.usedLeaves ?? 0) >= (r.totalLeaves ?? 0) ? "destructive" : "secondary", children: [
              r.usedLeaves ?? 0,
              " / ",
              r.totalLeaves ?? 0
            ] }) }),
            /* @__PURE__ */ jsx("td", { className: "p-3", children: /* @__PURE__ */ jsx(Badge, { variant: r.role === "admin" || r.role === "superadmin" ? "default" : "secondary", children: r.role }) }),
            /* @__PURE__ */ jsx("td", { className: "p-3", children: canEdit && /* @__PURE__ */ jsxs("div", { className: "flex justify-end gap-1", children: [
              /* @__PURE__ */ jsx(Button, { size: "sm", variant: "ghost", onClick: () => openEdit(r), children: /* @__PURE__ */ jsx(Pencil, { className: "h-4 w-4" }) }),
              isSuper && /* @__PURE__ */ jsxs(AlertDialog, { children: [
                /* @__PURE__ */ jsx(AlertDialogTrigger, { asChild: true, children: /* @__PURE__ */ jsx(Button, { size: "sm", variant: "ghost", title: "Send password reset email", children: /* @__PURE__ */ jsx(KeyRound, { className: "h-4 w-4" }) }) }),
                /* @__PURE__ */ jsxs(AlertDialogContent, { children: [
                  /* @__PURE__ */ jsxs(AlertDialogHeader, { children: [
                    /* @__PURE__ */ jsxs(AlertDialogTitle, { children: [
                      "Send password reset to ",
                      r.name,
                      "?"
                    ] }),
                    /* @__PURE__ */ jsxs(AlertDialogDescription, { children: [
                      "A reset link will be emailed to ",
                      r.email,
                      "."
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxs(AlertDialogFooter, { children: [
                    /* @__PURE__ */ jsx(AlertDialogCancel, { children: "Cancel" }),
                    /* @__PURE__ */ jsx(AlertDialogAction, { onClick: () => resetPassword(r), children: "Send email" })
                  ] })
                ] })
              ] }),
              /* @__PURE__ */ jsxs(AlertDialog, { children: [
                /* @__PURE__ */ jsx(AlertDialogTrigger, { asChild: true, children: /* @__PURE__ */ jsx(Button, { size: "sm", variant: "ghost", children: /* @__PURE__ */ jsx(Trash2, { className: "h-4 w-4 text-destructive" }) }) }),
                /* @__PURE__ */ jsxs(AlertDialogContent, { children: [
                  /* @__PURE__ */ jsxs(AlertDialogHeader, { children: [
                    /* @__PURE__ */ jsxs(AlertDialogTitle, { children: [
                      "Delete ",
                      r.name,
                      "?"
                    ] }),
                    /* @__PURE__ */ jsx(AlertDialogDescription, { children: "This removes the Firestore profile. Auth account must be deleted manually." })
                  ] }),
                  /* @__PURE__ */ jsxs(AlertDialogFooter, { children: [
                    /* @__PURE__ */ jsx(AlertDialogCancel, { children: "Cancel" }),
                    /* @__PURE__ */ jsx(AlertDialogAction, { onClick: () => remove(r), children: "Delete" })
                  ] })
                ] })
              ] })
            ] }) })
          ] }, r.id);
        }),
        rows.length === 0 && /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", { colSpan: 7, className: "p-6 text-center text-muted-foreground", children: "No employees yet" }) })
      ] })
    ] }) }) }) }),
    /* @__PURE__ */ jsx(Dialog, { open, onOpenChange: setOpen, children: /* @__PURE__ */ jsxs(DialogContent, { className: "max-w-2xl", children: [
      /* @__PURE__ */ jsxs(DialogHeader, { children: [
        /* @__PURE__ */ jsx(DialogTitle, { children: editing ? "Edit employee" : "New employee" }),
        /* @__PURE__ */ jsx(DialogDescription, { children: "Assign one or more projects and pick the office location for each. Coordinates come from the office master data." })
      ] }),
      /* @__PURE__ */ jsxs("form", { onSubmit: save, className: "space-y-3", children: [
        /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
          /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsx(Label, { children: "Employee ID" }),
            /* @__PURE__ */ jsx(Input, { value: form.employeeID, onChange: (e) => setForm({
              ...form,
              employeeID: e.target.value
            }), required: true, readOnly: !editing, className: !editing ? "bg-muted" : void 0 }),
            !editing && /* @__PURE__ */ jsx("p", { className: "text-xs text-muted-foreground", children: "Auto-generated in series (EMP001, EMP002, …)" })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsx(Label, { children: "Role" }),
            /* @__PURE__ */ jsxs("select", { className: "h-9 w-full rounded-md border bg-background px-2 text-sm", value: form.role, onChange: (e) => setForm({
              ...form,
              role: e.target.value
            }), children: [
              /* @__PURE__ */ jsx("option", { value: "employee", children: "Employee" }),
              /* @__PURE__ */ jsx("option", { value: "admin", disabled: !isSuper, children: "Admin (super only)" })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsx(Label, { children: "Name" }),
          /* @__PURE__ */ jsx(Input, { value: form.name, onChange: (e) => setForm({
            ...form,
            name: e.target.value
          }), required: true })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsx(Label, { children: "Email" }),
          /* @__PURE__ */ jsx(Input, { type: "email", value: form.email, onChange: (e) => setForm({
            ...form,
            email: e.target.value
          }), required: true, disabled: !!editing })
        ] }),
        !editing && /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsx(Label, { children: "Initial password" }),
          /* @__PURE__ */ jsx(Input, { type: "text", value: form.password, onChange: (e) => setForm({
            ...form,
            password: e.target.value
          }), required: true, minLength: 6 })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-2 rounded-md border p-3", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
            /* @__PURE__ */ jsx(Label, { children: "Project assignments" }),
            /* @__PURE__ */ jsxs(Button, { type: "button", size: "sm", variant: "outline", onClick: addAssignmentRow, children: [
              /* @__PURE__ */ jsx(Plus, { className: "mr-1 h-3 w-3" }),
              " Add project"
            ] })
          ] }),
          form.assignments.length === 0 && /* @__PURE__ */ jsx("p", { className: "text-xs text-muted-foreground", children: "No projects assigned yet." }),
          form.assignments.map((a, idx) => {
            const locs = officesForProject(a.projectId);
            return /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-12 gap-2 rounded-md bg-muted/40 p-2", children: [
              /* @__PURE__ */ jsxs("div", { className: "col-span-5 space-y-1", children: [
                /* @__PURE__ */ jsx(Label, { className: "text-xs", children: "Project" }),
                /* @__PURE__ */ jsxs("select", { className: "h-9 w-full rounded-md border bg-background px-2 text-sm", value: a.projectId, onChange: (e) => updateAssignment(idx, {
                  projectId: e.target.value
                }), required: true, children: [
                  /* @__PURE__ */ jsx("option", { value: "", children: "Select…" }),
                  projects.map((p) => /* @__PURE__ */ jsxs("option", { value: p.id, children: [
                    p.name,
                    " (",
                    p.id,
                    ")"
                  ] }, p.id))
                ] })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "col-span-5 space-y-1", children: [
                /* @__PURE__ */ jsx(Label, { className: "text-xs", children: "Office location" }),
                /* @__PURE__ */ jsxs("select", { className: "h-9 w-full rounded-md border bg-background px-2 text-sm", value: a.officeId ?? "", onChange: (e) => updateAssignment(idx, {
                  officeId: e.target.value
                }), required: true, disabled: !a.projectId, children: [
                  /* @__PURE__ */ jsx("option", { value: "", children: a.projectId ? locs.length ? "Select…" : "No offices — add in Super Admin" : "Select project first" }),
                  locs.map((o) => /* @__PURE__ */ jsx("option", { value: o.id, children: o.name }, o.id))
                ] }),
                a.officeLat && a.officeLng ? /* @__PURE__ */ jsxs("p", { className: "text-[10px] text-muted-foreground font-mono", children: [
                  a.officeLat.toFixed(5),
                  ", ",
                  a.officeLng.toFixed(5)
                ] }) : null
              ] }),
              /* @__PURE__ */ jsx("div", { className: "col-span-2 flex items-end justify-end", children: /* @__PURE__ */ jsx(Button, { type: "button", size: "sm", variant: "ghost", onClick: () => removeAssignment(idx), children: /* @__PURE__ */ jsx(X, { className: "h-4 w-4 text-destructive" }) }) })
            ] }, idx);
          })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsx(Label, { children: "Total leaves" }),
          /* @__PURE__ */ jsx(Input, { type: "number", min: "0", value: form.totalLeaves, onChange: (e) => setForm({
            ...form,
            totalLeaves: e.target.value
          }), required: true })
        ] }),
        /* @__PURE__ */ jsxs(DialogFooter, { children: [
          /* @__PURE__ */ jsx(Button, { type: "button", variant: "outline", onClick: () => setOpen(false), children: "Cancel" }),
          /* @__PURE__ */ jsx(Button, { type: "submit", disabled: busy, children: busy ? "Saving…" : "Save" })
        ] })
      ] })
    ] }) })
  ] });
}
const SplitComponent = () => /* @__PURE__ */ jsx(RequireAuth, { role: "staff", children: /* @__PURE__ */ jsx(EmployeesPage, {}) });
export {
  SplitComponent as component
};

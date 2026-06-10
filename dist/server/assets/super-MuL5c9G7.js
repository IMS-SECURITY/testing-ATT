import { jsx, jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { R as RequireAuth } from "./RequireAuth-BnkDJcWl.js";
import { B as Button, C as Card, a as CardHeader, b as CardTitle, c as CardDescription, d as CardContent } from "./card-BXMydX4U.js";
import { L as Label, I as Input } from "./label-DGkNwAzF.js";
import { B as Badge } from "./badge-Cjy_ry0J.js";
import { D as Dialog, a as DialogContent, b as DialogHeader, c as DialogTitle, d as DialogFooter, e as DialogDescription } from "./dialog-BXiTal8K.js";
import { d as db } from "./router-B753KT4Y.js";
import { doc, getDoc, setDoc, serverTimestamp, getDocs, collection, query, where, updateDoc, arrayRemove, arrayUnion } from "firebase/firestore";
import { c as createOffice, a as createAuthUser, l as loadAllOffices, d as deleteOffice, u as updateOffice } from "./offices-BsXaHCwV.js";
import { toast } from "sonner";
import { Shield, Database, ShieldPlus, Plus, Trash2, Pencil, MapPin, UserPlus } from "lucide-react";
import "@tanstack/react-router";
import "@radix-ui/react-slot";
import "class-variance-authority";
import "clsx";
import "tailwind-merge";
import "@radix-ui/react-label";
import "@radix-ui/react-dialog";
import "@tanstack/react-query";
import "firebase/auth";
import "firebase/app";
const TEST_PASSWORD = "Test@1234";
const PROJECTS = [
  { id: "APF", name: "APF" },
  { id: "ITC", name: "ITC" },
  { id: "TOYOTA", name: "Toyota" }
];
const OFFICES = [
  { projectId: "APF", name: "Bangalore University", lat: 12.8447349548975, lng: 77.77548970750784 },
  { projectId: "APF", name: "Foundation", lat: 12.915769847898813, lng: 77.68499535541223 },
  { projectId: "APF", name: "Pappanna Street", lat: 12.971224, lng: 77.6001674 },
  { projectId: "ITC", name: "Foods", lat: 12.996344097078506, lng: 77.62551829170354 },
  { projectId: "TOYOTA", name: "Toyota", lat: 12.92039538337612, lng: 77.50169456909333 }
];
const EMPLOYEES = [
  {
    employeeID: "EMP001",
    name: "Mithil Bharadwaj A C",
    email: "ac.mithil@tvs-e.in",
    assignments: [
      { projectId: "APF", officeName: "Bangalore University" },
      { projectId: "ITC", officeName: "Foods" },
      { projectId: "TOYOTA", officeName: "Toyota" }
    ]
  },
  {
    employeeID: "EMP002",
    name: "Shweta",
    email: "p.shweta@tvs-e.in",
    assignments: [{ projectId: "ITC", officeName: "Foods" }]
  },
  {
    employeeID: "EMP003",
    name: "Pavithra",
    email: "p.pavithra@tvs-e.in",
    assignments: [{ projectId: "ITC", officeName: "Foods" }]
  },
  {
    employeeID: "EMP004",
    name: "Madhavan",
    email: "k.madhavan@tvs-e.in",
    assignments: [{ projectId: "APF", officeName: "Foundation" }]
  },
  {
    employeeID: "EMP005",
    name: "Mathiyazhagan",
    email: "s.mathiyazhagan@tvs-e.in",
    assignments: [{ projectId: "TOYOTA", officeName: "Toyota" }]
  },
  {
    employeeID: "EMP006",
    name: "Harish Senthil",
    email: "harish.senthil@tvs-e.in",
    assignments: [{ projectId: "APF", officeName: "Pappanna Street" }]
  }
];
async function seedTestData() {
  const log = [];
  for (const p of PROJECTS) {
    const ref = doc(db, "projects", p.id);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, { name: p.name, createdAt: serverTimestamp() });
      log.push(`Created project ${p.id}`);
    } else {
      await setDoc(ref, { name: p.name }, { merge: true });
      log.push(`Updated project ${p.id}`);
    }
  }
  const existingOffices = await getDocs(collection(db, "offices"));
  const officeMap = /* @__PURE__ */ new Map();
  for (const d of existingOffices.docs) {
    const data = d.data();
    officeMap.set(`${data.projectId}::${data.name}`, d.id);
  }
  for (const o of OFFICES) {
    const key = `${o.projectId}::${o.name}`;
    if (officeMap.has(key)) {
      log.push(`Office exists: ${o.projectId} / ${o.name}`);
    } else {
      const id = await createOffice({ projectId: o.projectId, name: o.name, lat: o.lat, lng: o.lng });
      officeMap.set(key, id);
      log.push(`Created office: ${o.projectId} / ${o.name}`);
    }
  }
  const projectNames = Object.fromEntries(PROJECTS.map((p) => [p.id, p.name]));
  for (const emp of EMPLOYEES) {
    const existing = await getDocs(query(collection(db, "employees"), where("email", "==", emp.email)));
    if (!existing.empty) {
      log.push(`Employee exists: ${emp.email}`);
      continue;
    }
    const assignments = emp.assignments.map((a) => {
      const officeId = officeMap.get(`${a.projectId}::${a.officeName}`);
      const office = OFFICES.find((o) => o.projectId === a.projectId && o.name === a.officeName);
      return {
        projectId: a.projectId,
        projectName: projectNames[a.projectId],
        officeId,
        officeName: a.officeName,
        officeLat: office.lat,
        officeLng: office.lng
      };
    });
    const primary = assignments[0];
    const uid = await createAuthUser(emp.email, TEST_PASSWORD);
    await setDoc(doc(db, "employees", uid), {
      employeeID: emp.employeeID,
      name: emp.name,
      email: emp.email,
      role: "employee",
      assignments,
      projectIds: assignments.map((a) => a.projectId),
      projectId: primary.projectId,
      projectName: primary.projectName,
      officeLat: primary.officeLat,
      officeLng: primary.officeLng,
      totalLeaves: 12,
      usedLeaves: 0,
      createdAt: serverTimestamp()
    });
    log.push(`Created employee ${emp.employeeID} — ${emp.name}`);
  }
  await setDoc(doc(db, "meta", "employeeCounter"), { next: 7 }, { merge: true });
  log.push("Employee counter set to 7 (next ID: EMP007)");
  return log;
}
function SuperPage() {
  const [projects, setProjects] = useState([]);
  const [offices, setOffices] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [supers, setSupers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openProj, setOpenProj] = useState(false);
  const [pid, setPid] = useState("");
  const [pname, setPname] = useState("");
  const [busy, setBusy] = useState(false);
  const [editProj, setEditProj] = useState(null);
  const [editPname, setEditPname] = useState("");
  const [openOffice, setOpenOffice] = useState(false);
  const [officeProj, setOfficeProj] = useState(null);
  const [editOffice, setEditOffice] = useState(null);
  const [oName, setOName] = useState("");
  const [oLat, setOLat] = useState("");
  const [oLng, setOLng] = useState("");
  const [openAdmin, setOpenAdmin] = useState(false);
  const [adminProj, setAdminProj] = useState(null);
  const [aName, setAName] = useState("");
  const [aEmail, setAEmail] = useState("");
  const [aPass, setAPass] = useState("");
  const [openSuper, setOpenSuper] = useState(false);
  const [sName, setSName] = useState("");
  const [sEmail, setSEmail] = useState("");
  const [sPass, setSPass] = useState("");
  const load = async () => {
    setLoading(true);
    try {
      const [pSnap, aSnap, sSnap, officeList] = await Promise.all([getDocs(collection(db, "projects")), getDocs(query(collection(db, "employees"), where("role", "==", "admin"))), getDocs(query(collection(db, "employees"), where("role", "==", "superadmin"))), loadAllOffices()]);
      setProjects(pSnap.docs.map((d) => ({
        id: d.id,
        name: d.data().name ?? d.id
      })));
      setOffices(officeList);
      setAdmins(aSnap.docs.map((d) => ({
        id: d.id,
        ...d.data()
      })));
      setSupers(sSnap.docs.map((d) => ({
        id: d.id,
        ...d.data()
      })));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);
  const officesOf = (projectId) => offices.filter((o) => o.projectId === projectId);
  const adminsOf = (projectId) => admins.filter((a) => (a.adminProjects ?? []).includes(projectId) || a.projectId === projectId);
  const createProject = async (e) => {
    e.preventDefault();
    const id = pid.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{2,32}$/.test(id)) return toast.error("Project ID: 2-32 chars, A-Z, 0-9, _ or -");
    setBusy(true);
    try {
      await setDoc(doc(db, "projects", id), {
        name: pname.trim() || id,
        createdAt: serverTimestamp()
      });
      toast.success("Project created");
      setOpenProj(false);
      setPid("");
      setPname("");
      await load();
    } catch (e2) {
      toast.error(e2 instanceof Error ? e2.message : "Failed");
    } finally {
      setBusy(false);
    }
  };
  const saveProjectEdit = async (e) => {
    e.preventDefault();
    if (!editProj) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, "projects", editProj.id), {
        name: editPname.trim() || editProj.id
      });
      toast.success("Project updated");
      setEditProj(null);
      await load();
    } catch (e2) {
      toast.error(e2 instanceof Error ? e2.message : "Failed");
    } finally {
      setBusy(false);
    }
  };
  const openAddOffice = (p) => {
    setOfficeProj(p);
    setEditOffice(null);
    setOName("");
    setOLat("");
    setOLng("");
    setOpenOffice(true);
  };
  const openEditOffice = (p, o) => {
    setOfficeProj(p);
    setEditOffice(o);
    setOName(o.name);
    setOLat(String(o.lat));
    setOLng(String(o.lng));
    setOpenOffice(true);
  };
  const saveOffice = async (e) => {
    e.preventDefault();
    if (!officeProj) return;
    const lat = parseFloat(oLat);
    const lng = parseFloat(oLng);
    if (!oName.trim()) return toast.error("Office name required");
    if (isNaN(lat) || isNaN(lng)) return toast.error("Valid latitude and longitude required");
    setBusy(true);
    try {
      if (editOffice) {
        await updateOffice(editOffice.id, {
          name: oName,
          lat,
          lng
        });
        toast.success("Office updated");
      } else {
        await createOffice({
          projectId: officeProj.id,
          name: oName,
          lat,
          lng
        });
        toast.success("Office added");
      }
      setOpenOffice(false);
      await load();
    } catch (e2) {
      toast.error(e2 instanceof Error ? e2.message : "Failed");
    } finally {
      setBusy(false);
    }
  };
  const removeOffice = async (o) => {
    if (!confirm(`Delete office "${o.name}" from ${o.projectId}?`)) return;
    try {
      await deleteOffice(o.id);
      toast.success("Office deleted");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };
  const runSeed = async () => {
    if (!confirm("Create test projects, offices, and 6 sample employees? Existing records with the same email are skipped. Default password: Test@1234")) return;
    setBusy(true);
    try {
      const log = await seedTestData();
      toast.success(`Test data seeded (${log.length} steps)`);
      console.log(log.join("\n"));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Seed failed");
    } finally {
      setBusy(false);
    }
  };
  const addAdmin = async (e) => {
    e.preventDefault();
    if (!adminProj) return;
    const email = aEmail.trim().toLowerCase();
    if (!email) return toast.error("Email required");
    setBusy(true);
    try {
      const snap = await getDocs(query(collection(db, "employees"), where("email", "==", email)));
      if (!snap.empty) {
        const empDoc = snap.docs[0];
        await updateDoc(doc(db, "employees", empDoc.id), {
          role: "admin",
          adminProjects: arrayUnion(adminProj.id)
        });
        toast.success(`Added ${email} as admin of ${adminProj.id}`);
      } else {
        if (!aName.trim() || aPass.length < 6) {
          setBusy(false);
          return toast.error("Name + password (≥6) required to create new user");
        }
        const uid = await createAuthUser(email, aPass);
        await setDoc(doc(db, "employees", uid), {
          employeeID: `ADMIN-${adminProj.id}`,
          name: aName.trim(),
          email,
          officeLat: 0,
          officeLng: 0,
          role: "admin",
          projectId: adminProj.id,
          projectName: adminProj.name,
          adminProjects: [adminProj.id],
          totalLeaves: 0,
          usedLeaves: 0,
          createdAt: serverTimestamp()
        });
        toast.success(`Admin created for ${adminProj.id}`);
      }
      setOpenAdmin(false);
      setAName("");
      setAEmail("");
      setAPass("");
      await load();
    } catch (e2) {
      toast.error((e2 instanceof Error ? e2.message : "Failed").replace("Firebase: ", ""));
    } finally {
      setBusy(false);
    }
  };
  const removeAdmin = async (a, projectId) => {
    try {
      const updates = {
        adminProjects: arrayRemove(projectId)
      };
      if (a.projectId === projectId) updates.projectId = null;
      await updateDoc(doc(db, "employees", a.id), updates);
      toast.success(`Removed ${a.email} from ${projectId}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };
  const addSuperAdmin = async (e) => {
    e.preventDefault();
    const email = sEmail.trim().toLowerCase();
    if (!email) return toast.error("Email required");
    setBusy(true);
    try {
      const snap = await getDocs(query(collection(db, "employees"), where("email", "==", email)));
      if (!snap.empty) {
        const empDoc = snap.docs[0];
        await updateDoc(doc(db, "employees", empDoc.id), {
          role: "superadmin",
          projectId: null,
          adminProjects: []
        });
        toast.success(`${email} promoted to Super Admin`);
      } else {
        if (!sName.trim() || sPass.length < 6) {
          setBusy(false);
          return toast.error("Name + password (≥6) required to create new user");
        }
        const uid = await createAuthUser(email, sPass);
        await setDoc(doc(db, "employees", uid), {
          employeeID: "SUPER",
          name: sName.trim(),
          email,
          officeLat: 0,
          officeLng: 0,
          role: "superadmin",
          projectId: null,
          adminProjects: [],
          createdAt: serverTimestamp()
        });
        toast.success(`Super Admin created: ${email}`);
      }
      setOpenSuper(false);
      setSName("");
      setSEmail("");
      setSPass("");
      await load();
    } catch (e2) {
      toast.error((e2 instanceof Error ? e2.message : "Failed").replace("Firebase: ", ""));
    } finally {
      setBusy(false);
    }
  };
  const demoteSuper = async (a) => {
    if (!confirm(`Demote ${a.email} from Super Admin to regular employee?`)) return;
    try {
      await updateDoc(doc(db, "employees", a.id), {
        role: "employee"
      });
      toast.success(`${a.email} demoted`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };
  return /* @__PURE__ */ jsxs("div", { className: "space-y-6", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsxs("h1", { className: "text-2xl font-bold flex items-center gap-2", children: [
          /* @__PURE__ */ jsx(Shield, { className: "h-6 w-6 text-primary" }),
          " Super Admin"
        ] }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground", children: "Manage projects, office locations, and project admins." })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-2", children: [
        /* @__PURE__ */ jsxs(Button, { variant: "outline", onClick: runSeed, disabled: busy, children: [
          /* @__PURE__ */ jsx(Database, { className: "mr-1 h-4 w-4" }),
          " Seed test data"
        ] }),
        /* @__PURE__ */ jsxs(Button, { variant: "outline", onClick: () => setOpenSuper(true), children: [
          /* @__PURE__ */ jsx(ShieldPlus, { className: "mr-1 h-4 w-4" }),
          " New super admin"
        ] }),
        /* @__PURE__ */ jsxs(Button, { onClick: () => setOpenProj(true), children: [
          /* @__PURE__ */ jsx(Plus, { className: "mr-1 h-4 w-4" }),
          " New project"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs(Card, { children: [
      /* @__PURE__ */ jsxs(CardHeader, { children: [
        /* @__PURE__ */ jsxs(CardTitle, { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsx(Shield, { className: "h-4 w-4 text-primary" }),
          " Super Admins"
        ] }),
        /* @__PURE__ */ jsx(CardDescription, { children: "Full access to every project, employee and attendance record." })
      ] }),
      /* @__PURE__ */ jsx(CardContent, { children: supers.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground", children: "No super admins yet." }) : /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-2", children: supers.map((s) => /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1 text-xs", children: [
        /* @__PURE__ */ jsx("span", { className: "font-medium", children: s.name }),
        /* @__PURE__ */ jsx("span", { className: "text-muted-foreground", children: s.email }),
        /* @__PURE__ */ jsx("button", { className: "rounded p-0.5 text-destructive hover:bg-destructive/10", onClick: () => demoteSuper(s), title: "Demote", children: /* @__PURE__ */ jsx(Trash2, { className: "h-3 w-3" }) })
      ] }, s.id)) }) })
    ] }),
    /* @__PURE__ */ jsxs(Card, { children: [
      /* @__PURE__ */ jsxs(CardHeader, { children: [
        /* @__PURE__ */ jsx(CardTitle, { children: "Projects & office locations" }),
        /* @__PURE__ */ jsx(CardDescription, { children: "Add office locations with GPS coordinates under each project. Employees pick a project and office when assigned — no manual lat/long entry." })
      ] }),
      /* @__PURE__ */ jsx(CardContent, { className: "p-0", children: loading ? /* @__PURE__ */ jsx("p", { className: "p-6 text-sm text-muted-foreground", children: "Loading…" }) : projects.length === 0 ? /* @__PURE__ */ jsx("p", { className: "p-6 text-sm text-muted-foreground", children: "No projects yet. Create one to start." }) : /* @__PURE__ */ jsx("div", { className: "divide-y", children: projects.map((p) => {
        const list = adminsOf(p.id);
        const locs = officesOf(p.id);
        return /* @__PURE__ */ jsxs("div", { className: "p-4 space-y-3", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsx(Badge, { variant: "outline", className: "font-mono", children: p.id }),
              /* @__PURE__ */ jsx("span", { className: "font-medium", children: p.name }),
              /* @__PURE__ */ jsx(Button, { size: "sm", variant: "ghost", className: "h-7 px-2", onClick: () => {
                setEditProj(p);
                setEditPname(p.name);
              }, children: /* @__PURE__ */ jsx(Pencil, { className: "h-3 w-3" }) })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
              /* @__PURE__ */ jsxs(Button, { size: "sm", variant: "outline", onClick: () => openAddOffice(p), children: [
                /* @__PURE__ */ jsx(MapPin, { className: "mr-1 h-3 w-3" }),
                " Add office"
              ] }),
              /* @__PURE__ */ jsxs(Button, { size: "sm", variant: "outline", onClick: () => {
                setAdminProj(p);
                setOpenAdmin(true);
              }, children: [
                /* @__PURE__ */ jsx(UserPlus, { className: "mr-1 h-3 w-3" }),
                " Add Admin"
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("p", { className: "text-xs font-medium text-muted-foreground mb-1.5", children: "Office locations" }),
            locs.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-xs text-muted-foreground", children: "No offices yet. Add one so employees can be assigned." }) : /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-2", children: locs.map((o) => /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1 text-xs", children: [
              /* @__PURE__ */ jsx(MapPin, { className: "h-3 w-3 text-primary shrink-0" }),
              /* @__PURE__ */ jsx("span", { className: "font-medium", children: o.name }),
              /* @__PURE__ */ jsxs("span", { className: "text-muted-foreground font-mono", children: [
                o.lat.toFixed(5),
                ", ",
                o.lng.toFixed(5)
              ] }),
              /* @__PURE__ */ jsx("button", { className: "rounded p-0.5 hover:bg-muted", onClick: () => openEditOffice(p, o), title: "Edit", children: /* @__PURE__ */ jsx(Pencil, { className: "h-3 w-3" }) }),
              /* @__PURE__ */ jsx("button", { className: "rounded p-0.5 text-destructive hover:bg-destructive/10", onClick: () => removeOffice(o), title: "Delete", children: /* @__PURE__ */ jsx(Trash2, { className: "h-3 w-3" }) })
            ] }, o.id)) })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("p", { className: "text-xs font-medium text-muted-foreground mb-1.5", children: "Project admins" }),
            /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-2", children: [
              list.length === 0 && /* @__PURE__ */ jsx("span", { className: "text-xs text-muted-foreground", children: "No admins yet." }),
              list.map((a) => /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1 text-xs", children: [
                /* @__PURE__ */ jsx("span", { className: "font-medium", children: a.name }),
                /* @__PURE__ */ jsx("span", { className: "text-muted-foreground", children: a.email }),
                /* @__PURE__ */ jsx("button", { className: "rounded p-0.5 text-destructive hover:bg-destructive/10", onClick: () => removeAdmin(a, p.id), title: "Remove from project", children: /* @__PURE__ */ jsx(Trash2, { className: "h-3 w-3" }) })
              ] }, a.id))
            ] })
          ] })
        ] }, p.id);
      }) }) })
    ] }),
    /* @__PURE__ */ jsx(Dialog, { open: openProj, onOpenChange: setOpenProj, children: /* @__PURE__ */ jsxs(DialogContent, { children: [
      /* @__PURE__ */ jsx(DialogHeader, { children: /* @__PURE__ */ jsx(DialogTitle, { children: "New project" }) }),
      /* @__PURE__ */ jsxs("form", { onSubmit: createProject, className: "space-y-3", children: [
        /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsx(Label, { children: "Project ID (used at login)" }),
          /* @__PURE__ */ jsx(Input, { value: pid, onChange: (e) => setPid(e.target.value), placeholder: "APF", required: true })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsx(Label, { children: "Project name" }),
          /* @__PURE__ */ jsx(Input, { value: pname, onChange: (e) => setPname(e.target.value), placeholder: "APF" })
        ] }),
        /* @__PURE__ */ jsxs(DialogFooter, { children: [
          /* @__PURE__ */ jsx(Button, { type: "button", variant: "outline", onClick: () => setOpenProj(false), children: "Cancel" }),
          /* @__PURE__ */ jsx(Button, { type: "submit", disabled: busy, children: busy ? "Saving…" : "Create" })
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsx(Dialog, { open: !!editProj, onOpenChange: (v) => !v && setEditProj(null), children: /* @__PURE__ */ jsxs(DialogContent, { children: [
      /* @__PURE__ */ jsx(DialogHeader, { children: /* @__PURE__ */ jsxs(DialogTitle, { children: [
        "Edit project ",
        editProj?.id
      ] }) }),
      /* @__PURE__ */ jsxs("form", { onSubmit: saveProjectEdit, className: "space-y-3", children: [
        /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsx(Label, { children: "Project name" }),
          /* @__PURE__ */ jsx(Input, { value: editPname, onChange: (e) => setEditPname(e.target.value), required: true })
        ] }),
        /* @__PURE__ */ jsxs(DialogFooter, { children: [
          /* @__PURE__ */ jsx(Button, { type: "button", variant: "outline", onClick: () => setEditProj(null), children: "Cancel" }),
          /* @__PURE__ */ jsx(Button, { type: "submit", disabled: busy, children: busy ? "Saving…" : "Save" })
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsx(Dialog, { open: openOffice, onOpenChange: setOpenOffice, children: /* @__PURE__ */ jsxs(DialogContent, { children: [
      /* @__PURE__ */ jsxs(DialogHeader, { children: [
        /* @__PURE__ */ jsxs(DialogTitle, { children: [
          editOffice ? "Edit office" : "Add office",
          " — ",
          officeProj?.name
        ] }),
        /* @__PURE__ */ jsx(DialogDescription, { children: "GPS coordinates are used for the 1 km punch-in radius." })
      ] }),
      /* @__PURE__ */ jsxs("form", { onSubmit: saveOffice, className: "space-y-3", children: [
        /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsx(Label, { children: "Office / location name" }),
          /* @__PURE__ */ jsx(Input, { value: oName, onChange: (e) => setOName(e.target.value), placeholder: "Bangalore University", required: true })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
          /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsx(Label, { children: "Latitude" }),
            /* @__PURE__ */ jsx(Input, { value: oLat, onChange: (e) => setOLat(e.target.value), placeholder: "12.9716", required: true })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsx(Label, { children: "Longitude" }),
            /* @__PURE__ */ jsx(Input, { value: oLng, onChange: (e) => setOLng(e.target.value), placeholder: "77.5946", required: true })
          ] })
        ] }),
        /* @__PURE__ */ jsxs(DialogFooter, { children: [
          /* @__PURE__ */ jsx(Button, { type: "button", variant: "outline", onClick: () => setOpenOffice(false), children: "Cancel" }),
          /* @__PURE__ */ jsx(Button, { type: "submit", disabled: busy, children: busy ? "Saving…" : "Save" })
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsx(Dialog, { open: openAdmin, onOpenChange: setOpenAdmin, children: /* @__PURE__ */ jsxs(DialogContent, { children: [
      /* @__PURE__ */ jsxs(DialogHeader, { children: [
        /* @__PURE__ */ jsxs(DialogTitle, { children: [
          "Add admin to ",
          adminProj?.id
        ] }),
        /* @__PURE__ */ jsx(DialogDescription, { children: "If the email already belongs to an employee, they will be promoted to admin and this project added to their list. Otherwise a new account is created with the name + password." })
      ] }),
      /* @__PURE__ */ jsxs("form", { onSubmit: addAdmin, className: "space-y-3", children: [
        /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsx(Label, { children: "Email" }),
          /* @__PURE__ */ jsx(Input, { type: "email", value: aEmail, onChange: (e) => setAEmail(e.target.value), required: true })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsx(Label, { children: "Name (new accounts only)" }),
          /* @__PURE__ */ jsx(Input, { value: aName, onChange: (e) => setAName(e.target.value) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsx(Label, { children: "Initial password (new accounts only)" }),
          /* @__PURE__ */ jsx(Input, { value: aPass, onChange: (e) => setAPass(e.target.value), minLength: 6 })
        ] }),
        /* @__PURE__ */ jsxs(DialogFooter, { children: [
          /* @__PURE__ */ jsx(Button, { type: "button", variant: "outline", onClick: () => setOpenAdmin(false), children: "Cancel" }),
          /* @__PURE__ */ jsx(Button, { type: "submit", disabled: busy, children: busy ? "Saving…" : "Add admin" })
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsx(Dialog, { open: openSuper, onOpenChange: setOpenSuper, children: /* @__PURE__ */ jsxs(DialogContent, { children: [
      /* @__PURE__ */ jsxs(DialogHeader, { children: [
        /* @__PURE__ */ jsx(DialogTitle, { children: "New Super Admin" }),
        /* @__PURE__ */ jsx(DialogDescription, { children: "If the email already belongs to an employee, they will be promoted to Super Admin. Otherwise a new account is created with the name + password." })
      ] }),
      /* @__PURE__ */ jsxs("form", { onSubmit: addSuperAdmin, className: "space-y-3", children: [
        /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsx(Label, { children: "Email" }),
          /* @__PURE__ */ jsx(Input, { type: "email", value: sEmail, onChange: (e) => setSEmail(e.target.value), required: true })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsx(Label, { children: "Name (new accounts only)" }),
          /* @__PURE__ */ jsx(Input, { value: sName, onChange: (e) => setSName(e.target.value) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsx(Label, { children: "Initial password (new accounts only)" }),
          /* @__PURE__ */ jsx(Input, { type: "password", value: sPass, onChange: (e) => setSPass(e.target.value), minLength: 6 })
        ] }),
        /* @__PURE__ */ jsxs(DialogFooter, { children: [
          /* @__PURE__ */ jsx(Button, { type: "button", variant: "outline", onClick: () => setOpenSuper(false), children: "Cancel" }),
          /* @__PURE__ */ jsx(Button, { type: "submit", disabled: busy, children: busy ? "Saving…" : "Create Super Admin" })
        ] })
      ] })
    ] }) })
  ] });
}
const SplitComponent = () => /* @__PURE__ */ jsx(RequireAuth, { role: "super", children: /* @__PURE__ */ jsx(SuperPage, {}) });
export {
  SplitComponent as component
};

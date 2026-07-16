import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { db } from "@/lib/firebase";
import {
  arrayRemove, arrayUnion, collection, doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where,
} from "firebase/firestore";
import { createAuthUser } from "@/lib/firebase-admin-create";
import {
  createOffice, deleteOffice, loadAllOffices, updateOffice, type Office,
} from "@/lib/offices";
import { OfficeLocationPicker } from "@/components/OfficeLocationPicker";
import { toast } from "sonner";
import { MapPin, Pencil, Plus, Shield, ShieldPlus, Trash2, UserPlus } from "lucide-react";

export const Route = createFileRoute("/super")({
  component: () => (
    <RequireAuth role="super">
      <SuperPage />
    </RequireAuth>
  ),
});

interface Project { id: string; name: string }
interface AdminRow {
  id: string;
  name: string;
  email: string;
  adminProjects?: string[];
  projectId?: string | null;
  role: string;
}

function SuperPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [supers, setSupers] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [openProj, setOpenProj] = useState(false);
  const [pid, setPid] = useState("");
  const [pname, setPname] = useState("");
  const [busy, setBusy] = useState(false);

  const [editProj, setEditProj] = useState<Project | null>(null);
  const [editPname, setEditPname] = useState("");

  const [openOffice, setOpenOffice] = useState(false);
  const [officeProj, setOfficeProj] = useState<Project | null>(null);
  const [editOffice, setEditOffice] = useState<Office | null>(null);
  const [oName, setOName] = useState("");
  const [oLat, setOLat] = useState("");
  const [oLng, setOLng] = useState("");

  const [openAdmin, setOpenAdmin] = useState(false);
  const [adminProj, setAdminProj] = useState<Project | null>(null);
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
      const [pSnap, aSnap, sSnap, officeList] = await Promise.all([
        getDocs(collection(db, "projects")),
        getDocs(query(collection(db, "employees"), where("role", "==", "admin"))),
        getDocs(query(collection(db, "employees"), where("role", "==", "superadmin"))),
        loadAllOffices(),
      ]);
      setProjects(pSnap.docs.map((d) => ({ id: d.id, name: (d.data() as { name?: string }).name ?? d.id })));
      setOffices(officeList);
      setAdmins(aSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AdminRow, "id">) })));
      setSupers(sSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AdminRow, "id">) })));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const officesOf = (projectId: string) => offices.filter((o) => o.projectId === projectId);

  const adminsOf = (projectId: string) =>
    admins.filter(
      (a) =>
        (a.adminProjects ?? []).includes(projectId) ||
        a.projectId === projectId,
    );

  const createProject = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = pid.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{2,32}$/.test(id)) return toast.error("Project ID: 2-32 chars, A-Z, 0-9, _ or -");
    setBusy(true);
    try {
      await setDoc(doc(db, "projects", id), { name: pname.trim() || id, createdAt: serverTimestamp() });
      toast.success("Project created");
      setOpenProj(false);
      setPid(""); setPname("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setBusy(false); }
  };

  const saveProjectEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editProj) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, "projects", editProj.id), { name: editPname.trim() || editProj.id });
      toast.success("Project updated");
      setEditProj(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setBusy(false); }
  };

  const openAddOffice = (p: Project) => {
    setOfficeProj(p);
    setEditOffice(null);
    setOName("");
    setOLat("");
    setOLng("");
    setOpenOffice(false);
    // small timeout so Leaflet mounts fresh after dialog opens
    setTimeout(() => setOpenOffice(true), 0);
  };

  const openEditOffice = (p: Project, o: Office) => {
    setOfficeProj(p);
    setEditOffice(o);
    setOName(o.name);
    setOLat(String(o.lat));
    setOLng(String(o.lng));
    setOpenOffice(false);
    setTimeout(() => setOpenOffice(true), 0);
  };

  const saveOffice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!officeProj) return;
    const lat = parseFloat(oLat);
    const lng = parseFloat(oLng);
    if (!oName.trim()) return toast.error("Office name required");
    if (isNaN(lat) || isNaN(lng)) return toast.error("Valid latitude and longitude required");
    setBusy(true);
    try {
      if (editOffice) {
        await updateOffice(editOffice.id, { name: oName, lat, lng });
        toast.success("Office updated");
      } else {
        await createOffice({ projectId: officeProj.id, name: oName, lat, lng });
        toast.success("Office added");
      }
      setOpenOffice(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setBusy(false); }
  };

  const removeOffice = async (o: Office) => {
    if (!confirm(`Delete office "${o.name}" from ${o.projectId}?`)) return;
    try {
      await deleteOffice(o.id);
      toast.success("Office deleted");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const addAdmin = async (e: React.FormEvent) => {
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
          adminProjects: arrayUnion(adminProj.id),
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
          createdAt: serverTimestamp(),
        });
        toast.success(`Admin created for ${adminProj.id}`);
      }
      setOpenAdmin(false);
      setAName(""); setAEmail(""); setAPass("");
      await load();
    } catch (e) {
      toast.error((e instanceof Error ? e.message : "Failed").replace("Firebase: ", ""));
    } finally { setBusy(false); }
  };

  const removeAdmin = async (a: AdminRow, projectId: string) => {
    try {
      const updates: Record<string, unknown> = { adminProjects: arrayRemove(projectId) };
      if (a.projectId === projectId) updates.projectId = null;
      await updateDoc(doc(db, "employees", a.id), updates);
      toast.success(`Removed ${a.email} from ${projectId}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const addSuperAdmin = async (e: React.FormEvent) => {
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
          adminProjects: [],
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
          createdAt: serverTimestamp(),
        });
        toast.success(`Super Admin created: ${email}`);
      }
      setOpenSuper(false);
      setSName(""); setSEmail(""); setSPass("");
      await load();
    } catch (e) {
      toast.error((e instanceof Error ? e.message : "Failed").replace("Firebase: ", ""));
    } finally { setBusy(false); }
  };

  const demoteSuper = async (a: AdminRow) => {
    if (!confirm(`Demote ${a.email} from Super Admin to regular employee?`)) return;
    try {
      await updateDoc(doc(db, "employees", a.id), { role: "employee" });
      toast.success(`${a.email} demoted`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Shield className="h-6 w-6 text-primary" /> Super Admin</h1>
          <p className="text-sm text-muted-foreground">Manage projects, office locations, and project admins.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setOpenSuper(true)}><ShieldPlus className="mr-1 h-4 w-4" /> New super admin</Button>
          <Button onClick={() => setOpenProj(true)}><Plus className="mr-1 h-4 w-4" /> New project</Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Shield className="h-4 w-4 text-primary" /> Super Admins</CardTitle>
          <CardDescription>Full access to every project, employee and attendance record.</CardDescription>
        </CardHeader>
        <CardContent>
          {supers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No super admins yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {supers.map((s) => (
                <div key={s.id} className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1 text-xs">
                  <span className="font-medium">{s.name}</span>
                  <span className="text-muted-foreground">{s.email}</span>
                  <button
                    className="rounded p-0.5 text-destructive hover:bg-destructive/10"
                    onClick={() => demoteSuper(s)}
                    title="Demote"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Projects &amp; office locations</CardTitle>
          <CardDescription>
            Add office locations with GPS coordinates under each project. Employees pick a project and office when assigned — no manual lat/long entry.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : projects.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No projects yet. Create one to start.</p>
          ) : (
            <div className="divide-y">
              {projects.map((p) => {
                const list = adminsOf(p.id);
                const locs = officesOf(p.id);
                return (
                  <div key={p.id} className="p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono">{p.id}</Badge>
                        <span className="font-medium">{p.name}</span>
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setEditProj(p); setEditPname(p.name); }}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => openAddOffice(p)}>
                          <MapPin className="mr-1 h-3 w-3" /> Add office
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { setAdminProj(p); setOpenAdmin(true); }}>
                          <UserPlus className="mr-1 h-3 w-3" /> Add Admin
                        </Button>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">Office locations</p>
                      {locs.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No offices yet. Add one so employees can be assigned.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {locs.map((o) => (
                            <div key={o.id} className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1 text-xs">
                              <MapPin className="h-3 w-3 text-primary shrink-0" />
                              <span className="font-medium">{o.name}</span>
                              <span className="text-muted-foreground font-mono">{o.lat.toFixed(5)}, {o.lng.toFixed(5)}</span>
                              <button className="rounded p-0.5 hover:bg-muted" onClick={() => openEditOffice(p, o)} title="Edit">
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button className="rounded p-0.5 text-destructive hover:bg-destructive/10" onClick={() => removeOffice(o)} title="Delete">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">Project admins</p>
                      <div className="flex flex-wrap gap-2">
                        {list.length === 0 && (
                          <span className="text-xs text-muted-foreground">No admins yet.</span>
                        )}
                        {list.map((a) => (
                          <div key={a.id} className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1 text-xs">
                            <span className="font-medium">{a.name}</span>
                            <span className="text-muted-foreground">{a.email}</span>
                            <button
                              className="rounded p-0.5 text-destructive hover:bg-destructive/10"
                              onClick={() => removeAdmin(a, p.id)}
                              title="Remove from project"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={openProj} onOpenChange={setOpenProj}>
        <DialogContent>
          <DialogHeader><DialogTitle>New project</DialogTitle></DialogHeader>
          <form onSubmit={createProject} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Project ID (used at login)</Label>
              <Input value={pid} onChange={(e) => setPid(e.target.value)} placeholder="APF" required />
            </div>
            <div className="space-y-1.5">
              <Label>Project name</Label>
              <Input value={pname} onChange={(e) => setPname(e.target.value)} placeholder="APF" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenProj(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editProj} onOpenChange={(v) => !v && setEditProj(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit project {editProj?.id}</DialogTitle></DialogHeader>
          <form onSubmit={saveProjectEdit} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Project name</Label>
              <Input value={editPname} onChange={(e) => setEditPname(e.target.value)} required />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditProj(null)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={openOffice} onOpenChange={setOpenOffice}>
        <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editOffice ? "Edit office" : "Add office"} — {officeProj?.name}</DialogTitle>
            <DialogDescription>Search or click the map to set GPS coordinates used for the 1 km punch-in radius.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto min-h-0 pr-2">
            <form id="office-form" onSubmit={saveOffice} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Office / location name</Label>
                <Input value={oName} onChange={(e) => setOName(e.target.value)} placeholder="e.g. Guindy Office, Bangalore HQ" required />
              </div>
              <OfficeLocationPicker
                lat={parseFloat(oLat) || 0}
                lng={parseFloat(oLng) || 0}
                onChange={(lat, lng) => { setOLat(String(lat)); setOLng(String(lng)); }}
              />
            </form>
          </div>
          <DialogFooter className="shrink-0 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpenOffice(false)}>Cancel</Button>
            <Button type="submit" form="office-form" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openAdmin} onOpenChange={setOpenAdmin}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add admin to {adminProj?.id}</DialogTitle>
            <DialogDescription>
              If the email already belongs to an employee, they will be promoted to admin and this project added to their list. Otherwise a new account is created with the name + password.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={addAdmin} className="space-y-3">
            <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={aEmail} onChange={(e) => setAEmail(e.target.value)} required /></div>
            <div className="space-y-1.5"><Label>Name (new accounts only)</Label><Input value={aName} onChange={(e) => setAName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Initial password (new accounts only)</Label><Input value={aPass} onChange={(e) => setAPass(e.target.value)} minLength={6} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenAdmin(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Add admin"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={openSuper} onOpenChange={setOpenSuper}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Super Admin</DialogTitle>
            <DialogDescription>
              If the email already belongs to an employee, they will be promoted to Super Admin. Otherwise a new account is created with the name + password.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={addSuperAdmin} className="space-y-3">
            <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={sEmail} onChange={(e) => setSEmail(e.target.value)} required /></div>
            <div className="space-y-1.5"><Label>Name (new accounts only)</Label><Input value={sName} onChange={(e) => setSName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Initial password (new accounts only)</Label><Input type="password" value={sPass} onChange={(e) => setSPass(e.target.value)} minLength={6} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenSuper(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Create Super Admin"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

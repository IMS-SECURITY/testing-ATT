import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth, effectiveAssignments, type Assignment } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { MapPin, Clock, Loader2, LogOut } from "lucide-react";
import { db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  doc,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  serverTimestamp,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { distanceKm, getCurrentPosition } from "@/lib/geo";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/app/")({
  component: () => (
    <RequireAuth>
      <PunchPage />
    </RequireAuth>
  ),
});

interface TodayRecord {
  id: string;
  date: string;
  time: string;
  lat: number;
  lng: number;
  projectId?: string | null;
  projectName?: string | null;
  status?: string;
  punchOutTime?: string;
  punchOutLat?: number;
  punchOutLng?: number;
  createdAt?: Timestamp;
}

const CONFIRM_PHRASE = "punch out";

function PunchPage() {
  const { profile, user } = useAuth();
  const assignments = useMemo<Assignment[]>(() => effectiveAssignments(profile), [profile]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [todayAll, setTodayAll] = useState<TodayRecord[]>([]);
  const [loadingToday, setLoadingToday] = useState(true);
  const [history, setHistory] = useState<TodayRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const todayStr = format(new Date(), "yyyy-MM-dd");

  useEffect(() => {
    if (assignments.length === 1) setSelectedProjectId(assignments[0].projectId);
    else if (assignments.length > 0 && !selectedProjectId) setSelectedProjectId(assignments[0].projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignments.map((a) => a.projectId).join("|")]);

  const selectedAssignment = useMemo(
    () => assignments.find((a) => a.projectId === selectedProjectId) ?? null,
    [assignments, selectedProjectId],
  );

  const todayPresent = useMemo(
    () => todayAll.find((r) => r.status !== "on_duty"),
    [todayAll],
  );

  const loadToday = async () => {
    if (!user) return;
    setLoadingToday(true);
    try {
      const q = query(
        collection(db, "attendance"),
        where("uid", "==", user.uid),
        where("date", "==", todayStr),
      );
      const snap = await getDocs(q);
      setTodayAll(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TodayRecord, "id">) })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingToday(false);
    }
  };

  const loadHistory = async () => {
    if (!user) return;
    setLoadingHistory(true);
    try {
      const q = query(
        collection(db, "attendance"),
        where("uid", "==", user.uid),
        orderBy("date", "desc"),
        limit(60),
      );
      const snap = await getDocs(q);
      setHistory(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TodayRecord, "id">) })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadToday();
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const onPunchIn = async () => {
    if (!profile || !user) return;
    if (assignments.length === 0) {
      toast.error("No project assigned. Contact admin.");
      return;
    }
    if (!selectedAssignment) {
      toast.error("Please select a project.");
      return;
    }
    if (!selectedAssignment.officeLat || !selectedAssignment.officeLng) {
      toast.error(`No office location set for ${selectedAssignment.projectName ?? selectedAssignment.projectId}. Contact admin.`);
      return;
    }
    setBusy(true);
    try {
      const pos = await getCurrentPosition();
      const { latitude, longitude } = pos.coords;
      const dist = distanceKm(latitude, longitude, selectedAssignment.officeLat, selectedAssignment.officeLng);
      if (dist > 1) {
        toast.error(`You're ${dist.toFixed(2)} km from the ${selectedAssignment.projectName ?? selectedAssignment.projectId} office. Must be within 1 km.`);
        setBusy(false);
        return;
      }
      const now = new Date();
      const base = {
        uid: user.uid,
        employeeID: profile.employeeID,
        name: profile.name,
        email: profile.email,
        date: format(now, "yyyy-MM-dd"),
        time: format(now, "HH:mm:ss"),
      };
      await addDoc(collection(db, "attendance"), {
        ...base,
        projectId: selectedAssignment.projectId,
        projectName: selectedAssignment.projectName ?? selectedAssignment.projectId,
        lat: latitude,
        lng: longitude,
        distanceKm: dist,
        status: "present",
        createdAt: serverTimestamp(),
      });
      // Create On Duty stub for other assigned projects so other admins don't see them as absent.
      const others = assignments.filter((a) => a.projectId !== selectedAssignment.projectId);
      await Promise.all(
        others.map((a) =>
          addDoc(collection(db, "attendance"), {
            ...base,
            projectId: a.projectId,
            projectName: a.projectName ?? a.projectId,
            lat: latitude,
            lng: longitude,
            status: "on_duty",
            onDutyAt: selectedAssignment.projectId,
            onDutyAtName: selectedAssignment.projectName ?? selectedAssignment.projectId,
            createdAt: serverTimestamp(),
          }),
        ),
      );
      toast.success(`Punched in at ${format(now, "HH:mm:ss")} for ${selectedAssignment.projectName ?? selectedAssignment.projectId}`);
      await loadToday();
      await loadHistory();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Punch in failed";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const onPunchOutConfirmed = async () => {
    if (!todayPresent || !profile) return;
    if (confirmText.trim().toLowerCase() !== CONFIRM_PHRASE) {
      toast.error(`Please type "${CONFIRM_PHRASE}" to confirm.`);
      return;
    }
    const a = assignments.find((x) => x.projectId === todayPresent.projectId) ?? assignments[0];
    if (!a?.officeLat || !a?.officeLng) {
      toast.error("No office location set. Contact admin.");
      return;
    }
    setBusy(true);
    try {
      const pos = await getCurrentPosition();
      const { latitude, longitude } = pos.coords;
      const dist = distanceKm(latitude, longitude, a.officeLat, a.officeLng);
      if (dist > 1) {
        toast.error(`You're ${dist.toFixed(2)} km from the office. Punch-out must be within 1 km.`);
        setBusy(false);
        return;
      }
      const now = new Date();
      await updateDoc(doc(db, "attendance", todayPresent.id), {
        punchOutTime: format(now, "HH:mm:ss"),
        punchOutLat: latitude,
        punchOutLng: longitude,
        punchOutDistanceKm: dist,
        punchOutAt: serverTimestamp(),
      });
      toast.success(`Punched out at ${format(now, "HH:mm:ss")}`);
      setConfirmOpen(false);
      setConfirmText("");
      await loadToday();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Punch out failed";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const hasPunchedIn = !!todayPresent;
  const hasPunchedOut = !!todayPresent?.punchOutTime;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Welcome, {profile?.name}</h1>
        <p className="text-sm text-muted-foreground">Employee ID: {profile?.employeeID}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{hasPunchedOut ? "Today's attendance" : hasPunchedIn ? "Punch Out" : "Punch In"}</CardTitle>
          <CardDescription>
            {hasPunchedOut
              ? "You have completed today's attendance."
              : "You must be within 1 km of the selected project's office."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasPunchedIn && assignments.length > 1 && (
            <div className="space-y-1.5">
              <Label>Project</Label>
              <select
                className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                disabled={busy}
              >
                {assignments.map((a) => (
                  <option key={a.projectId} value={a.projectId}>
                    {a.projectName ?? a.projectId} ({a.projectId})
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedAssignment && (
            <div className="rounded-lg bg-muted p-4 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4" />
                {selectedAssignment.projectName ?? selectedAssignment.projectId} office:{" "}
                {selectedAssignment.officeLat?.toFixed(5)}, {selectedAssignment.officeLng?.toFixed(5)}
              </div>
            </div>
          )}

          {loadingToday ? (
            <Button disabled size="lg" className="h-14 w-full text-base">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
            </Button>
          ) : hasPunchedOut ? (
            <Button disabled size="lg" className="h-14 w-full text-base">
              Attendance completed for today
            </Button>
          ) : hasPunchedIn ? (
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={busy}
              size="lg"
              variant="destructive"
              className="h-14 w-full text-base"
            >
              <LogOut className="mr-2 h-5 w-5" /> Punch Out
            </Button>
          ) : (
            <Button onClick={onPunchIn} disabled={busy || !selectedAssignment} size="lg" className="h-14 w-full text-base">
              {busy ? (
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Getting location…</>
              ) : (
                <><MapPin className="mr-2 h-5 w-5" /> Punch In Now</>
              )}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4" /> Today
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingToday ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : todayAll.length === 0 ? (
            <p className="text-sm text-muted-foreground">No punch-in yet today.</p>
          ) : (
            <div className="space-y-2 text-sm">
              {todayAll.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
                  <Badge variant="secondary">{r.projectName ?? r.projectId ?? "—"}</Badge>
                  {r.status === "on_duty" ? (
                    <Badge className="bg-amber-500 hover:bg-amber-500">On Duty</Badge>
                  ) : (
                    <>
                      <Badge>In: {r.time}</Badge>
                      {r.punchOutTime && <Badge variant="outline">Out: {r.punchOutTime}</Badge>}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4" /> Past attendance
          </CardTitle>
          <CardDescription>Your recent punch-in and punch-out history.</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingHistory ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No past attendance yet.</p>
          ) : (
            <div className="divide-y rounded-md border">
              {history.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{r.date}</Badge>
                    <span className="text-xs text-muted-foreground">{r.projectName ?? r.projectId ?? "—"}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {r.status === "on_duty" ? (
                      <Badge className="bg-amber-500 hover:bg-amber-500">On Duty</Badge>
                    ) : (
                      <>
                        <Badge>In: {r.time}</Badge>
                        {r.punchOutTime ? (
                          <Badge variant="outline">Out: {r.punchOutTime}</Badge>
                        ) : (
                          <Badge variant="destructive">No punch-out</Badge>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={confirmOpen}
        onOpenChange={(o) => {
          setConfirmOpen(o);
          if (!o) setConfirmText("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm punch out</DialogTitle>
            <DialogDescription>
              This will end your attendance for today. Type <strong>{CONFIRM_PHRASE}</strong> below to confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirmation</Label>
            <Input
              id="confirm"
              autoComplete="off"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={CONFIRM_PHRASE}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onPunchOutConfirmed}
              disabled={busy || confirmText.trim().toLowerCase() !== CONFIRM_PHRASE}
            >
              {busy ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Punching out…</>
              ) : (
                "Confirm Punch Out"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

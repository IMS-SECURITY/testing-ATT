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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin, Clock, Loader2, LogOut, Calendar, Home } from "lucide-react";
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

interface LeaveRequest {
  id: string;
  uid: string;
  employeeID: string;
  name: string;
  email: string;
  projectId: string;
  projectName: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: "pending" | "approved" | "rejected" | "released";
  released?: boolean;
  releasedAt?: Timestamp;
  releasedBy?: string;
  createdAt: Timestamp;
}

interface WFHRequest {
  id: string;
  uid: string;
  employeeID: string;
  name: string;
  email: string;
  projectId: string;
  projectName: string;
  date: string;
  reason: string;
  status: "pending" | "approved" | "rejected" | "released";
  released?: boolean;
  releasedAt?: Timestamp;
  releasedBy?: string;
  createdAt: Timestamp;
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

  // Leave request state
  const [leaveStartDate, setLeaveStartDate] = useState("");
  const [leaveEndDate, setLeaveEndDate] = useState("");
  const [leaveReason, setLeaveReason] = useState("");
  const [leaveProjectId, setLeaveProjectId] = useState("");
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [loadingLeaves, setLoadingLeaves] = useState(true);

  // WFH request state
  const [wfhDate, setWfhDate] = useState("");
  const [wfhReason, setWfhReason] = useState("");
  const [wfhProjectId, setWfhProjectId] = useState("");
  const [wfhBusy, setWfhBusy] = useState(false);
  const [wfhRequests, setWfhRequests] = useState<WFHRequest[]>([]);
  const [loadingWfh, setLoadingWfh] = useState(true);

  const todayStr = format(new Date(), "yyyy-MM-dd");

  useEffect(() => {
    if (assignments.length === 1) setSelectedProjectId(assignments[0].projectId);
    else if (assignments.length > 0 && !selectedProjectId) setSelectedProjectId(assignments[0].projectId);
    // Set default for leave and WFH forms
    if (assignments.length === 1 && !leaveProjectId) setLeaveProjectId(assignments[0].projectId);
    if (assignments.length === 1 && !wfhProjectId) setWfhProjectId(assignments[0].projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignments.map((a) => a.projectId).join("|")]);

  const selectedAssignment = useMemo(
    () => assignments.find((a) => a.projectId === selectedProjectId) ?? null,
    [assignments, selectedProjectId],
  );

  const todayPresent = useMemo(
    () => todayAll.find((r) => r.status === "present"),
    [todayAll],
  );

  const approvedLeaveToday = useMemo(
    () => leaveRequests.some(
      (r) =>
        r.status === "approved" &&
        !r.released &&
        r.startDate <= todayStr &&
        r.endDate >= todayStr,
    ),
    [leaveRequests, todayStr],
  );

  const approvedWfhToday = useMemo(
    () => wfhRequests.some((r) => r.status === "approved" && !r.released && r.date === todayStr),
    [wfhRequests, todayStr],
  );

  const blockedByApprovedRequest = approvedLeaveToday || approvedWfhToday;

  const leaveSummary = useMemo(
    () => ({
      approved: leaveRequests.filter((r) => r.status === "approved").length,
      released: leaveRequests.filter((r) => r.status === "released").length,
      pending: leaveRequests.filter((r) => r.status === "pending").length,
      rejected: leaveRequests.filter((r) => r.status === "rejected").length,
    }),
    [leaveRequests],
  );

  const wfhSummary = useMemo(
    () => ({
      approved: wfhRequests.filter((r) => r.status === "approved").length,
      released: wfhRequests.filter((r) => r.status === "released").length,
      pending: wfhRequests.filter((r) => r.status === "pending").length,
      rejected: wfhRequests.filter((r) => r.status === "rejected").length,
    }),
    [wfhRequests],
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
    loadLeaveRequests();
    loadWfhRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadLeaveRequests = async () => {
    if (!user) return;
    setLoadingLeaves(true);
    try {
      const q = query(
        collection(db, "leaveRequests"),
        where("uid", "==", user.uid),
        orderBy("createdAt", "desc"),
        limit(10),
      );
      const snap = await getDocs(q);
      setLeaveRequests(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<LeaveRequest, "id">) })));
    } catch (e) {
      console.error("Load leave requests error:", e);
      toast.error(`Failed to load leave requests: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setLoadingLeaves(false);
    }
  };

  const loadWfhRequests = async () => {
    if (!user) return;
    setLoadingWfh(true);
    try {
      const q = query(
        collection(db, "wfhRequests"),
        where("uid", "==", user.uid),
        orderBy("createdAt", "desc"),
        limit(10),
      );
      const snap = await getDocs(q);
      setWfhRequests(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<WFHRequest, "id">) })));
    } catch (e) {
      console.error("Load WFH requests error:", e);
      toast.error(`Failed to load WFH requests: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setLoadingWfh(false);
    }
  };

  const onPunchIn = async () => {
    if (!profile || !user) return;
    if (blockedByApprovedRequest) {
      toast.error("You cannot punch in today because an approved WFH or leave request exists. Ask admin to release the request.");
      return;
    }
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

  const onSubmitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !user) return;
    if (!leaveProjectId) {
      toast.error("Please select a project.");
      return;
    }
    if (!leaveStartDate || !leaveEndDate) {
      toast.error("Please select start and end dates.");
      return;
    }
    if (leaveStartDate > leaveEndDate) {
      toast.error("End date must be after start date.");
      return;
    }
    if (!leaveReason.trim()) {
      toast.error("Please provide a reason.");
      return;
    }
    setLeaveBusy(true);
    try {
      const assignment = assignments.find((a) => a.projectId === leaveProjectId);
      await addDoc(collection(db, "leaveRequests"), {
        uid: user.uid,
        employeeID: profile.employeeID,
        name: profile.name,
        email: profile.email,
        projectId: leaveProjectId,
        projectName: assignment?.projectName ?? leaveProjectId,
        startDate: leaveStartDate,
        endDate: leaveEndDate,
        reason: leaveReason.trim(),
        status: "pending",
        released: false,
        createdAt: serverTimestamp(),
      });
      toast.success("Leave request submitted successfully");
      setLeaveStartDate("");
      setLeaveEndDate("");
      setLeaveReason("");
      setLeaveProjectId("");
      await loadLeaveRequests();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to submit leave request";
      toast.error(msg);
    } finally {
      setLeaveBusy(false);
    }
  };

  const onSubmitWfh = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !user) return;
    if (!wfhProjectId) {
      toast.error("Please select a project.");
      return;
    }
    if (!wfhDate) {
      toast.error("Please select a date.");
      return;
    }
    if (!wfhReason.trim()) {
      toast.error("Please provide a reason.");
      return;
    }
    setWfhBusy(true);
    try {
      const assignment = assignments.find((a) => a.projectId === wfhProjectId);
      await addDoc(collection(db, "wfhRequests"), {
        uid: user.uid,
        employeeID: profile.employeeID,
        name: profile.name,
        email: profile.email,
        projectId: wfhProjectId,
        projectName: assignment?.projectName ?? wfhProjectId,
        date: wfhDate,
        reason: wfhReason.trim(),
        status: "pending",
        released: false,
        createdAt: serverTimestamp(),
      });
      toast.success("WFH request submitted successfully");
      setWfhDate("");
      setWfhReason("");
      setWfhProjectId("");
      await loadWfhRequests();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to submit WFH request";
      toast.error(msg);
    } finally {
      setWfhBusy(false);
    }
  };

  const hasPunchedIn = !!todayPresent;
  const hasPunchedOut = !!todayPresent?.punchOutTime;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="rounded-lg p-4 fancy-gradient text-white card-entrance shimmer-card relative shadow-md">
        <h1 className="text-2xl font-bold">Welcome, {profile?.name}</h1>
        <p className="text-sm opacity-90">Employee ID: {profile?.employeeID}</p>
      </div>

      <Tabs defaultValue="attendance" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="leave">Leave</TabsTrigger>
          <TabsTrigger value="wfh">WFH</TabsTrigger>
        </TabsList>

        <TabsContent value="attendance" className="space-y-4">
          <Card className="card-hover card-entrance">
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
                <>
                  <Button onClick={onPunchIn} disabled={busy || !selectedAssignment || blockedByApprovedRequest} size="lg" className="h-14 w-full text-base">
                    {busy ? (
                      <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Getting location…</>
                    ) : (
                      <><MapPin className="mr-2 h-5 w-5" /> Punch In Now</>
                    )}
                  </Button>
                  {blockedByApprovedRequest ? (
                    <p className="mt-2 text-sm text-destructive">
                      You cannot punch in today because an approved leave or WFH request exists. Request admin release before trying again.
                    </p>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>

          <Card className="card-hover card-entrance">
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

          {blockedByApprovedRequest ? (
            <Card className="card-hover card-entrance border-destructive/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-4 w-4" /> Notice
                </CardTitle>
                <CardDescription>Approved leave or WFH locks out punch-in for today.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
                  {approvedLeaveToday ? (
                    <p>
                      You have an approved leave for today. If you decide to come to the office, request an admin to release the leave before punching in.
                    </p>
                  ) : (
                    <p>
                      You have an approved WFH for today. If you decide to come to the office, request an admin to release the WFH before punching in.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card className="card-hover card-entrance">
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
        </TabsContent>

        <TabsContent value="leave" className="space-y-4">
          <Card className="card-hover card-entrance">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Apply for Leave
              </CardTitle>
              <CardDescription>
                Submit a leave request with dates and reason. {leaveSummary.approved} approved, {leaveSummary.released} released, {leaveSummary.pending} pending, {leaveSummary.rejected} rejected.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmitLeave} className="space-y-4">
                {assignments.length > 1 && (
                  <div className="space-y-1.5">
                    <Label>Project</Label>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                      value={leaveProjectId}
                      onChange={(e) => setLeaveProjectId(e.target.value)}
                      disabled={leaveBusy}
                      required
                    >
                      <option value="">Select…</option>
                      {assignments.map((a) => (
                        <option key={a.projectId} value={a.projectId}>
                          {a.projectName ?? a.projectId} ({a.projectId})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Start date</Label>
                    <Input
                      type="date"
                      value={leaveStartDate}
                      onChange={(e) => setLeaveStartDate(e.target.value)}
                      disabled={leaveBusy}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>End date</Label>
                    <Input
                      type="date"
                      value={leaveEndDate}
                      onChange={(e) => setLeaveEndDate(e.target.value)}
                      disabled={leaveBusy}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Reason</Label>
                  <Input
                    value={leaveReason}
                    onChange={(e) => setLeaveReason(e.target.value)}
                    disabled={leaveBusy}
                    placeholder="Enter reason for leave..."
                    required
                  />
                </div>
                <Button type="submit" disabled={leaveBusy} className="w-full">
                  {leaveBusy ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…</>
                  ) : (
                    "Submit Leave Request"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="card-hover card-entrance">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-4 w-4" /> Recent Leave Requests
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingLeaves ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : leaveRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground">No leave requests yet.</p>
              ) : (
                <div className="divide-y rounded-md border">
                  {leaveRequests.map((r) => (
                    <div key={r.id} className="space-y-2 px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="secondary">{r.startDate} to {r.endDate}</Badge>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              r.status === "approved"
                                ? "default"
                                : r.status === "rejected"
                                ? "destructive"
                                : "secondary"
                            }
                          >
                            {r.status}
                          </Badge>
                          {r.status === "released" ? (
                            <Badge className="bg-emerald-500 text-emerald-foreground">Released</Badge>
                          ) : null}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">{r.projectName ?? r.projectId}</p>
                      <p className="text-xs">{r.reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="wfh" className="space-y-4">
          <Card className="card-hover card-entrance">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Home className="h-4 w-4" /> Apply for Work From Home
              </CardTitle>
              <CardDescription>
                Submit a WFH request with date and reason. {wfhSummary.approved} approved, {wfhSummary.released} released, {wfhSummary.pending} pending, {wfhSummary.rejected} rejected.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmitWfh} className="space-y-4">
                {assignments.length > 1 && (
                  <div className="space-y-1.5">
                    <Label>Project</Label>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                      value={wfhProjectId}
                      onChange={(e) => setWfhProjectId(e.target.value)}
                      disabled={wfhBusy}
                      required
                    >
                      <option value="">Select…</option>
                      {assignments.map((a) => (
                        <option key={a.projectId} value={a.projectId}>
                          {a.projectName ?? a.projectId} ({a.projectId})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={wfhDate}
                    onChange={(e) => setWfhDate(e.target.value)}
                    disabled={wfhBusy}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Reason</Label>
                  <Input
                    value={wfhReason}
                    onChange={(e) => setWfhReason(e.target.value)}
                    disabled={wfhBusy}
                    placeholder="Enter reason for WFH..."
                    required
                  />
                </div>
                <Button type="submit" disabled={wfhBusy} className="w-full">
                  {wfhBusy ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…</>
                  ) : (
                    "Submit WFH Request"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="card-hover card-entrance">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-4 w-4" /> Recent WFH Requests
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingWfh ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : wfhRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground">No WFH requests yet.</p>
              ) : (
                <div className="divide-y rounded-md border">
                  {wfhRequests.map((r) => (
                    <div key={r.id} className="space-y-2 px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="secondary">{r.date}</Badge>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              r.status === "approved"
                                ? "default"
                                : r.status === "rejected"
                                ? "destructive"
                                : "secondary"
                            }
                          >
                            {r.status}
                          </Badge>
                          {r.status === "released" ? (
                            <Badge className="bg-emerald-500 text-emerald-foreground">Released</Badge>
                          ) : null}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">{r.projectName ?? r.projectId}</p>
                      <p className="text-xs">{r.reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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

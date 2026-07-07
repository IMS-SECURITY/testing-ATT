import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db } from "@/lib/firebase";
import {
  collection, deleteDoc, doc, getDocs, query, serverTimestamp, updateDoc, where,
  orderBy, limit, addDoc,
} from "firebase/firestore";
import { format, parseISO, addDays, differenceInBusinessDays } from "date-fns";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { ProjectPicker, useAvailableProjects } from "@/components/ProjectPicker";
import { Check, X, Calendar, Home } from "lucide-react";

export const Route = createFileRoute("/admin/requests")({
  component: () => (
    <RequireAuth role="staff">
      <RequestsPage />
    </RequireAuth>
  ),
});

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
  releasedAt?: any;
  releasedBy?: string;
  createdAt?: any;
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
  releasedAt?: any;
  releasedBy?: string;
  createdAt?: any;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function RequestsPage() {
  const { profile, activeProjectId, setActiveProjectId, adminProjectIds } = useAuth();
  const isSuper = profile?.role === "superadmin";
  const isAdmin = profile?.role === "admin" || isSuper;
  const { projects } = useAvailableProjects();

  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [wfhRequests, setWfhRequests] = useState<WFHRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);
  const [selectedWfh, setSelectedWfh] = useState<WFHRequest | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<"approve" | "reject" | "release">("approve");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const scopeIds = activeProjectId
        ? [activeProjectId]
        : isSuper
        ? []
        : adminProjectIds;

      // Load leave requests
      const leaveSnaps = await Promise.all(
        isSuper && scopeIds.length === 0
          ? [getDocs(query(collection(db, "leaveRequests"), orderBy("createdAt", "desc"), limit(50)))]
          : chunk(scopeIds, 30).map((ids) =>
              getDocs(query(collection(db, "leaveRequests"), where("projectId", "in", ids), orderBy("createdAt", "desc"), limit(50))),
            ),
      );
      const leaveList = leaveSnaps.flatMap((s) => s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<LeaveRequest, "id">) })));
      setLeaveRequests(leaveList);

      // Load WFH requests
      const wfhSnaps = await Promise.all(
        isSuper && scopeIds.length === 0
          ? [getDocs(query(collection(db, "wfhRequests"), orderBy("createdAt", "desc"), limit(50)))]
          : chunk(scopeIds, 30).map((ids) =>
              getDocs(query(collection(db, "wfhRequests"), where("projectId", "in", ids), orderBy("createdAt", "desc"), limit(50))),
            ),
      );
      const wfhList = wfhSnaps.flatMap((s) => s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<WFHRequest, "id">) })));
      setWfhRequests(wfhList);
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

  const approveLeave = async (req: LeaveRequest) => {
    setBusy(true);
    try {
      // Update request status
      await updateDoc(doc(db, "leaveRequests", req.id), {
        status: "approved",
        released: false,
      });

      // Create attendance records for each day in the leave period
      const startDate = parseISO(req.startDate);
      const endDate = parseISO(req.endDate);
      let currentDate = startDate;

      while (currentDate <= endDate) {
        const dateStr = format(currentDate, "yyyy-MM-dd");
        
        // Create attendance record with "leave" status
        await addDoc(collection(db, "attendance"), {
          uid: req.uid,
          employeeID: req.employeeID,
          name: req.name,
          email: req.email,
          date: dateStr,
          time: "00:00:00",
          projectId: req.projectId,
          projectName: req.projectName,
          status: "leave",
          leaveReason: req.reason,
          lat: 0,
          lng: 0,
          createdAt: serverTimestamp(),
        });

        currentDate = addDays(currentDate, 1);
      }

      // Update employee's used leaves count
      const daysCount = differenceInBusinessDays(endDate, startDate) + 1;
      const empRef = doc(db, "employees", req.uid);
      const empSnap = await getDocs(query(collection(db, "employees"), where("uid", "==", req.uid)));
      if (!empSnap.empty) {
        const empData = empSnap.docs[0].data();
        const currentUsedLeaves = empData.usedLeaves ?? 0;
        await updateDoc(empRef, {
          usedLeaves: currentUsedLeaves + daysCount,
        });
      }

      toast.success("Leave approved and attendance records created");
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to approve leave";
      toast.error(msg);
    } finally {
      setBusy(false);
      setActionDialogOpen(false);
      setSelectedLeave(null);
    }
  };

  const rejectLeave = async (req: LeaveRequest) => {
    setBusy(true);
    try {
      await updateDoc(doc(db, "leaveRequests", req.id), {
        status: "rejected",
      });
      toast.success("Leave request rejected");
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to reject leave";
      toast.error(msg);
    } finally {
      setBusy(false);
      setActionDialogOpen(false);
      setSelectedLeave(null);
    }
  };

  const releaseLeave = async (req: LeaveRequest) => {
    setBusy(true);
    try {
      await updateDoc(doc(db, "leaveRequests", req.id), {
        status: "released",
        released: true,
        releasedAt: serverTimestamp(),
        releasedBy: profile?.email ?? "",
      });
      toast.success("Leave request released");
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to release leave";
      toast.error(msg);
    } finally {
      setBusy(false);
      setActionDialogOpen(false);
      setSelectedLeave(null);
    }
  };

  const approveWfh = async (req: WFHRequest) => {
    setBusy(true);
    try {
      // Update request status
      await updateDoc(doc(db, "wfhRequests", req.id), {
        status: "approved",
        released: false,
      });

      // Create attendance record with "wfh" status
      await addDoc(collection(db, "attendance"), {
        uid: req.uid,
        employeeID: req.employeeID,
        name: req.name,
        email: req.email,
        date: req.date,
        time: "00:00:00",
        projectId: req.projectId,
        projectName: req.projectName,
        status: "wfh",
        wfhReason: req.reason,
        lat: 0,
        lng: 0,
        createdAt: serverTimestamp(),
      });

      toast.success("WFH approved and attendance record created");
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to approve WFH";
      toast.error(msg);
    } finally {
      setBusy(false);
      setActionDialogOpen(false);
      setSelectedWfh(null);
    }
  };

  const rejectWfh = async (req: WFHRequest) => {
    setBusy(true);
    try {
      await updateDoc(doc(db, "wfhRequests", req.id), {
        status: "rejected",
      });
      toast.success("WFH request rejected");
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to reject WFH";
      toast.error(msg);
    } finally {
      setBusy(false);
      setActionDialogOpen(false);
      setSelectedWfh(null);
    }
  };

  const releaseWfh = async (req: WFHRequest) => {
    setBusy(true);
    try {
      await updateDoc(doc(db, "wfhRequests", req.id), {
        status: "released",
        released: true,
        releasedAt: serverTimestamp(),
        releasedBy: profile?.email ?? "",
      });
      toast.success("WFH request released");
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to release WFH";
      toast.error(msg);
    } finally {
      setBusy(false);
      setActionDialogOpen(false);
      setSelectedWfh(null);
    }
  };

  const handleLeaveAction = (req: LeaveRequest, action: "approve" | "reject" | "release") => {
    setSelectedLeave(req);
    setActionType(action);
    setActionDialogOpen(true);
  };

  const handleWfhAction = (req: WFHRequest, action: "approve" | "reject" | "release") => {
    setSelectedWfh(req);
    setActionType(action);
    setActionDialogOpen(true);
  };

  const confirmAction = () => {
    if (selectedLeave) {
      if (actionType === "approve") approveLeave(selectedLeave);
      else if (actionType === "reject") rejectLeave(selectedLeave);
      else if (actionType === "release") releaseLeave(selectedLeave);
    } else if (selectedWfh) {
      if (actionType === "approve") approveWfh(selectedWfh);
      else if (actionType === "reject") rejectWfh(selectedWfh);
      else if (actionType === "release") releaseWfh(selectedWfh);
    }
  };

  const pendingLeaves = leaveRequests.filter((r) => r.status === "pending");
  const approvedLeaves = leaveRequests.filter((r) => r.status === "approved");
  const releasedLeaves = leaveRequests.filter((r) => r.status === "released");
  const rejectedLeaves = leaveRequests.filter((r) => r.status === "rejected");

  const pendingWfh = wfhRequests.filter((r) => r.status === "pending");
  const approvedWfh = wfhRequests.filter((r) => r.status === "approved");
  const releasedWfh = wfhRequests.filter((r) => r.status === "released");
  const rejectedWfh = wfhRequests.filter((r) => r.status === "rejected");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Leave & WFH Requests</h1>
          <p className="text-sm text-muted-foreground">Review and approve employee leave and work from home requests.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ProjectPicker projects={projects} value={activeProjectId} onChange={setActiveProjectId} />
        </div>
      </div>

      <Tabs defaultValue="leave" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="leave">
            Leave Requests {pendingLeaves.length > 0 && <span className="ml-2 rounded-full bg-primary px-2 text-xs text-primary-foreground">{pendingLeaves.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="wfh">
            WFH Requests {pendingWfh.length > 0 && <span className="ml-2 rounded-full bg-primary px-2 text-xs text-primary-foreground">{pendingWfh.length}</span>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="leave" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Leave Requests
              </CardTitle>
              <CardDescription>
                {pendingLeaves.length} pending, {approvedLeaves.length} approved, {releasedLeaves.length} released, {rejectedLeaves.length} rejected
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : leaveRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground">No leave requests yet.</p>
              ) : (
                <div className="divide-y rounded-md border">
                  {leaveRequests.map((r) => (
                    <div key={r.id} className="space-y-2 px-3 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{r.name} ({r.employeeID})</p>
                          <p className="text-xs text-muted-foreground">{r.email}</p>
                        </div>
                        <div className="flex gap-1">
                          <Badge variant="secondary">{r.projectName ?? r.projectId}</Badge>
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
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <Badge variant="outline">{r.startDate} to {r.endDate}</Badge>
                      </div>
                      <p className="text-sm">{r.reason}</p>
                      {isAdmin && (
                        <div className="flex flex-wrap gap-2 pt-2">
                          {r.status === "pending" ? (
                            <>
                              <Button
                                size="sm"
                                onClick={() => handleLeaveAction(r, "approve")}
                                disabled={busy}
                              >
                                <Check className="mr-1 h-4 w-4" /> Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleLeaveAction(r, "reject")}
                                disabled={busy}
                              >
                                <X className="mr-1 h-4 w-4" /> Reject
                              </Button>
                            </>
                          ) : r.status === "approved" && !r.released ? (
                            <Button
                              size="sm"
                              onClick={() => handleLeaveAction(r, "release")}
                              disabled={busy}
                            >
                              <Check className="mr-1 h-4 w-4" /> Release
                            </Button>
                          ) : null}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="wfh" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Home className="h-4 w-4" /> WFH Requests
              </CardTitle>
              <CardDescription>
                {pendingWfh.length} pending, {approvedWfh.length} approved, {releasedWfh.length} released, {rejectedWfh.length} rejected
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : wfhRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground">No WFH requests yet.</p>
              ) : (
                <div className="divide-y rounded-md border">
                  {wfhRequests.map((r) => (
                    <div key={r.id} className="space-y-2 px-3 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{r.name} ({r.employeeID})</p>
                          <p className="text-xs text-muted-foreground">{r.email}</p>
                        </div>
                        <div className="flex gap-1">
                          <Badge variant="secondary">{r.projectName ?? r.projectId}</Badge>
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
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <Badge variant="outline">{r.date}</Badge>
                      </div>
                      <p className="text-sm">{r.reason}</p>
                      {isAdmin && (
                        <div className="flex flex-wrap gap-2 pt-2">
                          {r.status === "pending" ? (
                            <>
                              <Button
                                size="sm"
                                onClick={() => handleWfhAction(r, "approve")}
                                disabled={busy}
                              >
                                <Check className="mr-1 h-4 w-4" /> Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleWfhAction(r, "reject")}
                                disabled={busy}
                              >
                                <X className="mr-1 h-4 w-4" /> Reject
                              </Button>
                            </>
                          ) : r.status === "approved" && !r.released ? (
                            <Button
                              size="sm"
                              onClick={() => handleWfhAction(r, "release")}
                              disabled={busy}
                            >
                              <Check className="mr-1 h-4 w-4" /> Release
                            </Button>
                          ) : null}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === "approve"
                ? "Approve Request"
                : actionType === "reject"
                ? "Reject Request"
                : "Release Request"}
            </DialogTitle>
            <DialogDescription>
              {actionType === "approve"
                ? "This will create attendance records and update leave counts. Are you sure?"
                : actionType === "reject"
                ? "This will reject the request. The employee will be notified."
                : "This will release the approved request and allow the employee to punch in again."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialogOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant={actionType === "reject" ? "destructive" : "default"}
              onClick={confirmAction}
              disabled={busy}
            >
              {busy
                ? "Processing…"
                : actionType === "approve"
                ? "Approve"
                : actionType === "reject"
                ? "Reject"
                : "Release"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { useMemo, useState, useEffect } from "react";
import { R as RequireAuth } from "./RequireAuth-BnkDJcWl.js";
import { u as useAuth, e as effectiveAssignments, d as db } from "./router-B753KT4Y.js";
import { C as Card, a as CardHeader, b as CardTitle, c as CardDescription, d as CardContent, B as Button } from "./card-BXMydX4U.js";
import { B as Badge } from "./badge-Cjy_ry0J.js";
import { L as Label, I as Input } from "./label-DGkNwAzF.js";
import { D as Dialog, a as DialogContent, b as DialogHeader, c as DialogTitle, e as DialogDescription, d as DialogFooter } from "./dialog-BXiTal8K.js";
import { MapPin, Loader2, LogOut, Clock } from "lucide-react";
import { query, collection, where, getDocs, orderBy, limit, addDoc, serverTimestamp, updateDoc, doc } from "firebase/firestore";
import { toast } from "sonner";
import { format } from "date-fns";
import "@tanstack/react-router";
import "@tanstack/react-query";
import "firebase/auth";
import "firebase/app";
import "@radix-ui/react-slot";
import "class-variance-authority";
import "clsx";
import "tailwind-merge";
import "@radix-ui/react-label";
import "@radix-ui/react-dialog";
function distanceKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => d * Math.PI / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Geolocation not supported"));
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15e3,
      maximumAge: 0
    });
  });
}
const CONFIRM_PHRASE = "punch out";
function PunchPage() {
  const {
    profile,
    user
  } = useAuth();
  const assignments = useMemo(() => effectiveAssignments(profile), [profile]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [todayAll, setTodayAll] = useState([]);
  const [loadingToday, setLoadingToday] = useState(true);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const todayStr = format(/* @__PURE__ */ new Date(), "yyyy-MM-dd");
  useEffect(() => {
    if (assignments.length === 1) setSelectedProjectId(assignments[0].projectId);
    else if (assignments.length > 0 && !selectedProjectId) setSelectedProjectId(assignments[0].projectId);
  }, [assignments.map((a) => a.projectId).join("|")]);
  const selectedAssignment = useMemo(() => assignments.find((a) => a.projectId === selectedProjectId) ?? null, [assignments, selectedProjectId]);
  const todayPresent = useMemo(() => todayAll.find((r) => r.status !== "on_duty"), [todayAll]);
  const loadToday = async () => {
    if (!user) return;
    setLoadingToday(true);
    try {
      const q = query(collection(db, "attendance"), where("uid", "==", user.uid), where("date", "==", todayStr));
      const snap = await getDocs(q);
      setTodayAll(snap.docs.map((d) => ({
        id: d.id,
        ...d.data()
      })));
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
      const q = query(collection(db, "attendance"), where("uid", "==", user.uid), orderBy("date", "desc"), limit(60));
      const snap = await getDocs(q);
      setHistory(snap.docs.map((d) => ({
        id: d.id,
        ...d.data()
      })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingHistory(false);
    }
  };
  useEffect(() => {
    loadToday();
    loadHistory();
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
      const {
        latitude,
        longitude
      } = pos.coords;
      const dist = distanceKm(latitude, longitude, selectedAssignment.officeLat, selectedAssignment.officeLng);
      if (dist > 1) {
        toast.error(`You're ${dist.toFixed(2)} km from the ${selectedAssignment.projectName ?? selectedAssignment.projectId} office. Must be within 1 km.`);
        setBusy(false);
        return;
      }
      const now = /* @__PURE__ */ new Date();
      const base = {
        uid: user.uid,
        employeeID: profile.employeeID,
        name: profile.name,
        email: profile.email,
        date: format(now, "yyyy-MM-dd"),
        time: format(now, "HH:mm:ss")
      };
      await addDoc(collection(db, "attendance"), {
        ...base,
        projectId: selectedAssignment.projectId,
        projectName: selectedAssignment.projectName ?? selectedAssignment.projectId,
        lat: latitude,
        lng: longitude,
        distanceKm: dist,
        status: "present",
        createdAt: serverTimestamp()
      });
      const others = assignments.filter((a) => a.projectId !== selectedAssignment.projectId);
      await Promise.all(others.map((a) => addDoc(collection(db, "attendance"), {
        ...base,
        projectId: a.projectId,
        projectName: a.projectName ?? a.projectId,
        lat: latitude,
        lng: longitude,
        status: "on_duty",
        onDutyAt: selectedAssignment.projectId,
        onDutyAtName: selectedAssignment.projectName ?? selectedAssignment.projectId,
        createdAt: serverTimestamp()
      })));
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
      const {
        latitude,
        longitude
      } = pos.coords;
      const dist = distanceKm(latitude, longitude, a.officeLat, a.officeLng);
      if (dist > 1) {
        toast.error(`You're ${dist.toFixed(2)} km from the office. Punch-out must be within 1 km.`);
        setBusy(false);
        return;
      }
      const now = /* @__PURE__ */ new Date();
      await updateDoc(doc(db, "attendance", todayPresent.id), {
        punchOutTime: format(now, "HH:mm:ss"),
        punchOutLat: latitude,
        punchOutLng: longitude,
        punchOutDistanceKm: dist,
        punchOutAt: serverTimestamp()
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
  return /* @__PURE__ */ jsxs("div", { className: "mx-auto max-w-2xl space-y-6", children: [
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsxs("h1", { className: "text-2xl font-bold", children: [
        "Welcome, ",
        profile?.name
      ] }),
      /* @__PURE__ */ jsxs("p", { className: "text-sm text-muted-foreground", children: [
        "Employee ID: ",
        profile?.employeeID
      ] })
    ] }),
    /* @__PURE__ */ jsxs(Card, { children: [
      /* @__PURE__ */ jsxs(CardHeader, { children: [
        /* @__PURE__ */ jsx(CardTitle, { children: hasPunchedOut ? "Today's attendance" : hasPunchedIn ? "Punch Out" : "Punch In" }),
        /* @__PURE__ */ jsx(CardDescription, { children: hasPunchedOut ? "You have completed today's attendance." : "You must be within 1 km of the selected project's office." })
      ] }),
      /* @__PURE__ */ jsxs(CardContent, { className: "space-y-4", children: [
        !hasPunchedIn && assignments.length > 1 && /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsx(Label, { children: "Project" }),
          /* @__PURE__ */ jsx("select", { className: "h-10 w-full rounded-md border bg-background px-2 text-sm", value: selectedProjectId, onChange: (e) => setSelectedProjectId(e.target.value), disabled: busy, children: assignments.map((a) => /* @__PURE__ */ jsxs("option", { value: a.projectId, children: [
            a.projectName ?? a.projectId,
            " (",
            a.projectId,
            ")"
          ] }, a.projectId)) })
        ] }),
        selectedAssignment && /* @__PURE__ */ jsx("div", { className: "rounded-lg bg-muted p-4 text-sm", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-muted-foreground", children: [
          /* @__PURE__ */ jsx(MapPin, { className: "h-4 w-4" }),
          selectedAssignment.projectName ?? selectedAssignment.projectId,
          " office:",
          " ",
          selectedAssignment.officeLat?.toFixed(5),
          ", ",
          selectedAssignment.officeLng?.toFixed(5)
        ] }) }),
        loadingToday ? /* @__PURE__ */ jsxs(Button, { disabled: true, size: "lg", className: "h-14 w-full text-base", children: [
          /* @__PURE__ */ jsx(Loader2, { className: "mr-2 h-5 w-5 animate-spin" }),
          " Loading…"
        ] }) : hasPunchedOut ? /* @__PURE__ */ jsx(Button, { disabled: true, size: "lg", className: "h-14 w-full text-base", children: "Attendance completed for today" }) : hasPunchedIn ? /* @__PURE__ */ jsxs(Button, { onClick: () => setConfirmOpen(true), disabled: busy, size: "lg", variant: "destructive", className: "h-14 w-full text-base", children: [
          /* @__PURE__ */ jsx(LogOut, { className: "mr-2 h-5 w-5" }),
          " Punch Out"
        ] }) : /* @__PURE__ */ jsx(Button, { onClick: onPunchIn, disabled: busy || !selectedAssignment, size: "lg", className: "h-14 w-full text-base", children: busy ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Loader2, { className: "mr-2 h-5 w-5 animate-spin" }),
          " Getting location…"
        ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(MapPin, { className: "mr-2 h-5 w-5" }),
          " Punch In Now"
        ] }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs(Card, { children: [
      /* @__PURE__ */ jsx(CardHeader, { children: /* @__PURE__ */ jsxs(CardTitle, { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx(Clock, { className: "h-4 w-4" }),
        " Today"
      ] }) }),
      /* @__PURE__ */ jsx(CardContent, { children: loadingToday ? /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground", children: "Loading…" }) : todayAll.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground", children: "No punch-in yet today." }) : /* @__PURE__ */ jsx("div", { className: "space-y-2 text-sm", children: todayAll.map((r) => /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-2 rounded-md border p-2", children: [
        /* @__PURE__ */ jsx(Badge, { variant: "secondary", children: r.projectName ?? r.projectId ?? "—" }),
        r.status === "on_duty" ? /* @__PURE__ */ jsx(Badge, { className: "bg-amber-500 hover:bg-amber-500", children: "On Duty" }) : /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsxs(Badge, { children: [
            "In: ",
            r.time
          ] }),
          r.punchOutTime && /* @__PURE__ */ jsxs(Badge, { variant: "outline", children: [
            "Out: ",
            r.punchOutTime
          ] })
        ] })
      ] }, r.id)) }) })
    ] }),
    /* @__PURE__ */ jsxs(Card, { children: [
      /* @__PURE__ */ jsxs(CardHeader, { children: [
        /* @__PURE__ */ jsxs(CardTitle, { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsx(Clock, { className: "h-4 w-4" }),
          " Past attendance"
        ] }),
        /* @__PURE__ */ jsx(CardDescription, { children: "Your recent punch-in and punch-out history." })
      ] }),
      /* @__PURE__ */ jsx(CardContent, { children: loadingHistory ? /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground", children: "Loading…" }) : history.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground", children: "No past attendance yet." }) : /* @__PURE__ */ jsx("div", { className: "divide-y rounded-md border", children: history.map((r) => /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsx(Badge, { variant: "secondary", children: r.date }),
          /* @__PURE__ */ jsx("span", { className: "text-xs text-muted-foreground", children: r.projectName ?? r.projectId ?? "—" })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-2", children: r.status === "on_duty" ? /* @__PURE__ */ jsx(Badge, { className: "bg-amber-500 hover:bg-amber-500", children: "On Duty" }) : /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsxs(Badge, { children: [
            "In: ",
            r.time
          ] }),
          r.punchOutTime ? /* @__PURE__ */ jsxs(Badge, { variant: "outline", children: [
            "Out: ",
            r.punchOutTime
          ] }) : /* @__PURE__ */ jsx(Badge, { variant: "destructive", children: "No punch-out" })
        ] }) })
      ] }, r.id)) }) })
    ] }),
    /* @__PURE__ */ jsx(Dialog, { open: confirmOpen, onOpenChange: (o) => {
      setConfirmOpen(o);
      if (!o) setConfirmText("");
    }, children: /* @__PURE__ */ jsxs(DialogContent, { children: [
      /* @__PURE__ */ jsxs(DialogHeader, { children: [
        /* @__PURE__ */ jsx(DialogTitle, { children: "Confirm punch out" }),
        /* @__PURE__ */ jsxs(DialogDescription, { children: [
          "This will end your attendance for today. Type ",
          /* @__PURE__ */ jsx("strong", { children: CONFIRM_PHRASE }),
          " below to confirm."
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
        /* @__PURE__ */ jsx(Label, { htmlFor: "confirm", children: "Confirmation" }),
        /* @__PURE__ */ jsx(Input, { id: "confirm", autoComplete: "off", value: confirmText, onChange: (e) => setConfirmText(e.target.value), placeholder: CONFIRM_PHRASE })
      ] }),
      /* @__PURE__ */ jsxs(DialogFooter, { children: [
        /* @__PURE__ */ jsx(Button, { variant: "outline", onClick: () => setConfirmOpen(false), disabled: busy, children: "Cancel" }),
        /* @__PURE__ */ jsx(Button, { variant: "destructive", onClick: onPunchOutConfirmed, disabled: busy || confirmText.trim().toLowerCase() !== CONFIRM_PHRASE, children: busy ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }),
          " Punching out…"
        ] }) : "Confirm Punch Out" })
      ] })
    ] }) })
  ] });
}
const SplitComponent = () => /* @__PURE__ */ jsx(RequireAuth, { children: /* @__PURE__ */ jsx(PunchPage, {}) });
export {
  SplitComponent as component
};

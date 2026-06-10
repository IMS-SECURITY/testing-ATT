import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, useRouter, Link, Outlet, HeadContent, Scripts, createFileRoute, lazyRouteComponent, redirect, createRouter } from "@tanstack/react-router";
import { jsx, jsxs } from "react/jsx-runtime";
import { useState, useEffect, createContext, useContext } from "react";
import { getAuth, onAuthStateChanged, updatePassword, signOut, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { getApps, initializeApp } from "firebase/app";
import { Toaster as Toaster$1 } from "sonner";
const appCss = "/assets/styles-B47Mvsa2.css";
const firebaseConfig = {
  apiKey: "AIzaSyBgJiz1G6YReokfrWOTEPfpfz0LoNwwsuw",
  authDomain: "attendance-management-f3b85.firebaseapp.com",
  projectId: "attendance-management-f3b85",
  storageBucket: "attendance-management-f3b85.firebasestorage.app",
  messagingSenderId: "290989855696",
  appId: "1:290989855696:web:48666bd856a7169cee5fd5"
};
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const SEED_ADMIN_EMAIL = "mohanrammurugesan1@gmail.com";
const ACTIVE_KEY = "activeProjectId";
function readActive() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(ACTIVE_KEY) ?? "";
}
function effectiveAssignments(p) {
  if (!p) return [];
  if (p.assignments && p.assignments.length > 0) return p.assignments;
  if (p.projectId) {
    return [{
      projectId: p.projectId,
      projectName: p.projectName ?? p.projectId,
      officeLat: p.officeLat ?? 0,
      officeLng: p.officeLng ?? 0
    }];
  }
  return [];
}
const Ctx = createContext(null);
function effectiveAdminProjects(p) {
  if (!p) return [];
  const list = /* @__PURE__ */ new Set();
  (p.adminProjects ?? []).forEach((x) => x && list.add(x));
  if (p.projectId && p.role === "admin") list.add(p.projectId);
  return Array.from(list);
}
function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeProjectId, setActiveProjectIdState] = useState(readActive());
  const setActiveProjectId = (id) => {
    setActiveProjectIdState(id);
    if (typeof window !== "undefined") {
      if (id) localStorage.setItem(ACTIVE_KEY, id);
      else localStorage.removeItem(ACTIVE_KEY);
    }
  };
  const loadProfile = async (u) => {
    setProfileError(null);
    const ref = doc(db, "employees", u.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      if (u.email?.toLowerCase() === SEED_ADMIN_EMAIL.toLowerCase()) {
        const seed = {
          employeeID: "SUPER-001",
          name: "Super Administrator",
          email: u.email,
          officeLat: 0,
          officeLng: 0,
          role: "superadmin",
          projectId: null
        };
        await setDoc(ref, { ...seed, createdAt: serverTimestamp() });
        setProfile(seed);
        return seed;
      }
      setProfile(null);
      setProfileError(`No employee profile exists for ${u.email ?? "this account"}.`);
      return null;
    }
    const employee = snap.data();
    if (employee.role === "leader") employee.role = "employee";
    if (u.email?.toLowerCase() === SEED_ADMIN_EMAIL.toLowerCase() && employee.role !== "superadmin") {
      await setDoc(ref, { ...employee, role: "superadmin" }, { merge: true });
      employee.role = "superadmin";
    }
    setProfile(employee);
    return employee;
  };
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          await loadProfile(u);
        } catch (e) {
          console.error("Failed to load profile", e);
          setProfile(null);
          setProfileError(
            e instanceof Error ? e.message : "Unable to load your employee profile from Firebase."
          );
        }
      } else {
        setProfile(null);
        setProfileError(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);
  const value = {
    user,
    profile,
    loading,
    profileError,
    activeProjectId,
    setActiveProjectId,
    adminProjectIds: effectiveAdminProjects(profile),
    signIn: async (email, password) => {
      setLoading(true);
      try {
        const credential = await signInWithEmailAndPassword(auth, email, password);
        setUser(credential.user);
        const p = await loadProfile(credential.user);
        if (p) {
          if (p.role === "superadmin") {
            setActiveProjectId("");
          } else if (p.role === "admin") {
            const projects = effectiveAdminProjects(p);
            setActiveProjectId(projects[0] ?? "");
          } else {
            setActiveProjectId("");
          }
        }
        return p;
      } finally {
        setLoading(false);
      }
    },
    signOut: async () => {
      setActiveProjectId("");
      await signOut(auth);
    },
    changePassword: async (newPassword) => {
      if (!auth.currentUser) throw new Error("Not signed in");
      await updatePassword(auth.currentUser, newPassword);
    },
    refreshProfile: async () => {
      if (auth.currentUser) await loadProfile(auth.currentUser);
    }
  };
  return /* @__PURE__ */ jsx(Ctx.Provider, { value, children });
}
function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
const Toaster = ({ ...props }) => {
  return /* @__PURE__ */ jsx(
    Toaster$1,
    {
      className: "toaster group",
      toastOptions: {
        classNames: {
          toast: "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground"
        }
      },
      ...props
    }
  );
};
function NotFoundComponent() {
  return /* @__PURE__ */ jsx("div", { className: "flex min-h-screen items-center justify-center bg-background px-4", children: /* @__PURE__ */ jsxs("div", { className: "max-w-md text-center", children: [
    /* @__PURE__ */ jsx("h1", { className: "text-7xl font-bold text-foreground", children: "404" }),
    /* @__PURE__ */ jsx("h2", { className: "mt-4 text-xl font-semibold text-foreground", children: "Page not found" }),
    /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm text-muted-foreground", children: "The page you're looking for doesn't exist or has been moved." }),
    /* @__PURE__ */ jsx("div", { className: "mt-6", children: /* @__PURE__ */ jsx(
      Link,
      {
        to: "/",
        className: "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
        children: "Go home"
      }
    ) })
  ] }) });
}
function ErrorComponent({ error, reset }) {
  console.error(error);
  const router2 = useRouter();
  return /* @__PURE__ */ jsx("div", { className: "flex min-h-screen items-center justify-center bg-background px-4", children: /* @__PURE__ */ jsxs("div", { className: "max-w-md text-center", children: [
    /* @__PURE__ */ jsx("h1", { className: "text-xl font-semibold tracking-tight text-foreground", children: "This page didn't load" }),
    /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm text-muted-foreground", children: "Something went wrong on our end. You can try refreshing or head back home." }),
    /* @__PURE__ */ jsxs("div", { className: "mt-6 flex flex-wrap justify-center gap-2", children: [
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => {
            router2.invalidate();
            reset();
          },
          className: "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
          children: "Try again"
        }
      ),
      /* @__PURE__ */ jsx(
        "a",
        {
          href: "/",
          className: "inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent",
          children: "Go home"
        }
      )
    ] })
  ] }) });
}
const Route$8 = createRootRouteWithContext()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "TVSE Attendance Monitoring" },
      { name: "description", content: "Attendance Monitoring by TVSE" },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "TVSE Attendance Monitoring" },
      { property: "og:description", content: "Attendance Monitoring by TVSE" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "TVSE Attendance Monitoring" },
      { name: "twitter:description", content: "Attendance Monitoring by TVSE" },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/ea55ff87-eebc-4967-bb14-b527074d0ac3/id-preview-81f1ea8c--505449bb-db65-4791-ae82-455ee68152e5.lovable.app-1780550528890.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/ea55ff87-eebc-4967-bb14-b527074d0ac3/id-preview-81f1ea8c--505449bb-db65-4791-ae82-455ee68152e5.lovable.app-1780550528890.png" }
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss
      }
    ]
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent
});
function RootShell({ children }) {
  return /* @__PURE__ */ jsxs("html", { lang: "en", children: [
    /* @__PURE__ */ jsx("head", { children: /* @__PURE__ */ jsx(HeadContent, {}) }),
    /* @__PURE__ */ jsxs("body", { children: [
      children,
      /* @__PURE__ */ jsx(Scripts, {})
    ] })
  ] });
}
function RootComponent() {
  const { queryClient } = Route$8.useRouteContext();
  return /* @__PURE__ */ jsx(QueryClientProvider, { client: queryClient, children: /* @__PURE__ */ jsxs(AuthProvider, { children: [
    /* @__PURE__ */ jsx(Outlet, {}),
    /* @__PURE__ */ jsx(Toaster, { richColors: true, position: "top-right" })
  ] }) });
}
const $$splitComponentImporter$6 = () => import("./super-MuL5c9G7.js");
const Route$7 = createFileRoute("/super")({
  component: lazyRouteComponent($$splitComponentImporter$6, "component")
});
const $$splitComponentImporter$5 = () => import("./login-CGVpKVgl.js");
const Route$6 = createFileRoute("/login")({
  component: lazyRouteComponent($$splitComponentImporter$5, "component")
});
const Route$5 = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/login" });
  }
});
const $$splitComponentImporter$4 = () => import("./app.index-BN5bkqeu.js");
const Route$4 = createFileRoute("/app/")({
  component: lazyRouteComponent($$splitComponentImporter$4, "component")
});
const $$splitComponentImporter$3 = () => import("./admin.index-CM93FQ3z.js");
const Route$3 = createFileRoute("/admin/")({
  component: lazyRouteComponent($$splitComponentImporter$3, "component")
});
const $$splitComponentImporter$2 = () => import("./app.change-password-B1SRP7ZS.js");
const Route$2 = createFileRoute("/app/change-password")({
  component: lazyRouteComponent($$splitComponentImporter$2, "component")
});
const $$splitComponentImporter$1 = () => import("./admin.employees-e2bwLCK0.js");
const Route$1 = createFileRoute("/admin/employees")({
  component: lazyRouteComponent($$splitComponentImporter$1, "component")
});
const $$splitComponentImporter = () => import("./admin.attendance-DfRQRejx.js");
const Route = createFileRoute("/admin/attendance")({
  component: lazyRouteComponent($$splitComponentImporter, "component")
});
const SuperRoute = Route$7.update({
  id: "/super",
  path: "/super",
  getParentRoute: () => Route$8
});
const LoginRoute = Route$6.update({
  id: "/login",
  path: "/login",
  getParentRoute: () => Route$8
});
const IndexRoute = Route$5.update({
  id: "/",
  path: "/",
  getParentRoute: () => Route$8
});
const AppIndexRoute = Route$4.update({
  id: "/app/",
  path: "/app/",
  getParentRoute: () => Route$8
});
const AdminIndexRoute = Route$3.update({
  id: "/admin/",
  path: "/admin/",
  getParentRoute: () => Route$8
});
const AppChangePasswordRoute = Route$2.update({
  id: "/app/change-password",
  path: "/app/change-password",
  getParentRoute: () => Route$8
});
const AdminEmployeesRoute = Route$1.update({
  id: "/admin/employees",
  path: "/admin/employees",
  getParentRoute: () => Route$8
});
const AdminAttendanceRoute = Route.update({
  id: "/admin/attendance",
  path: "/admin/attendance",
  getParentRoute: () => Route$8
});
const rootRouteChildren = {
  IndexRoute,
  LoginRoute,
  SuperRoute,
  AdminAttendanceRoute,
  AdminEmployeesRoute,
  AppChangePasswordRoute,
  AdminIndexRoute,
  AppIndexRoute
};
const routeTree = Route$8._addFileChildren(rootRouteChildren)._addFileTypes();
const getRouter = () => {
  const queryClient = new QueryClient();
  const router2 = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0
  });
  return router2;
};
const router = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  getRouter
}, Symbol.toStringTag, { value: "Module" }));
export {
  auth as a,
  app as b,
  db as d,
  effectiveAssignments as e,
  router as r,
  useAuth as u
};

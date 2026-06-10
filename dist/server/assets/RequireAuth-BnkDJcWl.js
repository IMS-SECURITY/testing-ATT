import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { useEffect } from "react";
import { useNavigate, useRouterState, Link } from "@tanstack/react-router";
import { u as useAuth } from "./router-B753KT4Y.js";
import { B as Button } from "./card-BXMydX4U.js";
import { MapPin, Shield, LayoutDashboard, Users, ClipboardList, KeyRound, LogOut } from "lucide-react";
function RequireAuth({
  children,
  role
}) {
  const { user, profile, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const { location } = useRouterState();
  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/login" });
  }, [loading, user, navigate]);
  if (loading || !user) {
    return /* @__PURE__ */ jsx("div", { className: "flex min-h-screen items-center justify-center text-muted-foreground", children: "Loading…" });
  }
  if (!profile) {
    return /* @__PURE__ */ jsxs("div", { className: "flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center", children: [
      /* @__PURE__ */ jsx("h1", { className: "text-xl font-semibold", children: "No employee profile" }),
      /* @__PURE__ */ jsxs("p", { className: "max-w-md text-sm text-muted-foreground", children: [
        "Your account exists in Firebase Auth but has no employee profile yet. Ask an admin to create one for ",
        user.email,
        "."
      ] }),
      /* @__PURE__ */ jsx(Button, { variant: "outline", onClick: () => signOut(), children: "Sign out" })
    ] });
  }
  const homeFor = (r) => {
    if (r === "superadmin") return "/super";
    if (r === "admin") return "/admin";
    return "/app";
  };
  const isSuper = profile.role === "superadmin";
  const isAdmin = profile.role === "admin";
  const isStaff = isAdmin || isSuper;
  const allowed = !role || isSuper || (role === "super" ? false : role === "staff" ? isAdmin : profile.role === role);
  if (!allowed) {
    return /* @__PURE__ */ jsxs("div", { className: "flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center", children: [
      /* @__PURE__ */ jsx("h1", { className: "text-xl font-semibold", children: "Access denied" }),
      /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground", children: "You don't have access to this page." }),
      /* @__PURE__ */ jsx(Link, { to: homeFor(profile.role), children: /* @__PURE__ */ jsx(Button, { children: "Go to your dashboard" }) })
    ] });
  }
  const path = location.pathname;
  return /* @__PURE__ */ jsxs("div", { className: "flex min-h-screen flex-col bg-background", children: [
    /* @__PURE__ */ jsxs("header", { className: "sticky top-0 z-20 border-b bg-card/80 backdrop-blur", children: [
      /* @__PURE__ */ jsxs("div", { className: "mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3", children: [
        /* @__PURE__ */ jsxs(Link, { to: homeFor(profile.role), className: "flex items-center gap-2 font-semibold", children: [
          /* @__PURE__ */ jsx(MapPin, { className: "h-5 w-5 text-primary" }),
          /* @__PURE__ */ jsx("span", { children: "Attendance" })
        ] }),
        /* @__PURE__ */ jsxs("nav", { className: "hidden items-center gap-1 md:flex", children: [
          isSuper && /* @__PURE__ */ jsx(NavLink, { to: "/super", active: path.startsWith("/super"), icon: /* @__PURE__ */ jsx(Shield, { className: "h-4 w-4" }), children: "Super" }),
          isStaff ? /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx(NavLink, { to: "/admin", active: path === "/admin", icon: /* @__PURE__ */ jsx(LayoutDashboard, { className: "h-4 w-4" }), children: "Dashboard" }),
            /* @__PURE__ */ jsx(NavLink, { to: "/admin/employees", active: path.startsWith("/admin/employees"), icon: /* @__PURE__ */ jsx(Users, { className: "h-4 w-4" }), children: "Employees" }),
            /* @__PURE__ */ jsx(NavLink, { to: "/admin/attendance", active: path.startsWith("/admin/attendance"), icon: /* @__PURE__ */ jsx(ClipboardList, { className: "h-4 w-4" }), children: "Attendance" }),
            !isSuper && /* @__PURE__ */ jsx(NavLink, { to: "/app", active: path === "/app", icon: /* @__PURE__ */ jsx(MapPin, { className: "h-4 w-4" }), children: "Punch" })
          ] }) : /* @__PURE__ */ jsx(NavLink, { to: "/app", active: path === "/app", icon: /* @__PURE__ */ jsx(MapPin, { className: "h-4 w-4" }), children: "Punch In" }),
          /* @__PURE__ */ jsx(NavLink, { to: "/app/change-password", active: path === "/app/change-password", icon: /* @__PURE__ */ jsx(KeyRound, { className: "h-4 w-4" }), children: "Password" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsxs("span", { className: "hidden text-sm text-muted-foreground sm:inline", children: [
            profile.name,
            isSuper ? " · SUPER" : ""
          ] }),
          /* @__PURE__ */ jsxs(Button, { size: "sm", variant: "ghost", onClick: () => signOut(), children: [
            /* @__PURE__ */ jsx(LogOut, { className: "mr-1 h-4 w-4" }),
            " Sign out"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("nav", { className: "flex gap-1 overflow-x-auto border-t px-4 py-2 md:hidden", children: [
        isSuper && /* @__PURE__ */ jsx(NavLink, { to: "/super", active: path.startsWith("/super"), icon: /* @__PURE__ */ jsx(Shield, { className: "h-4 w-4" }), children: "Super" }),
        isStaff ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(NavLink, { to: "/admin", active: path === "/admin", icon: /* @__PURE__ */ jsx(LayoutDashboard, { className: "h-4 w-4" }), children: "Dashboard" }),
          /* @__PURE__ */ jsx(NavLink, { to: "/admin/employees", active: path.startsWith("/admin/employees"), icon: /* @__PURE__ */ jsx(Users, { className: "h-4 w-4" }), children: "Employees" }),
          /* @__PURE__ */ jsx(NavLink, { to: "/admin/attendance", active: path.startsWith("/admin/attendance"), icon: /* @__PURE__ */ jsx(ClipboardList, { className: "h-4 w-4" }), children: "Attendance" })
        ] }) : /* @__PURE__ */ jsx(NavLink, { to: "/app", active: path === "/app", icon: /* @__PURE__ */ jsx(MapPin, { className: "h-4 w-4" }), children: "Punch In" }),
        /* @__PURE__ */ jsx(NavLink, { to: "/app/change-password", active: path === "/app/change-password", icon: /* @__PURE__ */ jsx(KeyRound, { className: "h-4 w-4" }), children: "Password" })
      ] })
    ] }),
    /* @__PURE__ */ jsx("main", { className: "mx-auto w-full max-w-6xl flex-1 p-4 md:p-6", children })
  ] });
}
function NavLink({
  to,
  active,
  icon,
  children
}) {
  return /* @__PURE__ */ jsxs(
    Link,
    {
      to,
      className: `inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`,
      children: [
        icon,
        children
      ]
    }
  );
}
export {
  RequireAuth as R
};

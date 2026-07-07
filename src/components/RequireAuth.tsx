import { useEffect, type ReactNode } from "react";
import { useNavigate, Link, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { LogOut, MapPin, Users, ClipboardList, KeyRound, LayoutDashboard, Shield } from "lucide-react";

type AllowedRole = "admin" | "employee" | "staff" | "super";

export function RequireAuth({
  children,
  role,
}: {
  children: ReactNode;
  role?: AllowedRole;
}) {
  const { user, profile, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const { location } = useRouterState();

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <div className="flex flex-col items-center gap-4">
          <div className="h-16 w-auto max-w-[200px] animate-pulse">
            <img src="/tvs-logo.svg" alt="TVS Electronics" className="h-full w-auto object-contain" />
          </div>
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <span className="h-2 w-2 animate-bounce rounded-full bg-primary" style={{ animationDelay: '0ms' }} />
            <span className="h-2 w-2 animate-bounce rounded-full bg-primary" style={{ animationDelay: '150ms' }} />
            <span className="h-2 w-2 animate-bounce rounded-full bg-primary" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    );
  }
  if (!profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">No employee profile</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Your account exists in Firebase Auth but has no employee profile yet. Ask an admin to
          create one for {user.email}.
        </p>
        <Button variant="outline" onClick={() => signOut()}>Sign out</Button>
      </div>
    );
  }
  const homeFor = (r: string) => {
    if (r === "superadmin") return "/super";
    if (r === "admin") return "/admin";
    return "/app";
  };
  const isSuper = profile.role === "superadmin";
  const isAdmin = profile.role === "admin";
  const isStaff = isAdmin || isSuper;
  const allowed =
    !role ||
    isSuper ||
    (role === "super"
      ? false
      : role === "staff"
      ? isAdmin
      : profile.role === role);
  if (!allowed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="text-sm text-muted-foreground">You don't have access to this page.</p>
        <Link to={homeFor(profile.role)}>
          <Button>Go to your dashboard</Button>
        </Link>
      </div>
    );
  }

  const path = location.pathname;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-20 border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to={homeFor(profile.role)} className="flex items-center gap-3 font-semibold">
            <img src="/tvs-logo.svg" alt="TVS Electronics" className="h-10 w-auto" />
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {isSuper && (
              <NavLink to="/super" active={path.startsWith("/super")} icon={<Shield className="h-4 w-4" />}>Super</NavLink>
            )}
            {isStaff ? (
              <>
                <NavLink to="/admin" active={path === "/admin"} icon={<LayoutDashboard className="h-4 w-4" />}>Dashboard</NavLink>
                <NavLink to="/admin/employees" active={path.startsWith("/admin/employees")} icon={<Users className="h-4 w-4" />}>Employees</NavLink>
                <NavLink to="/admin/attendance" active={path.startsWith("/admin/attendance")} icon={<ClipboardList className="h-4 w-4" />}>Attendance</NavLink>
                {!isSuper && <NavLink to="/app" active={path === "/app"} icon={<MapPin className="h-4 w-4" />}>Punch</NavLink>}
              </>
            ) : (
              <NavLink to="/app" active={path === "/app"} icon={<MapPin className="h-4 w-4" />}>Punch In</NavLink>
            )}
            <NavLink to="/app/change-password" active={path === "/app/change-password"} icon={<KeyRound className="h-4 w-4" />}>Password</NavLink>
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">{profile.name}{isSuper ? " · SUPER" : ""}</span>
            <Button size="sm" variant="ghost" onClick={() => signOut()}>
              <LogOut className="mr-1 h-4 w-4" /> Sign out
            </Button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t px-4 py-2 md:hidden">
          {isSuper && (
            <NavLink to="/super" active={path.startsWith("/super")} icon={<Shield className="h-4 w-4" />}>Super</NavLink>
          )}
          {isStaff ? (
            <>
              <NavLink to="/admin" active={path === "/admin"} icon={<LayoutDashboard className="h-4 w-4" />}>Dashboard</NavLink>
              <NavLink to="/admin/employees" active={path.startsWith("/admin/employees")} icon={<Users className="h-4 w-4" />}>Employees</NavLink>
              <NavLink to="/admin/attendance" active={path.startsWith("/admin/attendance")} icon={<ClipboardList className="h-4 w-4" />}>Attendance</NavLink>
            </>
          ) : (
            <NavLink to="/app" active={path === "/app"} icon={<MapPin className="h-4 w-4" />}>Punch In</NavLink>
          )}
          <NavLink to="/app/change-password" active={path === "/app/change-password"} icon={<KeyRound className="h-4 w-4" />}>Password</NavLink>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}

function NavLink({
  to,
  active,
  icon,
  children,
}: {
  to: string;
  active: boolean;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      {icon}
      {children}
    </Link>
  );
}

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updatePassword,
  type User,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db, SEED_ADMIN_EMAIL } from "./firebase";

export type Role = "superadmin" | "admin" | "employee";

export interface Assignment {
  projectId: string;
  projectName?: string;
  officeId?: string;
  officeName?: string;
  officeLat: number;
  officeLng: number;
}

export interface EmployeeDoc {
  employeeID: string;
  name: string;
  email: string;
  officeLat: number;
  officeLng: number;
  role: Role;
  projectId?: string | null;
  projectName?: string | null;
  projectIds?: string[];
  assignments?: Assignment[];
  adminProjects?: string[];
  branches?: string[];
  totalLeaves?: number;
  usedLeaves?: number;
  createdAt?: unknown;
}

const ACTIVE_KEY = "activeProjectId";

function readActive(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(ACTIVE_KEY) ?? "";
}

/** Returns assignments, deriving a single one from legacy fields if needed. */
export function effectiveAssignments(p: EmployeeDoc | null | undefined): Assignment[] {
  if (!p) return [];
  if (p.assignments && p.assignments.length > 0) return p.assignments;
  if (p.projectId) {
    return [{
      projectId: p.projectId,
      projectName: p.projectName ?? p.projectId,
      officeLat: p.officeLat ?? 0,
      officeLng: p.officeLng ?? 0,
    }];
  }
  return [];
}

interface AuthCtx {
  user: User | null;
  profile: EmployeeDoc | null;
  loading: boolean;
  profileError: string | null;
  activeProjectId: string;
  setActiveProjectId: (id: string) => void;
  adminProjectIds: string[];
  signIn: (email: string, password: string) => Promise<EmployeeDoc | null>;
  signOut: () => Promise<void>;
  changePassword: (newPassword: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

function effectiveAdminProjects(p: EmployeeDoc | null): string[] {
  if (!p) return [];
  const list = new Set<string>();
  (p.adminProjects ?? []).forEach((x) => x && list.add(x));
  if (p.projectId && p.role === "admin") list.add(p.projectId);
  return Array.from(list);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<EmployeeDoc | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeProjectId, setActiveProjectIdState] = useState<string>(readActive());

  const setActiveProjectId = (id: string) => {
    setActiveProjectIdState(id);
    if (typeof window !== "undefined") {
      if (id) localStorage.setItem(ACTIVE_KEY, id);
      else localStorage.removeItem(ACTIVE_KEY);
    }
  };

  const loadProfile = async (u: User) => {
    setProfileError(null);
    const ref = doc(db, "employees", u.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      if (u.email?.toLowerCase() === SEED_ADMIN_EMAIL.toLowerCase()) {
        const seed: EmployeeDoc = {
          employeeID: "SUPER-001",
          name: "Super Administrator",
          email: u.email,
          officeLat: 0,
          officeLng: 0,
          role: "superadmin",
          projectId: null,
        };
        await setDoc(ref, { ...seed, createdAt: serverTimestamp() });
        setProfile(seed);
        return seed;
      }
      setProfile(null);
      setProfileError(`No employee profile exists for ${u.email ?? "this account"}.`);
      return null;
    }
    const employee = snap.data() as EmployeeDoc;
    if ((employee.role as string) === "leader") employee.role = "employee";
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
            e instanceof Error ? e.message : "Unable to load your employee profile from Firebase.",
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

  const value: AuthCtx = {
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
            // employee — clear; punch page chooses from assignments
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
      await fbSignOut(auth);
    },
    changePassword: async (newPassword) => {
      if (!auth.currentUser) throw new Error("Not signed in");
      await updatePassword(auth.currentUser, newPassword);
    },
    refreshProfile: async () => {
      if (auth.currentUser) await loadProfile(auth.currentUser);
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}

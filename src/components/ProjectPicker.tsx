import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";

export interface ProjectOption { id: string; name: string }

/** Returns the list of projects the current staff user can pick from. */
export function useAvailableProjects(): { projects: ProjectOption[]; loading: boolean } {
  const { profile, adminProjectIds } = useAuth();
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "projects"));
        const all = snap.docs.map((d) => {
          const data = d.data() as { name?: string };
          return { id: d.id, name: data.name ?? d.id };
        });
        if (cancel) return;
        if (profile?.role === "superadmin") {
          setProjects(all);
        } else {
          const set = new Set(adminProjectIds);
          const subset = all.filter((p) => set.has(p.id));
          // include any admin project that has no project doc yet
          adminProjectIds.forEach((id) => {
            if (!subset.find((p) => p.id === id)) subset.push({ id, name: id });
          });
          setProjects(subset);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.role, adminProjectIds.join("|")]);

  return { projects, loading };
}

export function ProjectPicker({
  projects,
  value,
  onChange,
  includeAll = true,
}: {
  projects: ProjectOption[];
  value: string;
  onChange: (v: string) => void;
  includeAll?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-md border bg-background px-2 text-sm"
    >
      {includeAll && <option value="">All my projects</option>}
      {projects.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  );
}

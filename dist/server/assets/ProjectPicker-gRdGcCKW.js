import { jsxs, jsx } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { getDocs, collection } from "firebase/firestore";
import { u as useAuth, d as db } from "./router-B753KT4Y.js";
function useAvailableProjects() {
  const { profile, adminProjectIds } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "projects"));
        const all = snap.docs.map((d) => {
          const data = d.data();
          return { id: d.id, name: data.name ?? d.id };
        });
        if (cancel) return;
        if (profile?.role === "superadmin") {
          setProjects(all);
        } else {
          const set = new Set(adminProjectIds);
          const subset = all.filter((p) => set.has(p.id));
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
    return () => {
      cancel = true;
    };
  }, [profile?.role, adminProjectIds.join("|")]);
  return { projects, loading };
}
function ProjectPicker({
  projects,
  value,
  onChange,
  includeAll = true
}) {
  return /* @__PURE__ */ jsxs(
    "select",
    {
      value,
      onChange: (e) => onChange(e.target.value),
      className: "h-9 rounded-md border bg-background px-2 text-sm",
      children: [
        includeAll && /* @__PURE__ */ jsx("option", { value: "", children: "All my projects" }),
        projects.map((p) => /* @__PURE__ */ jsx("option", { value: p.id, children: p.name }, p.id))
      ]
    }
  );
}
export {
  ProjectPicker as P,
  useAvailableProjects as u
};

import { jsx, jsxs } from "react/jsx-runtime";
import { useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { u as useAuth } from "./router-B753KT4Y.js";
import { C as Card, a as CardHeader, b as CardTitle, c as CardDescription, d as CardContent, B as Button } from "./card-BXMydX4U.js";
import { L as Label, I as Input } from "./label-DGkNwAzF.js";
import { MapPin } from "lucide-react";
import { toast } from "sonner";
import "@tanstack/react-query";
import "firebase/auth";
import "firebase/firestore";
import "firebase/app";
import "@radix-ui/react-slot";
import "class-variance-authority";
import "clsx";
import "tailwind-merge";
import "@radix-ui/react-label";
function homeFor(role) {
  if (role === "superadmin") return "/super";
  if (role === "admin") return "/admin";
  return "/app";
}
function LoginPage() {
  const {
    user,
    profile,
    loading,
    profileError,
    signIn
  } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    if (!loading && user && profile) {
      navigate({
        to: homeFor(profile.role),
        replace: true
      });
    }
  }, [loading, user, profile, navigate]);
  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const p = await signIn(email.trim(), password);
      if (!p) {
        toast.error("Signed in, but no employee profile was found for this account.");
        return;
      }
      toast.success("Signed in");
      navigate({
        to: homeFor(p.role),
        replace: true
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign in failed";
      toast.error(msg.replace("Firebase: ", ""));
    } finally {
      setSubmitting(false);
    }
  };
  return /* @__PURE__ */ jsx("div", { className: "flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted p-4", children: /* @__PURE__ */ jsxs(Card, { className: "w-full max-w-md", children: [
    /* @__PURE__ */ jsxs(CardHeader, { className: "text-center", children: [
      /* @__PURE__ */ jsx("div", { className: "mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10", children: /* @__PURE__ */ jsx(MapPin, { className: "h-6 w-6 text-primary" }) }),
      /* @__PURE__ */ jsx(CardTitle, { children: "Attendance Portal" }),
      /* @__PURE__ */ jsx(CardDescription, { children: "Sign in with the credentials provided by your admin." })
    ] }),
    /* @__PURE__ */ jsx(CardContent, { children: /* @__PURE__ */ jsxs("form", { onSubmit, className: "space-y-4", children: [
      user && !profile && profileError ? /* @__PURE__ */ jsx("div", { className: "rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive", children: profileError }) : null,
      /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsx(Label, { htmlFor: "email", children: "Email" }),
        /* @__PURE__ */ jsx(Input, { id: "email", type: "email", autoComplete: "email", required: true, value: email, onChange: (e) => setEmail(e.target.value) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsx(Label, { htmlFor: "password", children: "Password" }),
        /* @__PURE__ */ jsx(Input, { id: "password", type: "password", autoComplete: "current-password", required: true, value: password, onChange: (e) => setPassword(e.target.value) })
      ] }),
      /* @__PURE__ */ jsx(Button, { type: "submit", className: "w-full", disabled: submitting, children: submitting ? "Signing in…" : "Sign in" })
    ] }) })
  ] }) });
}
export {
  LoginPage as component
};

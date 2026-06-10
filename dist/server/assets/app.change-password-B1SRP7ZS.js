import { jsx, jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { R as RequireAuth } from "./RequireAuth-BnkDJcWl.js";
import { u as useAuth } from "./router-B753KT4Y.js";
import { C as Card, a as CardHeader, b as CardTitle, c as CardDescription, d as CardContent, B as Button } from "./card-BXMydX4U.js";
import { L as Label, I as Input } from "./label-DGkNwAzF.js";
import { toast } from "sonner";
import "@tanstack/react-router";
import "lucide-react";
import "@tanstack/react-query";
import "firebase/auth";
import "firebase/firestore";
import "firebase/app";
import "@radix-ui/react-slot";
import "class-variance-authority";
import "clsx";
import "tailwind-merge";
import "@radix-ui/react-label";
function ChangePasswordPage() {
  const {
    changePassword
  } = useAuth();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (pw.length < 6) return toast.error("Password must be at least 6 characters");
    if (pw !== pw2) return toast.error("Passwords don't match");
    setBusy(true);
    try {
      await changePassword(pw);
      toast.success("Password updated");
      setPw("");
      setPw2("");
    } catch (e2) {
      const msg = e2 instanceof Error ? e2.message : "Failed";
      toast.error(msg.replace("Firebase: ", ""));
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsx("div", { className: "mx-auto max-w-md", children: /* @__PURE__ */ jsxs(Card, { children: [
    /* @__PURE__ */ jsxs(CardHeader, { children: [
      /* @__PURE__ */ jsx(CardTitle, { children: "Change password" }),
      /* @__PURE__ */ jsx(CardDescription, { children: "You may need to sign in again recently for this to work." })
    ] }),
    /* @__PURE__ */ jsx(CardContent, { children: /* @__PURE__ */ jsxs("form", { onSubmit: submit, className: "space-y-4", children: [
      /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsx(Label, { htmlFor: "pw", children: "New password" }),
        /* @__PURE__ */ jsx(Input, { id: "pw", type: "password", value: pw, onChange: (e) => setPw(e.target.value), required: true })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsx(Label, { htmlFor: "pw2", children: "Confirm" }),
        /* @__PURE__ */ jsx(Input, { id: "pw2", type: "password", value: pw2, onChange: (e) => setPw2(e.target.value), required: true })
      ] }),
      /* @__PURE__ */ jsx(Button, { type: "submit", disabled: busy, className: "w-full", children: busy ? "Updating…" : "Update password" })
    ] }) })
  ] }) });
}
const SplitComponent = () => /* @__PURE__ */ jsx(RequireAuth, { children: /* @__PURE__ */ jsx(ChangePasswordPage, {}) });
export {
  SplitComponent as component
};

import { type HTMLAttributes } from "react";

export function BrandLogo({ className, ...props }: HTMLAttributes<HTMLImageElement>) {
  return (
    <img
      src="/tvs-logo.svg"
      alt="TVS Electronics"
      className={"h-12 w-auto " + (className ?? "")}
      {...props}
    />
  );
}

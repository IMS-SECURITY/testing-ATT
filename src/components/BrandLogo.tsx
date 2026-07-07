import { type HTMLAttributes } from "react";

export function BrandLogo({ className, ...props }: HTMLAttributes<HTMLImageElement>) {
  return (
    <img
      src="/tvs-logo.svg"
      alt="TVS Electronics"
      className={"max-h-12 object-contain " + (className ?? "")}
      {...props}
    />
  );
}

import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";

import { buttonClassName, type ButtonProps } from "@/components/ui/button";

type ButtonLinkProps = Omit<ComponentProps<typeof Link>, "className" | "children"> &
  Pick<ButtonProps, "className" | "size" | "variant"> & {
    children: ReactNode;
  };

export function ButtonLink({ className, size, variant, children, ...props }: ButtonLinkProps) {
  return (
    <Link className={buttonClassName({ className, size, variant })} {...props}>
      {children}
    </Link>
  );
}

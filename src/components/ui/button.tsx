import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const variants = cva("button", {
  variants: { variant: { default: "primary", outline: "outline", ghost: "ghost" } },
  defaultVariants: { variant: "default" },
});

export function Button({ asChild, variant, className, ...props }: React.ComponentProps<"button"> & VariantProps<typeof variants> & { asChild?: boolean }) {
  const Component = asChild ? Slot : "button";
  return <Component className={cn(variants({variant}), className)} {...props} />;
}

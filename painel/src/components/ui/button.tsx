import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// Botão do shadcn/ui restilizado com os tokens do tema (Design Brief, "Botões").
const variantes = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-xs border font-medium whitespace-nowrap transition-opacity hover:opacity-80 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primario: "border-text bg-text text-surface",
        secundario: "border-border-strong bg-surface text-text",
        fantasma: "border-transparent bg-transparent text-text",
      },
      size: {
        padrao: "h-9 px-3.5",
        pequeno: "h-8 px-3",
        icone: "size-9",
      },
    },
    defaultVariants: { variant: "secundario", size: "padrao" },
  },
);

export type ButtonProps = ComponentProps<"button"> & VariantProps<typeof variantes>;

export function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(variantes({ variant, size }), className)} {...props} />;
}

export { variantes as variantesDoBotao };

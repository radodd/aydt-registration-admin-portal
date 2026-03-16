import { HTMLAttributes } from "react";

type CardVariant = "default" | "elevated" | "flat";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
}

const variantClasses: Record<CardVariant, string> = {
  default:  "bg-white border border-neutral-200 shadow-card",
  elevated: "bg-white shadow-elevated",
  flat:     "bg-neutral-50 border border-neutral-100",
};

function Card({ variant = "default", className = "", children, ...props }: CardProps) {
  return (
    <div
      className={["rounded-xl", variantClasses[variant], className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}

function CardHeader({ className = "", children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={["px-6 py-4 border-b border-neutral-100", className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}

function CardContent({ className = "", children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={["px-6 py-5", className].filter(Boolean).join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}

function CardFooter({ className = "", children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={[
        "px-6 py-4 border-t border-neutral-100 flex items-center gap-3",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}

export { Card, CardHeader, CardContent, CardFooter };
export type { CardProps, CardVariant };

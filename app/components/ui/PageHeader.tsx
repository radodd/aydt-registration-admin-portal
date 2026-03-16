import { HTMLAttributes, ReactNode } from "react";

interface PageHeaderProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  back?: ReactNode;
}

function PageHeader({ title, subtitle, action, back, className = "", ...props }: PageHeaderProps) {
  return (
    <div
      className={["flex items-start justify-between gap-4 mb-6", className].join(" ")}
      {...props}
    >
      <div className="flex flex-col gap-0.5">
        {back && <div className="mb-1">{back}</div>}
        <h1 className="text-xl font-semibold text-neutral-900 tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-neutral-500">{subtitle}</p>
        )}
      </div>
      {action && (
        <div className="flex items-center gap-2 shrink-0">{action}</div>
      )}
    </div>
  );
}

export { PageHeader };
export type { PageHeaderProps };

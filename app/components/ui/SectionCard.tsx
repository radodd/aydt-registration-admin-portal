import { HTMLAttributes, ReactNode } from "react";

interface SectionCardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  action?: ReactNode;
  /** Removes default padding from the body (useful for tables or flush content) */
  flush?: boolean;
}

function SectionCard({
  title,
  description,
  action,
  flush = false,
  className = "",
  children,
  ...props
}: SectionCardProps) {
  return (
    <div
      className={[
        "bg-white border border-neutral-200 shadow-card rounded-xl overflow-hidden",
        className,
      ].join(" ")}
      {...props}
    >
      {(title || action) && (
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
          <div>
            <h2 className="text-sm font-semibold text-neutral-800">{title}</h2>
            {description && (
              <p className="text-xs text-neutral-500 mt-0.5">{description}</p>
            )}
          </div>
          {action && <div className="flex items-center gap-2">{action}</div>}
        </div>
      )}
      <div className={flush ? "" : "px-6 py-5"}>{children}</div>
    </div>
  );
}

export { SectionCard };
export type { SectionCardProps };

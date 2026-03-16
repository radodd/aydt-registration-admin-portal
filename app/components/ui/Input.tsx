import { forwardRef, InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from "react";

/* ── Label + wrapper ──────────────────────────────────────────── */
interface FieldWrapperProps {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

function FieldWrapper({ label, error, hint, required, className = "", children }: FieldWrapperProps) {
  return (
    <div className={["flex flex-col gap-1.5", className].join(" ")}>
      {label && (
        <label className="text-sm font-medium text-neutral-700">
          {label}
          {required && <span className="text-primary-600 ml-0.5">*</span>}
        </label>
      )}
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {!error && hint && <p className="text-xs text-neutral-500">{hint}</p>}
    </div>
  );
}

/* ── Input ─────────────────────────────────────────────────────── */
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  wrapperClassName?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, required, wrapperClassName, className = "", ...props }, ref) => {
    const inputEl = (
      <input
        ref={ref}
        required={required}
        className={[
          "input",
          error ? "border-red-400 bg-red-50 focus:border-red-500" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...props}
      />
    );

    if (!label && !error && !hint) return inputEl;

    return (
      <FieldWrapper label={label} error={error} hint={hint} required={required} className={wrapperClassName}>
        {inputEl}
      </FieldWrapper>
    );
  }
);
Input.displayName = "Input";

/* ── Textarea ──────────────────────────────────────────────────── */
interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  wrapperClassName?: string;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, required, wrapperClassName, className = "", ...props }, ref) => {
    const el = (
      <textarea
        ref={ref}
        required={required}
        className={[
          "textarea",
          error ? "border-red-400 bg-red-50 focus:border-red-500" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...props}
      />
    );

    if (!label && !error && !hint) return el;

    return (
      <FieldWrapper label={label} error={error} hint={hint} required={required} className={wrapperClassName}>
        {el}
      </FieldWrapper>
    );
  }
);
Textarea.displayName = "Textarea";

/* ── Select ────────────────────────────────────────────────────── */
interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  wrapperClassName?: string;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, required, wrapperClassName, className = "", children, ...props }, ref) => {
    const el = (
      <select
        ref={ref}
        required={required}
        className={[
          "select",
          error ? "border-red-400 bg-red-50 focus:border-red-500" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...props}
      >
        {children}
      </select>
    );

    if (!label && !error && !hint) return el;

    return (
      <FieldWrapper label={label} error={error} hint={hint} required={required} className={wrapperClassName}>
        {el}
      </FieldWrapper>
    );
  }
);
Select.displayName = "Select";

export { Input, Textarea, Select, FieldWrapper };
export type { InputProps, TextareaProps, SelectProps };

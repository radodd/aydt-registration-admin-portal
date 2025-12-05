import styles from "@/scss/SignUpPage.module.scss";

interface Props {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  error?: string;
}
export function FormField({
  label,
  name,
  type = "text",
  placeholder,
  error,
}: Props) {
  return (
    <div className={styles.formFieldWrapper}>
      <label className={styles.formLabel}>{label}</label>

      <input
        className={`${styles.formField} ${error ? "hasError" : ""}`}
        name={name}
        type={type}
        placeholder={placeholder}
      />

      {error && <p className={styles.formError}>{error}</p>}
    </div>
  );
}

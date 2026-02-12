export function StatusBadge({ status }: { status: string }) {
  const styles = {
    draft: "bg-gray-100 text-gray-700 border-gray-200",
    published: "bg-green-100 text-green-700 border-green-200",
    archived: "bg-red-100 text-red-700 border-red-200",
  };

  return (
    <span
      className={`px-3 py-1 text-xs font-medium rounded-full border ${
        styles[status as keyof typeof styles]
      }`}
    >
      {status}
    </span>
  );
}

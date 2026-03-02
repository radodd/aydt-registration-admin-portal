import Link from "next/link";

interface PreviewBannerProps {
  semesterId: string;
}

/**
 * Fixed top banner shown in admin preview mode.
 * Clearly marks the session as non-production and links back to the editor.
 */
export function PreviewBanner({ semesterId }: PreviewBannerProps) {
  return (
    <div className="fixed top-0 inset-x-0 z-50 bg-amber-400 text-amber-950 flex items-center justify-between px-4 py-2">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="bg-amber-600 text-white text-xs px-2 py-0.5 rounded font-bold uppercase tracking-wide">
          Preview
        </span>
        <span>Draft data — payments are simulated — not visible to the public</span>
      </div>
      <Link
        href={`/admin/semesters/${semesterId}/edit`}
        className="text-xs bg-amber-950 text-white px-3 py-1.5 rounded-lg hover:bg-amber-900 transition-colors font-semibold"
      >
        ← Back to Editor
      </Link>
    </div>
  );
}

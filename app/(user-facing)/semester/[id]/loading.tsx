export default function SemesterLoading() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-10 animate-pulse">
      {/* Hero skeleton */}
      <div className="mb-10">
        <div className="h-4 w-32 bg-gray-200 rounded mb-3" />
        <div className="h-9 w-2/3 bg-gray-200 rounded mb-3" />
        <div className="h-4 w-full max-w-lg bg-gray-200 rounded" />
      </div>

      {/* Session grid skeleton */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3"
          >
            <div className="h-5 w-3/4 bg-gray-200 rounded" />
            <div className="h-4 w-1/2 bg-gray-200 rounded" />
            <div className="h-4 w-full bg-gray-200 rounded" />
            <div className="h-4 w-2/3 bg-gray-200 rounded" />
            <div className="h-10 bg-gray-200 rounded-xl mt-4" />
          </div>
        ))}
      </div>
    </div>
  );
}

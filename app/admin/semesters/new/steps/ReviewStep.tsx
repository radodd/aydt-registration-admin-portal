"use client";

export default function ReviewStep({ state, onBack, onPublish }) {
  return (
    <div>
      <h2>Review & Publish</h2>

      <pre>{JSON.stringify(state, null, 2)}</pre>

      <div>
        <button onClick={onBack}>Back</button>
        <button onClick={onPublish}>Publish Semester</button>
      </div>
    </div>
  );
}

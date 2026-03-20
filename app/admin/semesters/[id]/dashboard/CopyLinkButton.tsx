"use client";

import { useState } from "react";
import { Link2, Check } from "lucide-react";

type Props = {
  semesterId: string;
};

export default function CopyLinkButton({ semesterId }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const url = `${window.location.origin}/register?semester=${semesterId}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-sm font-medium border transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 text-left"
      style={{
        borderColor: "var(--admin-border)",
        color: copied ? "#0A5A50" : "var(--admin-text-muted)",
        background: copied ? "#C8EEE2" : "var(--admin-page-bg)",
      }}
    >
      {copied ? (
        <Check style={{ width: 13, height: 13, flexShrink: 0, color: "#0A5A50" }} />
      ) : (
        <Link2 style={{ width: 13, height: 13, flexShrink: 0 }} />
      )}
      {copied ? "Link copied!" : "Copy registration link"}
    </button>
  );
}

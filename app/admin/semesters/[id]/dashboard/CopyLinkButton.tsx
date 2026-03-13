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
      className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-slate-50 transition text-slate-600"
    >
      {copied ? (
        <Check className="w-4 h-4 text-green-500 shrink-0" />
      ) : (
        <Link2 className="w-4 h-4 text-slate-400 shrink-0" />
      )}
      {copied ? "Copied!" : "Copy registration link"}
    </button>
  );
}

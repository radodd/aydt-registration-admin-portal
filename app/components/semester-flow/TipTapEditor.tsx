"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import { useEffect, useCallback } from "react";

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
};

const TEXT_COLORS = [
  { label: "Black", value: "#111827" },
  { label: "Gray", value: "#6b7280" },
  { label: "Indigo", value: "#4f46e5" },
  { label: "Red", value: "#dc2626" },
  { label: "Green", value: "#16a34a" },
];

function ToolbarButton({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={title}
      className={`px-2 py-1 rounded text-sm transition select-none ${
        active
          ? "bg-indigo-100 text-indigo-700 font-semibold"
          : "text-gray-600 hover:bg-gray-100"
      }`}
    >
      {children}
    </button>
  );
}

export default function TipTapEditor({
  value,
  onChange,
  placeholder = "Enter content...",
  minHeight = "120px",
}: Props) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2] } }),
      Underline,
      Link.configure({ openOnClick: false }),
      TextStyle,
      Color,
    ],
    content: value || "",
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "outline-none prose prose-sm max-w-none",
        style: `min-height: ${minHeight}`,
      },
    },
  });

  // Sync external value changes (e.g. modal reset)
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Enter URL", prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().setLink({ href: url }).run();
    }
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="border border-gray-300 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-0.5 items-center px-3 py-2 border-b border-gray-200 bg-gray-50">
        {/* Block styles */}
        <ToolbarButton
          onClick={() => editor.chain().focus().setParagraph().run()}
          active={editor.isActive("paragraph")}
          title="Paragraph"
        >
          P
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          active={editor.isActive("heading", { level: 1 })}
          title="Heading 1"
        >
          H1
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive("heading", { level: 2 })}
          title="Heading 2"
        >
          H2
        </ToolbarButton>

        <span className="w-px h-4 bg-gray-300 mx-1" />

        {/* Inline styles */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title="Bold"
        >
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title="Italic"
        >
          <em>I</em>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive("underline")}
          title="Underline"
        >
          <span className="underline">U</span>
        </ToolbarButton>

        <span className="w-px h-4 bg-gray-300 mx-1" />

        {/* Lists */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title="Bullet List"
        >
          ≡
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title="Numbered List"
        >
          1≡
        </ToolbarButton>

        <span className="w-px h-4 bg-gray-300 mx-1" />

        {/* Link */}
        <ToolbarButton
          onClick={setLink}
          active={editor.isActive("link")}
          title="Link"
        >
          🔗
        </ToolbarButton>

        <span className="w-px h-4 bg-gray-300 mx-1" />

        {/* Colors */}
        <div className="flex items-center gap-1">
          {TEXT_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                editor.chain().focus().setColor(c.value).run();
              }}
              title={c.label}
              className="w-4 h-4 rounded-full border border-gray-300 hover:scale-110 transition"
              style={{ backgroundColor: c.value }}
            />
          ))}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().unsetColor().run();
            }}
            title="Reset color"
            className="text-xs text-gray-400 hover:text-gray-600 px-1"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Editor content */}
      <div className="px-4 py-3 bg-white">
        <EditorContent editor={editor} placeholder={placeholder} />
      </div>
    </div>
  );
}

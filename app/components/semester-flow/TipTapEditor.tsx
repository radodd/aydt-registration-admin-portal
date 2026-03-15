"use client";

import { useEditor, EditorContent, Extension } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import { Image as TiptapImage } from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import FontFamily from "@tiptap/extension-font-family";
import { useEffect, useCallback, useState, useRef } from "react";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Link as LinkIcon,
  Image as ImageIcon,
  ImagePlus,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  List,
  ListOrdered,
  Baseline,
  Highlighter,
  RectangleHorizontal,
  X,
  Heading1,
  Heading2,
  Pilcrow,
} from "lucide-react";
import ImagePickerModal from "@/app/components/media/ImagePickerModal";
import type { MediaImage, ImageLayout } from "@/types";
import type { RawCommands, ChainedCommands } from "@tiptap/core";

/* -------------------------------------------------------------------------- */
/* Constants                                                                   */
/* -------------------------------------------------------------------------- */

const BRAND_COLORS = [
  { label: "Deep Maroon", value: "#7B1F1A" },
  { label: "Wine Red", value: "#8E2A23" },
  { label: "Dusty Rose", value: "#D8C4BF" },
  { label: "Warm Blush", value: "#E6D5D1" },
  { label: "Soft Beige", value: "#F2E7E4" },
];

const ACCENT_COLORS = [
  { label: "Lavender Accent", value: "#CFAFD8" },
  { label: "Soft Mint", value: "#A8D7CF" },
  { label: "Muted Sage", value: "#C4D1C9" },
  { label: "Warm Mauve", value: "#D4B7C6" },
  { label: "Pale Rose", value: "#E9C9C4" },
];

const BASIC_COLORS = [
  { label: "Black", value: "#111827" },
  { label: "Gray", value: "#6b7280" },
  { label: "Indigo", value: "#4f46e5" },
  { label: "Red", value: "#dc2626" },
  { label: "Green", value: "#16a34a" },
];

const FONT_FAMILIES = [
  { label: "Default", value: "" },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Helvetica", value: "Helvetica, Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, 'Times New Roman', serif" },
  { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
];

const FONT_SIZES = [
  "12px",
  "14px",
  "16px",
  "18px",
  "20px",
  "24px",
  "28px",
  "32px",
];

const BANNER_HEIGHTS: { label: string; key: string; px: number }[] = [
  { label: "S", key: "small", px: 120 },
  { label: "M", key: "medium", px: 220 },
  { label: "L", key: "large", px: 280 },
];

const IMAGE_WIDTHS: { label: string; key: string; px: number }[] = [
  { label: "S", key: "small", px: 200 },
  { label: "M", key: "medium", px: 400 },
  { label: "L", key: "large", px: 600 },
];

const BUTTON_PRESETS = {
  bgColor: "#4f46e5",
  textColor: "#ffffff",
  borderRadius: 6,
  paddingV: 12,
  paddingH: 24,
};

/* -------------------------------------------------------------------------- */
/* Custom FontSize extension (extends TextStyle)                               */
/* -------------------------------------------------------------------------- */

const FontSize = Extension.create({
  name: "fontSize",
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (el) => (el as HTMLElement).style.fontSize || null,
            renderHTML: (attrs) =>
              attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {},
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize:
        (fontSize: string) =>
        ({ chain }: { chain: () => ChainedCommands }) =>
          chain().setMark("textStyle", { fontSize }).run(),
      unsetFontSize:
        () =>
        ({ chain }: { chain: () => ChainedCommands }) =>
          chain()
            .setMark("textStyle", { fontSize: null })
            .removeEmptyTextStyle()
            .run(),
    } as Partial<RawCommands>;
  },
});

/* -------------------------------------------------------------------------- */
/* EmailImage extension                                                        */
/* -------------------------------------------------------------------------- */

// const EmailImage = TiptapImage.extend({
//   addAttributes() {
//     return {
//       ...this.parent?.(),
//       layout: {
//         default: "inline",
//         parseHTML: (el) => el.getAttribute("data-layout") ?? "inline",
//         renderHTML: (attrs) => ({ "data-layout": attrs.layout }),
//       },
//       align: {
//         default: "left",
//         parseHTML: (el) => el.getAttribute("data-align") ?? "left",
//         renderHTML: (attrs) => {
//           let style = "display:block;";

//           if (attrs.align === "center") {
//             style += "margin-left:auto;margin-right:auto;";
//           }

//           if (attrs.align === "right") {
//             style += "margin-left:auto;";
//           }

//           return {
//             "data-align": attrs.align,
//             style,
//           };
//         },
//       },

//       bannerHeight: {
//         default: "medium",
//         parseHTML: (el) => el.getAttribute("data-banner-height") ?? "medium",
//         renderHTML: (attrs) => ({ "data-banner-height": attrs.bannerHeight }),
//       },
//       imageId: {
//         default: null,
//         parseHTML: (el) => el.getAttribute("data-image-id"),
//         renderHTML: (attrs) =>
//           attrs.imageId ? { "data-image-id": attrs.imageId } : {},
//       },
//     };

//   },
// });

const EmailImage = TiptapImage.extend({
  addAttributes() {
    return {
      ...this.parent?.(),

      layout: {
        default: "inline",
        parseHTML: (el) => el.getAttribute("data-layout") ?? "inline",
        renderHTML: (attrs) => ({ "data-layout": attrs.layout }),
      },

      align: {
        default: "left",
        parseHTML: (el) => el.getAttribute("data-align") ?? "left",
        renderHTML: (attrs) => {
          let alignAttr = "left";

          if (attrs.align === "center") alignAttr = "center";
          if (attrs.align === "right") alignAttr = "right";

          return {
            "data-align": attrs.align,
            align: alignAttr,
          };
        },
      },

      bannerHeight: {
        default: "medium",
        parseHTML: (el) => el.getAttribute("data-banner-height") ?? "medium",
        renderHTML: (attrs) => ({ "data-banner-height": attrs.bannerHeight }),
      },

      imageId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-image-id"),
        renderHTML: (attrs) =>
          attrs.imageId ? { "data-image-id": attrs.imageId } : {},
      },

      imageSize: {
        default: "medium",
        parseHTML: (el) => el.getAttribute("data-image-size") ?? "medium",
        renderHTML: (attrs) => ({ "data-image-size": attrs.imageSize }),
      },
    };
  },

  renderHTML({ node, HTMLAttributes }) {
    const layout = node.attrs.layout ?? "inline";
    const imageSize = node.attrs.imageSize ?? "medium";
    const align = node.attrs.align ?? "left";
    const maxPx =
      layout === "banner"
        ? 600
        : (IMAGE_WIDTHS.find((w) => w.key === imageSize)?.px ?? 400);

    const marginStyle =
      align === "center"
        ? "margin-left:auto;margin-right:auto;"
        : align === "right"
          ? "margin-left:auto;margin-right:0;"
          : "margin-left:0;margin-right:auto;";

    // object-fit:cover is included in the style so processImages() doesn't
    // need to inject it separately (it only does so when style= is absent).
    const objectFit = layout === "banner" ? "object-fit:cover;" : "";

    return [
      "img",
      {
        ...HTMLAttributes,
        width: maxPx,
        border: 0,
        style: `display:block;width:100%;max-width:${maxPx}px;height:auto;${marginStyle}${objectFit}`,
      },
    ];
  },
});
/* -------------------------------------------------------------------------- */
/* Shared toolbar button                                                       */
/* -------------------------------------------------------------------------- */

function ToolbarButton({
  onClick,
  active,
  title,
  children,
  disabled,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={title}
      disabled={disabled}
      className={`px-2 py-1 rounded text-sm transition select-none disabled:opacity-40 ${
        active
          ? "bg-indigo-100 text-indigo-700 font-semibold"
          : "text-gray-600 hover:bg-gray-100"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="w-px h-4 bg-gray-300 mx-1 shrink-0" />;
}

type ColorPalettePopoverProps = {
  triggerIcon: React.ReactNode;
  triggerTitle: string;
  accentColor: string;
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (value: string) => void;
  onReset: () => void;
  popoverRef: React.RefObject<HTMLDivElement | null>;
};

function ColorPalettePopover({
  triggerIcon,
  triggerTitle,
  accentColor,
  isOpen,
  onToggle,
  onSelect,
  onReset,
  popoverRef,
}: ColorPalettePopoverProps) {
  return (
    <div className="relative">
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          onToggle();
        }}
        title={triggerTitle}
        className="px-2 py-1 rounded text-sm text-gray-600 hover:bg-gray-100 transition select-none flex flex-col items-center gap-0.5"
      >
        {triggerIcon}
        <span
          className="w-full h-0.5 rounded-full"
          style={{ backgroundColor: accentColor }}
        />
      </button>

      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-48 space-y-2.5"
        >
          <div>
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1.5">
              Brand
            </p>
            <div className="flex flex-wrap gap-1.5">
              {BRAND_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelect(c.value);
                  }}
                  title={c.label}
                  className="w-5 h-5 rounded-full border border-gray-200 hover:scale-110 transition"
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1.5">
              Accent
            </p>
            <div className="flex flex-wrap gap-1.5">
              {ACCENT_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelect(c.value);
                  }}
                  title={c.label}
                  className="w-5 h-5 rounded-full border border-gray-200 hover:scale-110 transition"
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1.5">
              Basic
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              {BASIC_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelect(c.value);
                  }}
                  title={c.label}
                  className="w-5 h-5 rounded-full border border-gray-200 hover:scale-110 transition"
                  style={{ backgroundColor: c.value }}
                />
              ))}
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onReset();
                }}
                title="Reset"
                className="w-5 h-5 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100 transition"
              >
                <X size={10} className="text-gray-400" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Button builder modal                                                        */
/* -------------------------------------------------------------------------- */

type ButtonConfig = {
  text: string;
  url: string;
  bgColor: string;
  textColor: string;
  borderRadius: number;
};

function ButtonBuilderModal({
  onInsert,
  onClose,
}: {
  onInsert: (config: ButtonConfig) => void;
  onClose: () => void;
}) {
  const [config, setConfig] = useState<ButtonConfig>({
    text: "Click Here",
    url: "https://",
    bgColor: BUTTON_PRESETS.bgColor,
    textColor: BUTTON_PRESETS.textColor,
    borderRadius: BUTTON_PRESETS.borderRadius,
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!config.text || !config.url) return;
    onInsert(config);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
        <h3 className="text-base font-semibold text-gray-900">Insert Button</h3>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Button Text
            </label>
            <input
              type="text"
              value={config.text}
              onChange={(e) =>
                setConfig((c) => ({ ...c, text: e.target.value }))
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Link URL
            </label>
            <input
              type="url"
              value={config.url}
              onChange={(e) =>
                setConfig((c) => ({ ...c, url: e.target.value }))
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              required
            />
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Background color
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={config.bgColor}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, bgColor: e.target.value }))
                  }
                  className="w-8 h-8 rounded border border-gray-300 cursor-pointer"
                />
                <input
                  type="text"
                  value={config.bgColor}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, bgColor: e.target.value }))
                  }
                  className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-xs font-mono"
                  maxLength={7}
                />
              </div>
            </div>

            <div className="flex-1">
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Text color
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={config.textColor}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, textColor: e.target.value }))
                  }
                  className="w-8 h-8 rounded border border-gray-300 cursor-pointer"
                />
                <input
                  type="text"
                  value={config.textColor}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, textColor: e.target.value }))
                  }
                  className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-xs font-mono"
                  maxLength={7}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Border radius: {config.borderRadius}px
            </label>
            <input
              type="range"
              min={0}
              max={24}
              step={2}
              value={config.borderRadius}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  borderRadius: parseInt(e.target.value),
                }))
              }
              className="w-full accent-indigo-600"
            />
          </div>

          {/* Preview */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex justify-center">
            <span
              style={{
                display: "inline-block",
                padding: `${BUTTON_PRESETS.paddingV}px ${BUTTON_PRESETS.paddingH}px`,
                backgroundColor: config.bgColor,
                color: config.textColor,
                borderRadius: `${config.borderRadius}px`,
                fontFamily: "Arial, Helvetica, sans-serif",
                fontSize: "16px",
                fontWeight: "bold",
                textDecoration: "none",
              }}
            >
              {config.text || "Button"}
            </span>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-xl border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition"
            >
              Insert
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Build email-safe button HTML                                                */
/* -------------------------------------------------------------------------- */

function buildButtonHtml(config: ButtonConfig): string {
  const { text, url, bgColor, textColor, borderRadius } = config;
  const pv = BUTTON_PRESETS.paddingV;
  const ph = BUTTON_PRESETS.paddingH;

  return `<div style="text-align:center;margin:16px 0;"><!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${url}" style="height:48px;v-text-anchor:middle;width:200px;" arcsize="${Math.round((borderRadius / 24) * 100)}%" stroke="f" fillcolor="${bgColor}"><w:anchorlock/><center><![endif]--><table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;display:inline-block;"><tr><td align="center" bgcolor="${bgColor}" style="border-radius:${borderRadius}px;padding:${pv}px ${ph}px;"><a href="${url}" target="_blank" style="font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:${textColor};text-decoration:none;display:inline-block;border-radius:${borderRadius}px;">${text}</a></td></tr></table><!--[if mso]></center></v:roundrect><![endif]--></div>`;
}

/* -------------------------------------------------------------------------- */
/* Main TipTapEditor component                                                 */
/* -------------------------------------------------------------------------- */

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
};

export default function TipTapEditor({
  value,
  onChange,
  placeholder = "Enter content...",
  minHeight = "120px",
}: Props) {
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [imageModalLayout, setImageModalLayout] =
    useState<ImageLayout>("inline");
  const [buttonModalOpen, setButtonModalOpen] = useState(false);
  const [textColorOpen, setTextColorOpen] = useState(false);
  const [highlightColorOpen, setHighlightColorOpen] = useState(false);
  const [lastTextColor, setLastTextColor] = useState("#111827");
  const [lastHighlightColor, setLastHighlightColor] = useState("#CFAFD8");
  const textColorRef = useRef<HTMLDivElement>(null);
  const highlightColorRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2] } }),
      Underline,
      Link.configure({ openOnClick: false }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      FontFamily,
      FontSize,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      EmailImage.configure({
        allowBase64: false,
        HTMLAttributes: { class: "email-image" },
      }),
    ],
    content: value || "",
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "outline-none",
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

  useEffect(() => {
    if (!textColorOpen && !highlightColorOpen) return;
    function handle(e: MouseEvent) {
      if (
        textColorOpen &&
        textColorRef.current &&
        !textColorRef.current.contains(e.target as Node)
      ) {
        setTextColorOpen(false);
      }
      if (
        highlightColorOpen &&
        highlightColorRef.current &&
        !highlightColorRef.current.contains(e.target as Node)
      ) {
        setHighlightColorOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [textColorOpen, highlightColorOpen]);

  const openImageModal = (layout: ImageLayout) => {
    setImageModalLayout(layout);
    setImageModalOpen(true);
  };

  const handleInsertImage = useCallback(
    (image: MediaImage, layout: ImageLayout) => {
      setImageModalOpen(false);
      if (!editor) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (editor.chain().focus().setImage as any)({
        src: image.public_url,
        alt: image.display_name,
        layout,
        bannerHeight: layout === "banner" ? "medium" : undefined,
        imageSize: layout === "inline" ? "medium" : undefined,
        imageId: image.id,
      }).run();
    },
    [editor],
  );

  const handleInsertButton = (config: ButtonConfig) => {
    setButtonModalOpen(false);
    if (!editor) return;
    editor.chain().focus().insertContent(buildButtonHtml(config)).run();
  };

  if (!editor) return null;

  // Detect selected image attributes for conditional toolbar controls
  const selectedImageAttrs = editor.isActive("image")
    ? editor.getAttributes("image")
    : null;
  const isBannerSelected = selectedImageAttrs?.layout === "banner";
  const isImageSelected = editor.isActive("image");
  const currentImageAlign = selectedImageAttrs?.align ?? "left";

  // Current font family for select control
  const currentFontFamily =
    (editor.getAttributes("textStyle").fontFamily as string) ?? "";
  const currentFontSize =
    (editor.getAttributes("textStyle").fontSize as string) ?? "";

  console.log(isImageSelected);

  return (
    <>
      {imageModalOpen && (
        <ImagePickerModal
          isOpen={imageModalOpen}
          defaultLayout={imageModalLayout}
          onClose={() => setImageModalOpen(false)}
          onInsert={handleInsertImage}
        />
      )}

      {buttonModalOpen && (
        <ButtonBuilderModal
          onInsert={handleInsertButton}
          onClose={() => setButtonModalOpen(false)}
        />
      )}

      <div className="border border-gray-300 rounded-xl focus-within:ring-2 focus-within:ring-indigo-500">
        {/* ---- Toolbar ---- */}
        <div className="flex flex-wrap gap-0.5 items-center px-3 py-2 border-b border-gray-200 bg-gray-50 rounded-t-xl">
          {/* Block styles */}
          <ToolbarButton
            onClick={() => editor.chain().focus().setParagraph().run()}
            active={editor.isActive("paragraph")}
            title="Paragraph"
          >
            <Pilcrow size={14} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 1 }).run()
            }
            active={editor.isActive("heading", { level: 1 })}
            title="Heading 1"
          >
            <Heading1 size={14} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
            active={editor.isActive("heading", { level: 2 })}
            title="Heading 2"
          >
            <Heading2 size={14} />
          </ToolbarButton>

          <Divider />

          {/* Font family */}
          <select
            value={currentFontFamily}
            onChange={(e) => {
              const val = e.target.value;
              if (val === "") {
                editor.chain().focus().unsetFontFamily().run();
              } else {
                editor.chain().focus().setFontFamily(val).run();
              }
            }}
            onMouseDown={(e) => e.stopPropagation()}
            title="Font family"
            className="text-xs text-gray-600 border border-gray-200 rounded px-1 py-0.5 bg-white hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-indigo-400 max-w-[110px]"
          >
            {FONT_FAMILIES.map((f) => (
              <option key={f.label} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>

          {/* Font size */}
          <select
            value={currentFontSize}
            onChange={(e) => {
              const val = e.target.value;
              if (val === "") {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (editor.chain().focus() as any).unsetFontSize().run();
              } else {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (editor.chain().focus() as any).setFontSize(val).run();
              }
            }}
            onMouseDown={(e) => e.stopPropagation()}
            title="Font size"
            className="text-xs text-gray-600 border border-gray-200 rounded px-1 py-0.5 bg-white hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-indigo-400 w-16"
          >
            <option value="">Size</option>
            {FONT_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <Divider />

          {/* Inline styles */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive("bold")}
            title="Bold"
          >
            <Bold size={14} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive("italic")}
            title="Italic"
          >
            <Italic size={14} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            active={editor.isActive("underline")}
            title="Underline"
          >
            <UnderlineIcon size={14} />
          </ToolbarButton>

          <Divider />

          {/* Text alignment */}
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
            active={editor.isActive({ textAlign: "left" })}
            title="Align left"
          >
            <AlignLeft size={14} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
            active={editor.isActive({ textAlign: "center" })}
            title="Align center"
          >
            <AlignCenter size={14} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
            active={editor.isActive({ textAlign: "right" })}
            title="Align right"
          >
            <AlignRight size={14} />
          </ToolbarButton>

          <Divider />

          {/* Lists */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive("bulletList")}
            title="Bullet List"
          >
            <List size={14} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive("orderedList")}
            title="Numbered List"
          >
            <ListOrdered size={14} />
          </ToolbarButton>

          <Divider />

          {/* Link */}
          <ToolbarButton
            onClick={setLink}
            active={editor.isActive("link")}
            title="Link"
          >
            <LinkIcon size={14} />
          </ToolbarButton>

          {/* Button builder */}
          <ToolbarButton
            onClick={() => setButtonModalOpen(true)}
            title="Insert button"
          >
            <RectangleHorizontal size={14} />
          </ToolbarButton>

          <Divider />

          {/* Images */}
          <ToolbarButton
            onClick={() => openImageModal("inline")}
            title="Insert image"
          >
            <ImageIcon size={14} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => openImageModal("banner")}
            title="Insert banner (full-width)"
          >
            <ImagePlus size={14} />
          </ToolbarButton>

          {/* Banner height controls — only shown when a banner image is selected */}
          {isBannerSelected && (
            <>
              <Divider />
              <span className="text-xs text-gray-400 px-1">H:</span>
              {BANNER_HEIGHTS.map((h) => (
                <ToolbarButton
                  key={h.key}
                  onClick={() =>
                    editor
                      .chain()
                      .focus()
                      .updateAttributes("image", { bannerHeight: h.key })
                      .run()
                  }
                  active={
                    (selectedImageAttrs?.bannerHeight ?? "medium") === h.key
                  }
                  title={`Banner height ${h.key} (${h.px}px)`}
                >
                  {h.label}
                </ToolbarButton>
              ))}
            </>
          )}

          {/* Inline image width controls — only shown when a non-banner image is selected */}
          {isImageSelected && !isBannerSelected && (
            <>
              <Divider />
              <span className="text-xs text-gray-400 px-1">W:</span>
              {IMAGE_WIDTHS.map((w) => (
                <ToolbarButton
                  key={w.key}
                  onClick={() =>
                    editor
                      .chain()
                      .focus()
                      .updateAttributes("image", { imageSize: w.key })
                      .run()
                  }
                  active={
                    (selectedImageAttrs?.imageSize ?? "medium") === w.key
                  }
                  title={`Image width ${w.key} (${w.px}px)`}
                >
                  {w.label}
                </ToolbarButton>
              ))}
            </>
          )}

          {isImageSelected && (
            <>
              <Divider />
              <span className="text-xs text-gray-400 px-1">Align:</span>
              <ToolbarButton
                onClick={() =>
                  editor
                    .chain()
                    .focus()
                    .updateAttributes("image", { align: "left" })
                    .run()
                }
                active={currentImageAlign === "left"}
                title="Image align left"
              >
                <AlignHorizontalJustifyStart size={14} />
              </ToolbarButton>
              <ToolbarButton
                onClick={() =>
                  editor
                    .chain()
                    .focus()
                    .updateAttributes("image", { align: "center" })
                    .run()
                }
                active={currentImageAlign === "center"}
                title="Image align center"
              >
                <AlignHorizontalJustifyCenter size={14} />
              </ToolbarButton>
              <ToolbarButton
                onClick={() =>
                  editor
                    .chain()
                    .focus()
                    .updateAttributes("image", { align: "right" })
                    .run()
                }
                active={currentImageAlign === "right"}
                title="Image align right"
              >
                <AlignHorizontalJustifyEnd size={14} />
              </ToolbarButton>
            </>
          )}

          <Divider />

          {/* Color tools */}
          <ColorPalettePopover
            triggerIcon={<Baseline size={14} />}
            triggerTitle="Text color"
            accentColor={lastTextColor}
            isOpen={textColorOpen}
            onToggle={() => {
              setTextColorOpen((o) => !o);
              setHighlightColorOpen(false);
            }}
            onSelect={(value) => {
              editor.chain().focus().setColor(value).run();
              setLastTextColor(value);
              setTextColorOpen(false);
            }}
            onReset={() => {
              editor.chain().focus().unsetColor().run();
              setTextColorOpen(false);
            }}
            popoverRef={textColorRef}
          />
          <ColorPalettePopover
            triggerIcon={<Highlighter size={14} />}
            triggerTitle="Highlight color"
            accentColor={lastHighlightColor}
            isOpen={highlightColorOpen}
            onToggle={() => {
              setHighlightColorOpen((o) => !o);
              setTextColorOpen(false);
            }}
            onSelect={(value) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (editor.chain().focus() as any)
                .setHighlight({ color: value })
                .run();
              setLastHighlightColor(value);
              setHighlightColorOpen(false);
            }}
            onReset={() => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (editor.chain().focus() as any).unsetHighlight().run();
              setHighlightColorOpen(false);
            }}
            popoverRef={highlightColorRef}
          />
        </div>

        {/* Editor content */}
        <div className="px-4 py-3 prose prose-sm max-w-none text-slate-600 bg-white rounded-b-xl">
          <EditorContent editor={editor} placeholder={placeholder} />
        </div>
      </div>
    </>
  );
}

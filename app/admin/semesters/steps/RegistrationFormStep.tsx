"use client";

import { useEffect, useRef, useState } from "react";
import { RegistrationFormElement, SemesterAction, SemesterDraft } from "@/types";
import CustomQuestionModal from "@/app/components/semester-flow/CustomQuestionModal";
import SubheaderModal from "@/app/components/semester-flow/SubheaderModal";
import TextBlockModal from "@/app/components/semester-flow/TextBlockModal";
import WaiverModal from "@/app/components/semester-flow/WaiverModal";
import { DEFAULT_WAIVER_TITLE, DEFAULT_WAIVER_BODY, DEFAULT_ACKNOWLEDGMENT_LABEL } from "@/lib/waiver";
import { autosaveSemesterField } from "../actions/autosaveSemesterField";
import { ChevronDown, ChevronRight, GripVertical, MoreHorizontal, Plus, Loader2 } from "lucide-react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/* -------------------------------------------------------------------------- */
/* Defaults                                                                    */
/* -------------------------------------------------------------------------- */

function buildDefaultRegistrationElements(): RegistrationFormElement[] {
  return [
    { id: crypto.randomUUID(), type: "subheader", label: "Participant Questions" },
    { id: crypto.randomUUID(), type: "question", label: "First Name", inputType: "short_answer", required: true },
    { id: crypto.randomUUID(), type: "question", label: "Last Name", inputType: "short_answer", required: true },
    { id: crypto.randomUUID(), type: "question", label: "Date of Birth", inputType: "date", required: true },
    {
      id: crypto.randomUUID(), type: "text_block", label: "Attendance Policy",
      htmlContent: "<p><strong>Attendance Policy</strong></p><p>Please update this section with your attendance policy details.</p>",
    },
    { id: crypto.randomUUID(), type: "question", label: "School Name", inputType: "short_answer", required: false },
    {
      id: crypto.randomUUID(), type: "question", label: "Grade", inputType: "select", required: false,
      options: ["Pre-School","Kindergarten","1st Grade","2nd Grade","3rd Grade","4th Grade","5th Grade","6th Grade","7th Grade","8th Grade","9th Grade","10th Grade","11th Grade","12th Grade"],
    },
    { id: crypto.randomUUID(), type: "question", label: "Email Address", inputType: "short_answer", required: true },
    { id: crypto.randomUUID(), type: "question", label: "Phone Number", inputType: "phone_number", required: true },
    { id: crypto.randomUUID(), type: "question", label: "Address", inputType: "address", required: false },
    { id: crypto.randomUUID(), type: "question", label: "Nanny / Caregiver Name (if applicable)", inputType: "short_answer", required: false },
    { id: crypto.randomUUID(), type: "subheader", label: "Emergency Contact" },
    { id: crypto.randomUUID(), type: "question", label: "Emergency Contact Name", inputType: "short_answer", required: true },
    {
      id: crypto.randomUUID(), type: "waiver", label: DEFAULT_WAIVER_TITLE, required: true,
      waiverBody: DEFAULT_WAIVER_BODY, acknowledgmentLabel: DEFAULT_ACKNOWLEDGMENT_LABEL,
    },
    {
      id: crypto.randomUUID(), type: "question", label: "How did you hear about us?", inputType: "select", required: false,
      options: ["Social Media","Google Search","Word of Mouth","Returning Family","Flyer / Brochure","Other"],
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function inputTypeLabel(type: string | undefined): string {
  switch (type) {
    case "short_answer":  return "short answer";
    case "long_answer":   return "long answer";
    case "date":          return "date";
    case "select":        return "select";
    case "phone_number":  return "phone number";
    case "checkbox":      return "checkbox";
    case "address":       return "address block";
    default:              return type ?? "unknown";
  }
}

type SectionGroup = {
  header: RegistrationFormElement;
  headerIndex: number;
  fields: Array<{ el: RegistrationFormElement; index: number }>;
};

function groupIntoSections(elements: RegistrationFormElement[]): {
  leadingFields: Array<{ el: RegistrationFormElement; index: number }>;
  sections: SectionGroup[];
} {
  const leadingFields: Array<{ el: RegistrationFormElement; index: number }> = [];
  const sections: SectionGroup[] = [];
  let current: SectionGroup | null = null;

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (el.type === "subheader") {
      current = { header: el, headerIndex: i, fields: [] };
      sections.push(current);
    } else if (current) {
      current.fields.push({ el, index: i });
    } else {
      leadingFields.push({ el, index: i });
    }
  }

  return { leadingFields, sections };
}

/* -------------------------------------------------------------------------- */
/* SortableFieldRowItem                                                        */
/* -------------------------------------------------------------------------- */

function SortableFieldRowItem({
  el,
  isLocked,
  onEdit,
  onDelete,
}: {
  el: RegistrationFormElement;
  isLocked: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: el.id });

  const [rowMenuOpen, setRowMenuOpen] = useState(false);
  const rowMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rowMenuOpen) return;
    function onOutside(e: MouseEvent) {
      if (rowMenuRef.current && !rowMenuRef.current.contains(e.target as Node)) {
        setRowMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [rowMenuOpen]);

  const typeLabel =
    el.type === "text_block"
      ? "text block"
      : el.type === "waiver"
        ? "waiver + acknowledgment"
        : inputTypeLabel(el.inputType);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}
      className="group flex items-center px-4 py-3 border-b border-neutral-100 last:border-b-0 bg-white hover:bg-neutral-50 transition-colors"
    >
      {/* Field drag handle */}
      {!isLocked && (
        <button
          {...attributes}
          {...listeners}
          className="p-1 mr-2 text-neutral-200 hover:text-neutral-400 cursor-grab active:cursor-grabbing shrink-0 touch-none"
          tabIndex={-1}
        >
          <GripVertical size={14} />
        </button>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {el.type === "question" && el.required ? (
            <span className="text-primary-600 text-[10px] leading-none shrink-0">●</span>
          ) : (
            <span className="w-3 shrink-0" />
          )}
          <span className={`text-sm font-medium text-neutral-900 truncate ${el.type === "text_block" ? "italic" : ""}`}>
            {el.label}
          </span>
        </div>
        <div className="text-xs text-neutral-400 mt-0.5 pl-[18px]">{typeLabel}</div>
      </div>

      {!isLocked && (
        <div className="relative ml-3 shrink-0" ref={rowMenuRef}>
          <button
            onClick={() => setRowMenuOpen((o) => !o)}
            className="p-1.5 rounded text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
          >
            <MoreHorizontal size={14} />
          </button>
          {rowMenuOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-neutral-200 rounded-lg shadow-lg py-1 min-w-[100px]">
              <button
                onClick={() => { onEdit(); setRowMenuOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-sm text-primary-600 hover:bg-neutral-50"
              >
                Edit
              </button>
              <button
                onClick={() => { onDelete(); setRowMenuOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-sm text-red-500 hover:bg-neutral-50"
              >
                Remove
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* SortableSectionCard                                                         */
/* -------------------------------------------------------------------------- */

function SortableSectionCard({
  section,
  isLocked,
  isCollapsed,
  onToggleCollapse,
  onEditHeader,
  onDeleteHeader,
  onAddField,
  onEditField,
  onDeleteField,
}: {
  section: SectionGroup;
  isLocked: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onEditHeader: () => void;
  onDeleteHeader: () => void;
  onAddField: (afterIndex: number, type: "question" | "text_block" | "waiver") => void;
  onEditField: (el: RegistrationFormElement) => void;
  onDeleteField: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.header.id });

  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const [sectionMenuOpen, setSectionMenuOpen] = useState(false);
  const sectionMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!addMenuOpen) return;
    function onOutside(e: MouseEvent) {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setAddMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [addMenuOpen]);

  useEffect(() => {
    if (!sectionMenuOpen) return;
    function onOutside(e: MouseEvent) {
      if (sectionMenuRef.current && !sectionMenuRef.current.contains(e.target as Node)) {
        setSectionMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [sectionMenuOpen]);

  const lastIndex =
    section.fields.length > 0
      ? section.fields[section.fields.length - 1].index
      : section.headerIndex;

  const fieldIds = section.fields.map((f) => f.el.id);

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 10 : undefined,
      }}
      className="rounded-xl border border-neutral-200 bg-white overflow-hidden"
    >
      {/* Section header */}
      <div className="flex items-center gap-2 px-3 py-3 border-b-2 border-primary-600">
        {/* Section-level drag handle */}
        {!isLocked && (
          <button
            {...attributes}
            {...listeners}
            className="p-1 text-neutral-300 hover:text-neutral-500 cursor-grab active:cursor-grabbing shrink-0 touch-none"
            tabIndex={-1}
          >
            <GripVertical size={15} />
          </button>
        )}

        {/* Collapse toggle */}
        <button
          onClick={onToggleCollapse}
          className="p-0.5 text-neutral-400 hover:text-neutral-600 transition-colors shrink-0"
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>

        <span className="flex-1 text-sm font-bold uppercase tracking-wide text-neutral-800 truncate">
          {section.header.label}
        </span>

        <span className="shrink-0 text-xs px-2 py-0.5 rounded-full border border-neutral-200 text-neutral-500 font-medium">
          {section.fields.length} {section.fields.length === 1 ? "field" : "fields"}
        </span>

        {!isLocked && (
          <div className="relative shrink-0" ref={sectionMenuRef}>
            <button
              onClick={() => setSectionMenuOpen((o) => !o)}
              className="p-1.5 rounded text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
            >
              <MoreHorizontal size={14} />
            </button>
            {sectionMenuOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-neutral-200 rounded-lg shadow-lg py-1 min-w-[130px]">
                <button
                  onClick={() => { onEditHeader(); setSectionMenuOpen(false); }}
                  className="w-full text-left px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
                >
                  Edit section
                </button>
                <button
                  onClick={() => { onDeleteHeader(); setSectionMenuOpen(false); }}
                  className="w-full text-left px-3 py-1.5 text-sm text-red-500 hover:bg-neutral-50"
                >
                  Delete section
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Collapsible body */}
      {!isCollapsed && (
        <>
          <SortableContext items={fieldIds} strategy={verticalListSortingStrategy}>
            {section.fields.map(({ el }) => (
              <SortableFieldRowItem
                key={el.id}
                el={el}
                isLocked={isLocked}
                onEdit={() => onEditField(el)}
                onDelete={() => onDeleteField(el.id)}
              />
            ))}
          </SortableContext>

          {/* Add field row */}
          {!isLocked && (
            <div ref={addMenuRef} className="relative px-5 py-3 border-t border-dashed border-neutral-200">
              <button
                onClick={() => setAddMenuOpen((p) => !p)}
                className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-neutral-600 transition-colors"
              >
                <Plus size={13} />
                Add field to this section
              </button>

              {addMenuOpen && (
                <div className="absolute left-4 bottom-full mb-1.5 z-20 w-44 rounded-lg border border-neutral-200 bg-white shadow-lg overflow-hidden">
                  <button
                    onClick={() => { setAddMenuOpen(false); onAddField(lastIndex, "question"); }}
                    className="w-full px-3 py-2.5 text-left text-sm text-neutral-700 hover:bg-neutral-50 transition-colors"
                  >
                    Custom question
                  </button>
                  <button
                    onClick={() => { setAddMenuOpen(false); onAddField(lastIndex, "text_block"); }}
                    className="w-full px-3 py-2.5 text-left text-sm text-neutral-700 hover:bg-neutral-50 transition-colors border-t border-neutral-100"
                  >
                    Text block
                  </button>
                  <button
                    onClick={() => { setAddMenuOpen(false); onAddField(lastIndex, "waiver"); }}
                    className="w-full px-3 py-2.5 text-left text-sm text-neutral-700 hover:bg-neutral-50 transition-colors border-t border-neutral-100"
                  >
                    Waiver
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Main component                                                              */
/* -------------------------------------------------------------------------- */

type Props = {
  state: SemesterDraft;
  dispatch: React.Dispatch<SemesterAction>;
  onNext: () => void;
  onBack: () => void;
  isLocked?: boolean;
  semesterId?: string;
};

type ActiveModal = "question" | "subheader" | "text_block" | "waiver" | null;

export default function RegistrationFormStep({ state, dispatch, isLocked = false, semesterId }: Props) {
  const elements = state.registrationForm?.elements ?? [];

  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [editingElement, setEditingElement] = useState<RegistrationFormElement | null>(null);
  const [autosaving, setAutosaving] = useState(false);
  const [addingToSectionAfterIndex, setAddingToSectionAfterIndex] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  /* -------------------------------------------------------------------------- */
  /* Pre-populate defaults                                                       */
  /* -------------------------------------------------------------------------- */

  useEffect(() => {
    if (!isLocked && elements.length === 0) {
      const defaults = buildDefaultRegistrationElements();
      dispatch({ type: "REORDER_FORM_ELEMENTS", payload: defaults });
      if (semesterId) {
        autosaveSemesterField(semesterId, "registration_form", { elements: defaults }).catch(() => {});
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -------------------------------------------------------------------------- */
  /* Debounced Autosave                                                          */
  /* -------------------------------------------------------------------------- */

  useEffect(() => {
    if (!semesterId || isLocked) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(async () => {
      setAutosaving(true);
      try {
        await autosaveSemesterField(semesterId, "registration_form", state.registrationForm ?? { elements: [] });
      } catch { /* silent */ }
      finally { setAutosaving(false); }
    }, 8000);
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.registrationForm]);

  /* -------------------------------------------------------------------------- */
  /* Modal controls                                                              */
  /* -------------------------------------------------------------------------- */

  function openModal(modal: ActiveModal, element: RegistrationFormElement | null = null) {
    setEditingElement(element);
    setActiveModal(modal);
  }

  function closeModal() {
    setActiveModal(null);
    setEditingElement(null);
    setAddingToSectionAfterIndex(null);
  }

  /* -------------------------------------------------------------------------- */
  /* Element operations                                                          */
  /* -------------------------------------------------------------------------- */

  function handleSaveElement(element: RegistrationFormElement) {
    if (editingElement) {
      dispatch({ type: "UPDATE_FORM_ELEMENT", payload: element });
    } else if (addingToSectionAfterIndex !== null) {
      const next = [...elements];
      next.splice(addingToSectionAfterIndex + 1, 0, element);
      dispatch({ type: "REORDER_FORM_ELEMENTS", payload: next });
    } else {
      dispatch({ type: "ADD_FORM_ELEMENT", payload: element });
    }
    closeModal();
  }

  function handleDelete(id: string) {
    dispatch({ type: "REMOVE_FORM_ELEMENT", payload: id });
  }

  function openAddFieldToSection(afterIndex: number, type: "question" | "text_block" | "waiver") {
    setEditingElement(null);
    setAddingToSectionAfterIndex(afterIndex);
    setActiveModal(type);
  }

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  /* -------------------------------------------------------------------------- */
  /* Drag & Drop                                                                 */
  /* -------------------------------------------------------------------------- */

  const { leadingFields, sections } = groupIntoSections(elements);

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDragId(null);
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const sectionIds = new Set(sections.map((s) => s.header.id));

    if (sectionIds.has(activeId) && sectionIds.has(overId)) {
      // Reorder sections as whole blocks
      const oldIdx = sections.findIndex((s) => s.header.id === activeId);
      const newIdx = sections.findIndex((s) => s.header.id === overId);
      const reordered = arrayMove(sections, oldIdx, newIdx);
      dispatch({
        type: "REORDER_FORM_ELEMENTS",
        payload: [
          ...leadingFields.map((f) => f.el),
          ...reordered.flatMap((s) => [s.header, ...s.fields.map((f) => f.el)]),
        ],
      });
    } else {
      // Reorder fields within the same section
      for (const section of sections) {
        const fieldIds = section.fields.map((f) => f.el.id);
        if (!fieldIds.includes(activeId) || !fieldIds.includes(overId)) continue;

        const oldIdx = fieldIds.indexOf(activeId);
        const newIdx = fieldIds.indexOf(overId);
        const reorderedFields = arrayMove(section.fields.map((f) => f.el), oldIdx, newIdx);

        dispatch({
          type: "REORDER_FORM_ELEMENTS",
          payload: [
            ...leadingFields.map((f) => f.el),
            ...sections.flatMap((s) =>
              s.header.id === section.header.id
                ? [s.header, ...reorderedFields]
                : [s.header, ...s.fields.map((f) => f.el)],
            ),
          ],
        });
        break;
      }
    }
  }

  // Determine what's being dragged for the overlay
  const activeDragSection = activeDragId ? sections.find((s) => s.header.id === activeDragId) : null;
  const activeDragField = activeDragId
    ? sections.flatMap((s) => s.fields).find((f) => f.el.id === activeDragId)?.el ?? null
    : null;

  /* -------------------------------------------------------------------------- */
  /* Render                                                                      */
  /* -------------------------------------------------------------------------- */

  return (
    <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-neutral-900">Registration Form</h2>
          <p className="text-sm text-neutral-500 mt-1">
            Customize the questions users must complete before registering.
          </p>
        </div>
        {autosaving && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 mt-1">
            <Loader2 size={13} className="animate-spin" />
            Saving…
          </span>
        )}
      </div>

      {/* Locked banner */}
      {isLocked && (
        <div className="rounded-xl bg-mauve/10 border border-mauve px-4 py-3 text-sm text-mauve-text">
          This semester has active registrations. The registration form is locked.
        </div>
      )}

      {/* Add Controls */}
      {!isLocked && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => openModal("question")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary-600 text-primary-600 hover:bg-primary-50 transition text-sm font-medium"
          >
            + Custom question
          </button>
          <button
            onClick={() => openModal("subheader")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-neutral-300 text-neutral-600 hover:bg-neutral-50 transition text-sm"
          >
            + New section
          </button>
          <button
            onClick={() => openModal("text_block")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-neutral-300 text-neutral-600 hover:bg-neutral-50 transition text-sm"
          >
            + Text block
          </button>
          <button
            onClick={() => openModal("waiver")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-neutral-300 text-neutral-600 hover:bg-neutral-50 transition text-sm"
          >
            + Waiver
          </button>
        </div>
      )}

      {elements.length === 0 && (
        <div className="text-sm text-neutral-400 py-8 text-center">No form elements added yet.</div>
      )}

      {/* Sections with drag & drop */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={sections.map((s) => s.header.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-4">
            {sections.map((section) => (
              <SortableSectionCard
                key={section.header.id}
                section={section}
                isLocked={isLocked}
                isCollapsed={collapsed.has(section.header.id)}
                onToggleCollapse={() => toggleCollapse(section.header.id)}
                onEditHeader={() => openModal("subheader", section.header)}
                onDeleteHeader={() => handleDelete(section.header.id)}
                onAddField={openAddFieldToSection}
                onEditField={(el) => openModal(el.type, el)}
                onDeleteField={handleDelete}
              />
            ))}
          </div>
        </SortableContext>

        {/* Drag overlay */}
        <DragOverlay>
          {activeDragSection && (
            <div className="rounded-xl border border-neutral-200 bg-white shadow-xl opacity-95">
              <div className="flex items-center gap-2 px-3 py-3 border-b-2 border-primary-600">
                <GripVertical size={15} className="text-neutral-300" />
                <span className="flex-1 text-sm font-bold uppercase tracking-wide text-neutral-800 truncate">
                  {activeDragSection.header.label}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full border border-neutral-200 text-neutral-500 font-medium">
                  {activeDragSection.fields.length} {activeDragSection.fields.length === 1 ? "field" : "fields"}
                </span>
              </div>
            </div>
          )}
          {activeDragField && (
            <div className="flex items-center px-4 py-3 bg-white rounded-lg border border-neutral-200 shadow-xl opacity-95">
              <GripVertical size={14} className="text-neutral-300 mr-2 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {activeDragField.type === "question" && activeDragField.required && (
                    <span className="text-primary-600 text-[10px] leading-none shrink-0">●</span>
                  )}
                  <span className={`text-sm font-medium text-neutral-900 truncate ${activeDragField.type === "text_block" ? "italic" : ""}`}>
                    {activeDragField.label}
                  </span>
                </div>
                <div className="text-xs text-neutral-400 mt-0.5 pl-[18px]">
                  {activeDragField.type === "text_block"
                    ? "text block"
                    : activeDragField.type === "waiver"
                      ? "waiver + acknowledgment"
                      : inputTypeLabel(activeDragField.inputType)}
                </div>
              </div>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Modals */}
      {activeModal === "question" && (
        <CustomQuestionModal
          initialElement={editingElement}
          onClose={closeModal}
          onSave={handleSaveElement}
          sessions={(state.sessions?.classes ?? []).flatMap((cls) =>
            (cls.schedules ?? []).map((cs) => ({
              sessionId: cs.id ?? "",
              title: `${cls.name} — ${cs.daysOfWeek.join(", ")}`,
            })),
          )}
        />
      )}
      {activeModal === "subheader" && (
        <SubheaderModal initialElement={editingElement} onClose={closeModal} onSave={handleSaveElement} />
      )}
      {activeModal === "text_block" && (
        <TextBlockModal initialElement={editingElement} onClose={closeModal} onSave={handleSaveElement} />
      )}
      {activeModal === "waiver" && (
        <WaiverModal initialElement={editingElement} onClose={closeModal} onSave={handleSaveElement} />
      )}
    </div>
  );
}

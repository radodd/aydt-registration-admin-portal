"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Family } from "@/types";
import { getFamilies } from "@/queries/admin";
import { createFamily, type CreateFamilyInput } from "./actions/createFamily";
import { addParent, type AddParentInput } from "./actions/addParent";
import { updateParent, type UpdateParentInput } from "./actions/updateParent";
import { removeParent } from "./actions/removeParent";
import { setPrimaryParent } from "./actions/setPrimaryParent";
import { addDancer, type AddDancerInput } from "./actions/addDancer";
import { updateDancer, type UpdateDancerInput } from "./actions/updateDancer";
import { removeDancer } from "./actions/removeDancer";

type FamilyUser = Family["users"][number];
type FamilyDancer = Family["dancers"][number];

type ModalState =
  | { type: "createFamily" }
  | { type: "addParent"; familyId: string }
  | { type: "editParent"; user: FamilyUser; familyId: string }
  | { type: "removeParent"; userId: string; name: string }
  | { type: "addDancer"; familyId: string }
  | { type: "editDancer"; dancer: FamilyDancer }
  | { type: "removeDancer"; dancer: FamilyDancer }
  | null;

export default function FamiliesAdmin() {
  const [families, setFamilies] = useState<Family[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalState>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const reload = async () => {
    const data = await getFamilies();
    setFamilies((data as Family[]) ?? []);
  };

  useEffect(() => {
    getFamilies()
      .then((data) => setFamilies((data as Family[]) ?? []))
      .finally(() => setLoading(false));
  }, []);

  const closeModal = () => {
    setModal(null);
    setModalError(null);
  };

  const run = (fn: () => Promise<void>) => {
    startTransition(async () => {
      try {
        setModalError(null);
        await fn();
      } catch (e: unknown) {
        setModalError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  };

  /* ── Handlers ─────────────────────────────────────────────────────────── */

  const handleCreateFamily = (input: CreateFamilyInput) =>
    run(async () => {
      await createFamily(input);
      await reload();
      closeModal();
    });

  const handleAddParent = (input: AddParentInput) =>
    run(async () => {
      await addParent(input);
      await reload();
      closeModal();
    });

  const handleUpdateParent = (input: UpdateParentInput) =>
    run(async () => {
      await updateParent(input);
      await reload();
      closeModal();
    });

  const handleRemoveParent = (userId: string) =>
    run(async () => {
      await removeParent(userId);
      await reload();
      closeModal();
    });

  const handleSetPrimary = (familyId: string, userId: string) =>
    run(async () => {
      await setPrimaryParent(familyId, userId);
      await reload();
    });

  const handleAddDancer = (input: AddDancerInput) =>
    run(async () => {
      await addDancer(input);
      await reload();
      closeModal();
    });

  const handleUpdateDancer = (input: UpdateDancerInput) =>
    run(async () => {
      await updateDancer(input);
      await reload();
      closeModal();
    });

  const handleRemoveDancer = (dancerId: string) =>
    run(async () => {
      const result = await removeDancer(dancerId);
      if (!result.ok) {
        setModalError(result.reason);
        return;
      }
      await reload();
      closeModal();
    });

  /* ── Render ───────────────────────────────────────────────────────────── */

  if (loading) {
    return (
      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="bg-white border border-gray-200 rounded-2xl p-8 text-gray-500">
          Loading families...
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-6 py-10 space-y-10">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">Families</h1>
          <p className="text-sm text-gray-500 mt-1">
            Overview of families, parents, and dancers.
          </p>
        </div>
        <button
          onClick={() => setModal({ type: "createFamily" })}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
        >
          + New Family
        </button>
      </header>

      {/* Content */}
      {families.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-10 text-center text-gray-500">
          No families found.
        </div>
      ) : (
        <div className="space-y-8">
          {families.map((family) => {
            const primaryParent = family.users.find((u) => u.is_primary_parent);
            const secondaryParent = family.users.find(
              (u) => !u.is_primary_parent,
            );

            return (
              <div
                key={family.id}
                className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 space-y-6"
              >
                {/* Family Header */}
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-gray-900">
                    {family.family_name}
                  </h2>
                  <span className="inline-flex px-3 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600">
                    {family.dancers.length} Dancer
                    {family.dancers.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Parents */}
                <section className="space-y-3">
                  <h3 className="text-sm font-medium uppercase tracking-wide text-gray-600">
                    Parents
                  </h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    {/* Primary */}
                    {primaryParent && (
                      <ParentCard
                        title="Primary Parent"
                        parent={primaryParent}
                        primary
                        onEdit={() =>
                          setModal({
                            type: "editParent",
                            user: primaryParent,
                            familyId: family.id,
                          })
                        }
                      />
                    )}

                    {/* Secondary */}
                    {secondaryParent ? (
                      <ParentCard
                        title="Additional Parent"
                        parent={secondaryParent}
                        onEdit={() =>
                          setModal({
                            type: "editParent",
                            user: secondaryParent,
                            familyId: family.id,
                          })
                        }
                        onMakePrimary={() =>
                          handleSetPrimary(family.id, secondaryParent.id)
                        }
                        onRemove={() =>
                          setModal({
                            type: "removeParent",
                            userId: secondaryParent.id,
                            name: `${secondaryParent.first_name} ${secondaryParent.last_name}`,
                          })
                        }
                        isPending={isPending}
                      />
                    ) : (
                      <div className="bg-gray-50 border border-dashed border-gray-300 rounded-2xl p-6 flex items-center justify-center">
                        <button
                          onClick={() =>
                            setModal({ type: "addParent", familyId: family.id })
                          }
                          className="text-sm text-indigo-600 font-medium hover:underline"
                        >
                          + Add Additional Parent
                        </button>
                      </div>
                    )}
                  </div>
                </section>

                {/* Dancers */}
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium uppercase tracking-wide text-gray-600">
                      Dancers
                    </h3>
                    <button
                      onClick={() =>
                        setModal({ type: "addDancer", familyId: family.id })
                      }
                      className="text-xs text-indigo-600 font-medium hover:underline"
                    >
                      + Add Dancer
                    </button>
                  </div>

                  {family.dancers.length === 0 ? (
                    <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 text-sm text-gray-500">
                      No dancers added yet.
                    </div>
                  ) : (
                    <div className="grid md:grid-cols-2 gap-6">
                      {family.dancers.map((dancer) => (
                        <div
                          key={dancer.id}
                          className="bg-gray-50 border border-gray-200 rounded-2xl p-5 space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-gray-900">
                                {dancer.first_name} {dancer.last_name}
                              </p>
                              {dancer.is_self && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">
                                  Self
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/admin/register?dancer=${dancer.id}&family=${family.id}`}
                                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                              >
                                Register
                              </Link>
                              <button
                                onClick={() =>
                                  setModal({ type: "editDancer", dancer })
                                }
                                className="text-xs text-gray-500 hover:text-indigo-600 font-medium"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() =>
                                  setModal({ type: "removeDancer", dancer })
                                }
                                className="text-xs text-gray-500 hover:text-red-600 font-medium"
                              >
                                Remove
                              </button>
                            </div>
                          </div>

                          {dancer.registrations.length > 0 ? (
                            <ul className="space-y-2 text-sm text-gray-600">
                              {dancer.registrations.map((reg) => (
                                <li
                                  key={reg.class_sessions?.id ?? reg.id}
                                  className="bg-white border border-gray-200 rounded-xl px-3 py-2"
                                >
                                  <span className="font-medium text-gray-800">
                                    {reg.class_sessions?.classes?.name}
                                  </span>
                                  <div className="text-xs text-gray-500">
                                    {reg.class_sessions?.day_of_week} •{" "}
                                    {reg.class_sessions?.start_time}–
                                    {reg.class_sessions?.end_time}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-sm text-gray-400">
                              No registered classes.
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            {modal.type === "createFamily" && (
              <CreateFamilyModal
                onSubmit={handleCreateFamily}
                onClose={closeModal}
                error={modalError}
                isPending={isPending}
              />
            )}
            {(modal.type === "addParent" || modal.type === "editParent") && (
              <ParentFormModal
                mode={modal.type === "addParent" ? "add" : "edit"}
                initial={modal.type === "editParent" ? modal.user : undefined}
                familyId={
                  modal.type === "addParent" ? modal.familyId : modal.familyId
                }
                onAdd={handleAddParent}
                onUpdate={handleUpdateParent}
                onClose={closeModal}
                error={modalError}
                isPending={isPending}
              />
            )}
            {modal.type === "removeParent" && (
              <ConfirmModal
                title="Remove Parent"
                message={`Are you sure you want to remove ${modal.name} from this family?`}
                confirmLabel="Remove"
                destructive
                onConfirm={() => handleRemoveParent(modal.userId)}
                onClose={closeModal}
                error={modalError}
                isPending={isPending}
              />
            )}
            {(modal.type === "addDancer" || modal.type === "editDancer") && (
              <DancerFormModal
                mode={modal.type === "addDancer" ? "add" : "edit"}
                initial={modal.type === "editDancer" ? modal.dancer : undefined}
                familyId={
                  modal.type === "addDancer" ? modal.familyId : undefined
                }
                onAdd={handleAddDancer}
                onUpdate={handleUpdateDancer}
                onClose={closeModal}
                error={modalError}
                isPending={isPending}
              />
            )}
            {modal.type === "removeDancer" && (
              <ConfirmModal
                title="Remove Dancer"
                message={`Are you sure you want to remove ${modal.dancer.first_name} ${modal.dancer.last_name}?`}
                confirmLabel="Remove"
                destructive
                onConfirm={() => handleRemoveDancer(modal.dancer.id)}
                onClose={closeModal}
                error={modalError}
                isPending={isPending}
              />
            )}
          </div>
        </div>
      )}
    </main>
  );
}

/* ============================================================================
   Parent Card
============================================================================ */

function ParentCard({
  title,
  parent,
  primary,
  onEdit,
  onMakePrimary,
  onRemove,
  isPending,
}: {
  title: string;
  parent: FamilyUser;
  primary?: boolean;
  onEdit: () => void;
  onMakePrimary?: () => void;
  onRemove?: () => void;
  isPending?: boolean;
}) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium uppercase tracking-wide text-gray-600">
            {title}
          </h3>
          {primary && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">
              Primary
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {onMakePrimary && (
            <button
              onClick={onMakePrimary}
              disabled={isPending}
              className="text-xs text-gray-500 hover:text-indigo-600 font-medium disabled:opacity-50"
            >
              Make Primary
            </button>
          )}
          {onRemove && (
            <button
              onClick={onRemove}
              className="text-xs text-gray-500 hover:text-red-600 font-medium"
            >
              Remove
            </button>
          )}
          <button
            onClick={onEdit}
            className="text-xs text-gray-500 hover:text-indigo-600 font-medium"
          >
            Edit
          </button>
        </div>
      </div>

      <div className="text-sm text-gray-700 space-y-1">
        <div className="font-medium text-gray-900">
          {parent.first_name} {parent.last_name}
        </div>
        <div>{parent.email}</div>
        <div className="text-gray-500">
          {parent.phone_number || "No phone listed"}
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   Create Family Modal
============================================================================ */

function CreateFamilyModal({
  onSubmit,
  onClose,
  error,
  isPending,
}: {
  onSubmit: (input: CreateFamilyInput) => void;
  onClose: () => void;
  error: string | null;
  isPending: boolean;
}) {
  const [familyName, setFamilyName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [sendInvite, setSendInvite] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ familyName, firstName, lastName, email, phone, sendInvite });
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">New Family</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Create a family and its primary parent account.
        </p>
      </div>

      <div className="space-y-3">
        <FormField label="Family Name" required>
          <input
            type="text"
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            placeholder="e.g. Smith Family"
            required
            className={inputCls}
          />
        </FormField>

        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 pt-1">
          Primary Parent
        </p>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="First Name" required>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              className={inputCls}
            />
          </FormField>
          <FormField label="Last Name" required>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              className={inputCls}
            />
          </FormField>
        </div>

        <FormField label="Email" required>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={inputCls}
          />
        </FormField>

        <FormField label="Phone">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputCls}
          />
        </FormField>

        <label className="flex items-start gap-3 cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={sendInvite}
            onChange={(e) => setSendInvite(e.target.checked)}
            className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <div>
            <p className="text-sm font-medium text-gray-800">
              Send invite email
            </p>
            <p className="text-xs text-gray-500">
              A welcome email will be sent to the parent once auth is
              configured.
            </p>
          </div>
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <ModalActions
        onClose={onClose}
        isPending={isPending}
        submitLabel="Create Family"
      />
    </form>
  );
}

/* ============================================================================
   Parent Form Modal (Add + Edit)
============================================================================ */

function ParentFormModal({
  mode,
  initial,
  familyId,
  onAdd,
  onUpdate,
  onClose,
  error,
  isPending,
}: {
  mode: "add" | "edit";
  initial?: FamilyUser;
  familyId: string;
  onAdd: (input: AddParentInput) => void;
  onUpdate: (input: UpdateParentInput) => void;
  onClose: () => void;
  error: string | null;
  isPending: boolean;
}) {
  const [firstName, setFirstName] = useState(initial?.first_name ?? "");
  const [lastName, setLastName] = useState(initial?.last_name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone_number ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "add") {
      onAdd({ familyId, firstName, lastName, email, phone });
    } else {
      onUpdate({ userId: initial!.id, firstName, lastName, email, phone });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-5">
      <h2 className="text-lg font-semibold text-gray-900">
        {mode === "add" ? "Add Additional Parent" : "Edit Parent"}
      </h2>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="First Name" required>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              className={inputCls}
            />
          </FormField>
          <FormField label="Last Name" required>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              className={inputCls}
            />
          </FormField>
        </div>

        <FormField label="Email" required>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={inputCls}
          />
        </FormField>

        <FormField label="Phone">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputCls}
          />
        </FormField>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <ModalActions
        onClose={onClose}
        isPending={isPending}
        submitLabel={mode === "add" ? "Add Parent" : "Save Changes"}
      />
    </form>
  );
}

/* ============================================================================
   Dancer Form Modal (Add + Edit)
============================================================================ */

function DancerFormModal({
  mode,
  initial,
  familyId,
  onAdd,
  onUpdate,
  onClose,
  error,
  isPending,
}: {
  mode: "add" | "edit";
  initial?: FamilyDancer;
  familyId?: string;
  onAdd: (input: AddDancerInput) => void;
  onUpdate: (input: UpdateDancerInput) => void;
  onClose: () => void;
  error: string | null;
  isPending: boolean;
}) {
  const [firstName, setFirstName] = useState(initial?.first_name ?? "");
  const [lastName, setLastName] = useState(initial?.last_name ?? "");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "add") {
      onAdd({ familyId: familyId!, firstName, lastName, birthDate, gender });
    } else {
      onUpdate({
        dancerId: initial!.id,
        firstName,
        lastName,
        birthDate,
        gender,
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-5">
      <h2 className="text-lg font-semibold text-gray-900">
        {mode === "add" ? "Add Dancer" : "Edit Dancer"}
      </h2>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="First Name" required>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              className={inputCls}
            />
          </FormField>
          <FormField label="Last Name" required>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              className={inputCls}
            />
          </FormField>
        </div>

        <FormField label="Date of Birth">
          <input
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className={inputCls}
          />
        </FormField>

        <FormField label="Gender">
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            className={inputCls}
          >
            <option value="">Select...</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="non_binary">Non-binary</option>
            <option value="prefer_not_to_say">Prefer not to say</option>
          </select>
        </FormField>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <ModalActions
        onClose={onClose}
        isPending={isPending}
        submitLabel={mode === "add" ? "Add Dancer" : "Save Changes"}
      />
    </form>
  );
}

/* ============================================================================
   Confirm Modal
============================================================================ */

function ConfirmModal({
  title,
  message,
  confirmLabel,
  destructive,
  onConfirm,
  onClose,
  error,
  isPending,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  error: string | null;
  isPending: boolean;
}) {
  return (
    <div className="p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-600 mt-1">{message}</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3 justify-end">
        <button
          type="button"
          onClick={onClose}
          disabled={isPending}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isPending}
          className={`px-4 py-2 text-sm font-medium text-white rounded-xl disabled:opacity-50 ${
            destructive
              ? "bg-red-600 hover:bg-red-700"
              : "bg-indigo-600 hover:bg-indigo-700"
          }`}
        >
          {isPending ? "Working..." : confirmLabel}
        </button>
      </div>
    </div>
  );
}

/* ============================================================================
   Shared helpers
============================================================================ */

const inputCls =
  "w-full px-3 py-2 text-sm border border-gray-300 rounded-xl text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500";

function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function ModalActions({
  onClose,
  isPending,
  submitLabel,
}: {
  onClose: () => void;
  isPending: boolean;
  submitLabel: string;
}) {
  return (
    <div className="flex gap-3 justify-end pt-1">
      <button
        type="button"
        onClick={onClose}
        disabled={isPending}
        className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={isPending}
        className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-50"
      >
        {isPending ? "Saving..." : submitLabel}
      </button>
    </div>
  );
}

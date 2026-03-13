"use client";

import { useState, useEffect, useRef } from "react";
import { Search, User, UserPlus, X, ChevronRight, Users } from "lucide-react";
import {
  searchDancersByCriteria,
  searchFamilies,
  type DancerSearchResult,
  type FamilySearchResult,
} from "../actions/searchDancers";
import {
  fetchFamilyMembers,
  type FamilyDetails,
  type FamilyPersonOption,
} from "../actions/fetchFamilyMembers";

export type DancerStepResult = {
  dancerId: string | null;
  dancerName: string;
  familyId: string | null;
  parentUserId: string | null;
  isNewDancer: boolean;
  newDancer: {
    firstName: string;
    lastName: string;
    birthDate: string;
    gender: string;
    grade: string;
    linkToFamilyId: string | null;
    newFamilyName: string;
  } | null;
};

type Props = {
  onNext: (result: DancerStepResult) => void;
};

function calcAge(birthDate: string): number {
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function fmtBirthDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

// ─── Family Select Modal ────────────────────────────────────────────────────

type NewMemberForm = {
  relationship: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: string;
  grade: string;
};

type FamilyModalProps = {
  family: FamilyDetails;
  onSelect: (result: DancerStepResult) => void;
  onClose: () => void;
};

function FamilySelectModal({ family, onSelect, onClose }: FamilyModalProps) {
  const [selectedMemberId, setSelectedMemberId] = useState<string | "new" | null>(null);
  const [newMember, setNewMember] = useState<NewMemberForm>({
    relationship: "",
    firstName: "",
    lastName: family.familyName?.replace(" Family", "") ?? "",
    birthDate: "",
    gender: "",
    grade: "",
  });
  const [loading, setLoading] = useState(false);

  const selectedMember =
    selectedMemberId !== "new" && selectedMemberId
      ? family.members.find((m) => m.id === selectedMemberId) ?? null
      : null;

  const canRegister =
    (selectedMemberId !== null && selectedMemberId !== "new") ||
    (selectedMemberId === "new" && newMember.firstName.trim() !== "" && newMember.lastName.trim() !== "");

  function handleRegister() {
    if (!canRegister) return;
    setLoading(true);

    if (selectedMemberId === "new") {
      onSelect({
        dancerId: null,
        dancerName: `${newMember.firstName} ${newMember.lastName}`,
        familyId: family.id,
        parentUserId: family.primaryParentId,
        isNewDancer: true,
        newDancer: {
          firstName: newMember.firstName,
          lastName: newMember.lastName,
          birthDate: newMember.birthDate,
          gender: newMember.gender,
          grade: newMember.grade,
          linkToFamilyId: family.id,
          newFamilyName: family.familyName ?? `${newMember.lastName} Family`,
        },
      });
    } else if (selectedMember) {
      if (selectedMember.type === "dancer") {
        // Existing dancer record
        onSelect({
          dancerId: selectedMember.id,
          dancerName: `${selectedMember.firstName} ${selectedMember.lastName}`,
          familyId: family.id,
          parentUserId: family.primaryParentId,
          isNewDancer: false,
          newDancer: null,
        });
      } else {
        // Parent (user) — register as new dancer using their name
        onSelect({
          dancerId: null,
          dancerName: `${selectedMember.firstName} ${selectedMember.lastName}`,
          familyId: family.id,
          parentUserId: selectedMember.id,
          isNewDancer: true,
          newDancer: {
            firstName: selectedMember.firstName,
            lastName: selectedMember.lastName,
            birthDate: "",
            gender: "",
            grade: "",
            linkToFamilyId: family.id,
            newFamilyName: family.familyName ?? `${selectedMember.lastName} Family`,
          },
        });
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-blue-700 text-white flex items-center justify-between">
          <h2 className="text-base font-semibold">
            Register a participant from this family
          </h2>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex gap-0 divide-x divide-gray-100">
          {/* Left — member selection */}
          <div className="flex-1 p-6 space-y-4">
            <p className="text-sm font-medium text-slate-700">
              Who do you want to register from this family?
            </p>

            <div className="space-y-2">
              {family.members.map((member) => (
                <label
                  key={member.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                    selectedMemberId === member.id
                      ? "border-blue-400 bg-blue-50"
                      : "border-gray-200 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="family-member"
                    value={member.id}
                    checked={selectedMemberId === member.id}
                    onChange={() => setSelectedMemberId(member.id)}
                    className="mt-0.5 accent-blue-600"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {member.firstName} {member.lastName}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {member.relationLabel}
                      {member.birthDate &&
                        `, DOB: ${fmtBirthDate(member.birthDate)}`}
                      {member.gender && `, ${member.gender.charAt(0).toUpperCase() + member.gender.slice(1)}`}
                    </p>
                  </div>
                </label>
              ))}

              {/* Add new family member */}
              <label
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                  selectedMemberId === "new"
                    ? "border-blue-400 bg-blue-50"
                    : "border-gray-200 hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name="family-member"
                  value="new"
                  checked={selectedMemberId === "new"}
                  onChange={() => setSelectedMemberId("new")}
                  className="mt-0.5 accent-blue-600"
                />
                <span className="text-sm font-medium text-slate-700">
                  Add a new family member
                </span>
              </label>
            </div>

            {/* New member form */}
            {selectedMemberId === "new" && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Relationship <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={newMember.relationship}
                    onChange={(e) =>
                      setNewMember((s) => ({ ...s, relationship: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select one</option>
                    <option value="child">Child</option>
                    <option value="adult_learner">Adult learner</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    First name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newMember.firstName}
                    onChange={(e) =>
                      setNewMember((s) => ({ ...s, firstName: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Last name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newMember.lastName}
                    onChange={(e) =>
                      setNewMember((s) => ({ ...s, lastName: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Date of birth
                  </label>
                  <input
                    type="date"
                    value={newMember.birthDate}
                    onChange={(e) =>
                      setNewMember((s) => ({ ...s, birthDate: e.target.value }))
                    }
                    placeholder="MM/DD/YYYY"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Gender
                  </label>
                  <select
                    value={newMember.gender}
                    onChange={(e) =>
                      setNewMember((s) => ({ ...s, gender: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select one</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="non-binary">Non-binary</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Grade
                  </label>
                  <select
                    value={newMember.grade}
                    onChange={(e) =>
                      setNewMember((s) => ({ ...s, grade: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select one</option>
                    {["Pre-K","K","1st","2nd","3rd","4th","5th","6th","7th","8th","9th","10th","11th","12th","College","Adult"].map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Right — family info */}
          <div className="w-52 shrink-0 p-5 bg-gray-50">
            <p className="text-xs font-semibold text-slate-600 mb-3">
              This family&apos;s information
            </p>
            {family.familyName && (
              <div className="mb-2">
                <p className="text-xs text-slate-400">Family</p>
                <p className="text-sm text-slate-700 font-medium">{family.familyName}</p>
              </div>
            )}
            {family.phone && (
              <div className="mb-2">
                <p className="text-xs text-slate-400">Phone</p>
                <p className="text-sm text-slate-700">{family.phone}</p>
              </div>
            )}
            <div className="mt-3">
              <p className="text-xs text-slate-400">Members</p>
              <p className="text-sm text-slate-700">{family.members.length} people</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 border border-gray-200 rounded-lg hover:bg-slate-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleRegister}
            disabled={!canRegister || loading}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {loading ? "Loading…" : "Register"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main DancerStep ────────────────────────────────────────────────────────

export default function DancerStep({ onNext }: Props) {
  const [mode, setMode] = useState<"search" | "new">("search");

  // Split search fields
  const [firstNameQ, setFirstNameQ] = useState("");
  const [lastNameQ, setLastNameQ] = useState("");
  const [birthDateQ, setBirthDateQ] = useState("");

  const [results, setResults] = useState<DancerSearchResult[]>([]);
  const [familyResults, setFamilyResults] = useState<FamilySearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<DancerSearchResult | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Family modal state
  const [modalFamily, setModalFamily] = useState<FamilyDetails | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  // New dancer form state
  const [nd, setNd] = useState({
    firstName: "",
    lastName: "",
    birthDate: "",
    gender: "",
    grade: "",
  });
  const [familyMode, setFamilyMode] = useState<"existing" | "new">("new");
  const [famQuery, setFamQuery] = useState("");
  const [famResults, setFamResults] = useState<FamilySearchResult[]>([]);
  const [selectedFamily, setSelectedFamily] = useState<FamilySearchResult | null>(null);
  const [newFamilyName, setNewFamilyName] = useState("");
  const famDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search whenever any field changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const hasInput =
      firstNameQ.trim().length > 0 ||
      lastNameQ.trim().length > 0 ||
      birthDateQ.trim().length > 0;

    if (!hasInput) {
      setResults([]);
      setFamilyResults([]);
      setSearched(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const [dancers, families] = await Promise.all([
        searchDancersByCriteria({
          firstName: firstNameQ.trim() || undefined,
          lastName: lastNameQ.trim() || undefined,
          birthDate: birthDateQ.trim() || undefined,
        }),
        lastNameQ.trim().length >= 2
          ? searchFamilies(lastNameQ.trim())
          : Promise.resolve([]),
      ]);
      setResults(dancers);
      setFamilyResults(families);
      setSearched(true);
      setSearching(false);
    }, 350);
  }, [firstNameQ, lastNameQ, birthDateQ]);

  // Debounced family search (new dancer form)
  useEffect(() => {
    if (famDebounceRef.current) clearTimeout(famDebounceRef.current);
    if (famQuery.trim().length < 2) { setFamResults([]); return; }
    famDebounceRef.current = setTimeout(async () => {
      const res = await searchFamilies(famQuery);
      setFamResults(res);
    }, 300);
  }, [famQuery]);

  // Auto-populate family name from last name
  useEffect(() => {
    if (nd.lastName && !newFamilyName) {
      setNewFamilyName(`${nd.lastName} Family`);
    }
  }, [nd.lastName]);

  async function handleFamilyClick(family: FamilySearchResult) {
    setModalLoading(true);
    const details = await fetchFamilyMembers(family.id);
    setModalFamily(details);
    setModalLoading(false);
  }

  function handleFamilyModalSelect(result: DancerStepResult) {
    setModalFamily(null);
    onNext(result);
  }

  function handleSelectDancer(d: DancerSearchResult) {
    setSelected(d);
    setResults([]);
    setFamilyResults([]);
  }

  function handleClearSelection() {
    setSelected(null);
  }

  function handleNext() {
    if (mode === "search" && selected) {
      onNext({
        dancerId: selected.id,
        dancerName: `${selected.firstName} ${selected.lastName}`,
        familyId: selected.familyId,
        parentUserId: selected.primaryParentId,
        isNewDancer: false,
        newDancer: null,
      });
    } else if (mode === "new") {
      if (!nd.firstName || !nd.lastName) return;
      const resolvedFamilyId =
        familyMode === "existing" ? (selectedFamily?.id ?? null) : null;
      const resolvedFamilyName =
        familyMode === "new"
          ? newFamilyName || `${nd.lastName} Family`
          : (selectedFamily?.familyName ?? null);

      onNext({
        dancerId: null,
        dancerName: `${nd.firstName} ${nd.lastName}`,
        familyId: resolvedFamilyId,
        parentUserId: null,
        isNewDancer: true,
        newDancer: {
          ...nd,
          linkToFamilyId: resolvedFamilyId,
          newFamilyName: familyMode === "new"
            ? (newFamilyName || `${nd.lastName} Family`)
            : (resolvedFamilyName ?? ""),
        },
      });
    }
  }

  const canProceed =
    (mode === "search" && selected !== null) ||
    (mode === "new" && nd.firstName.trim() !== "" && nd.lastName.trim() !== "");

  return (
    <>
      {/* Family select modal */}
      {modalFamily && (
        <FamilySelectModal
          family={modalFamily}
          onSelect={handleFamilyModalSelect}
          onClose={() => setModalFamily(null)}
        />
      )}

      <div className="space-y-6">
        {/* Mode toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setMode("search")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              mode === "search"
                ? "bg-blue-600 text-white"
                : "bg-white border border-gray-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Search className="w-4 h-4" />
            Search existing
          </button>
          <button
            onClick={() => setMode("new")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              mode === "new"
                ? "bg-blue-600 text-white"
                : "bg-white border border-gray-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            <UserPlus className="w-4 h-4" />
            New dancer
          </button>
        </div>

        {/* Search mode */}
        {mode === "search" && (
          <div className="space-y-4">
            {selected ? (
              <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <div className="p-2 bg-blue-100 rounded-full">
                  <User className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-slate-800">
                    {selected.firstName} {selected.lastName}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selected.familyName && `${selected.familyName} · `}
                    {selected.birthDate && `Age ${calcAge(selected.birthDate)} · ${fmtBirthDate(selected.birthDate)}`}
                    {selected.gender && ` · ${selected.gender}`}
                  </p>
                </div>
                <button
                  onClick={handleClearSelection}
                  className="p-1 rounded hover:bg-blue-100 text-slate-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                {/* Split search fields */}
                <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Search criteria
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        First name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Emma"
                        value={firstNameQ}
                        onChange={(e) => setFirstNameQ(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        Last name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Smith"
                        value={lastNameQ}
                        onChange={(e) => setLastNameQ(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        Birth date
                      </label>
                      <input
                        type="date"
                        value={birthDateQ}
                        onChange={(e) => setBirthDateQ(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-slate-400">
                    Fill in any combination — searching by last name also shows matching family accounts.
                  </p>
                </div>

                {searching && (
                  <p className="text-sm text-slate-400 px-1">Searching…</p>
                )}

                {/* Family results */}
                {!searching && familyResults.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5 px-1">
                      Matching families
                    </p>
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      {familyResults.map((f) => (
                        <button
                          key={f.id}
                          onClick={() => handleFamilyClick(f)}
                          disabled={modalLoading}
                          className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-slate-50 border-b border-gray-50 last:border-0 transition"
                        >
                          <div className="p-1.5 bg-slate-100 rounded-full shrink-0">
                            <Users className="w-3.5 h-3.5 text-slate-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-700">
                              {f.familyName ?? "Unnamed family"}
                            </p>
                            {f.primaryParentName && (
                              <p className="text-xs text-slate-400">{f.primaryParentName}</p>
                            )}
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Dancer results */}
                {!searching && results.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5 px-1">
                      Dancers
                    </p>
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      {results.map((d) => (
                        <button
                          key={d.id}
                          onClick={() => handleSelectDancer(d)}
                          className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-slate-50 border-b border-gray-50 last:border-0 transition"
                        >
                          <div className="p-1.5 bg-slate-100 rounded-full shrink-0">
                            <User className="w-3.5 h-3.5 text-slate-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800">
                              {d.firstName} {d.lastName}
                            </p>
                            <p className="text-xs text-slate-400 truncate">
                              {d.familyName && `${d.familyName}`}
                              {d.birthDate && ` · Age ${calcAge(d.birthDate)} (${fmtBirthDate(d.birthDate)})`}
                              {d.grade && ` · Grade ${d.grade}`}
                            </p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {searched && !searching && results.length === 0 && familyResults.length === 0 && (
                  <p className="text-sm text-slate-400 px-1">
                    No results found. Try different criteria or add as a new dancer.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* New dancer mode */}
        {mode === "new" && (
          <div className="space-y-5">
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-slate-700">Dancer info</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    First name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={nd.firstName}
                    onChange={(e) => setNd((s) => ({ ...s, firstName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Last name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={nd.lastName}
                    onChange={(e) => setNd((s) => ({ ...s, lastName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Date of birth
                  </label>
                  <input
                    type="date"
                    value={nd.birthDate}
                    onChange={(e) => setNd((s) => ({ ...s, birthDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Gender
                  </label>
                  <select
                    value={nd.gender}
                    onChange={(e) => setNd((s) => ({ ...s, gender: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="">Select…</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="non-binary">Non-binary</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Grade
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 3rd, K"
                    value={nd.grade}
                    onChange={(e) => setNd((s) => ({ ...s, grade: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Family assignment */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-slate-700">Family</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setFamilyMode("new")}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    familyMode === "new"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  New family
                </button>
                <button
                  onClick={() => setFamilyMode("existing")}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    familyMode === "existing"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  Add to existing family
                </button>
              </div>

              {familyMode === "new" && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Family name
                  </label>
                  <input
                    type="text"
                    value={newFamilyName}
                    onChange={(e) => setNewFamilyName(e.target.value)}
                    placeholder={nd.lastName ? `${nd.lastName} Family` : "e.g. Smith Family"}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              {familyMode === "existing" && (
                <div className="space-y-2">
                  {selectedFamily ? (
                    <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <span className="text-sm text-slate-700 flex-1">
                        {selectedFamily.familyName ?? "Unnamed family"}
                        {selectedFamily.primaryParentName && (
                          <span className="text-slate-400 ml-1">
                            · {selectedFamily.primaryParentName}
                          </span>
                        )}
                      </span>
                      <button
                        onClick={() => { setSelectedFamily(null); setFamQuery(""); }}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        placeholder="Search family name…"
                        value={famQuery}
                        onChange={(e) => setFamQuery(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      {famResults.length > 0 && (
                        <div className="border border-gray-200 rounded-lg overflow-hidden">
                          {famResults.map((f) => (
                            <button
                              key={f.id}
                              onClick={() => {
                                setSelectedFamily(f);
                                setFamResults([]);
                                setFamQuery("");
                              }}
                              className="flex items-center justify-between w-full px-3 py-2 text-left text-sm hover:bg-slate-50 border-b border-gray-50 last:border-0"
                            >
                              <span className="font-medium text-slate-700">
                                {f.familyName ?? "Unnamed family"}
                              </span>
                              {f.primaryParentName && (
                                <span className="text-xs text-slate-400">{f.primaryParentName}</span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Next button */}
        <div className="flex justify-end">
          <button
            onClick={handleNext}
            disabled={!canProceed}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            Continue
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );
}

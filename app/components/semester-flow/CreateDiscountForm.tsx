"use client";

import {
  DiscountCategory,
  DiscountRules,
  EligibleSessionsMode,
  GiveSessionScope,
  RecipientScope,
} from "@/types";
import { useEffect, useState } from "react";
// import { createDiscount } from "../new/discounts/CreateDiscount";
import { getSessions } from "@/queries/admin";
import { createDiscount } from "../../admin/semesters/new/discounts/CreateDiscount";

type Props = {
  onCreated?: () => void;
  onCancel?: () => void;
  sessions?: { id: string; name: string }[] | null;
};

export default function CreateDiscountForm({
  onCreated,
  onCancel,
  sessions,
}: Props) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<DiscountCategory>("multi_person");
  const [giveSessionScope, setGiveSessionScope] =
    useState<GiveSessionScope>("one_session");
  const [recipientScope, setRecipientScope] =
    useState<RecipientScope>("threshold_only");
  const [eligibleSessionsMode, setEligibleSessionsMode] =
    useState<EligibleSessionsMode>("all");

  // const [sessions, setSessions] = useState<
  //   { id: string; title: string }[] | null
  // >([]);

  console.log("CreateDiscountForm rendered with sessions:", sessions);

  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);

  console.log(
    "CreateDiscountForm rendered with selectedSessionIds:",
    selectedSessionIds,
  );

  const [rules, setRules] = useState<DiscountRules[]>([
    {
      threshold: 2,
      value: 0,
      valueType: "flat",
      sessionScope: "one_session",
      recipientScope: "threshold_only",
    },
  ]);

  /* ------------------------------------------------------------------------ */
  /* Load Sessions (if needed)                                                */
  /* ------------------------------------------------------------------------ */

  // useEffect(() => {
  //   if (eligibleSessionsMode !== "selected") return;

  //   let active = true;

  //   async function loadSessions() {
  //     const data = await getSessions();
  //     if (active) setSessions(data);
  //   }

  //   loadSessions();

  //   return () => {
  //     active = false;
  //   };
  // }, [eligibleSessionsMode]);

  /* ------------------------------------------------------------------------ */
  /* Rule Helpers                                                             */
  /* ------------------------------------------------------------------------ */

  function addRule() {
    setRules((prev) => [
      ...prev,
      {
        threshold: prev.length + 2,
        value: 0,
        valueType: "flat",
        sessionScope:
          category === "multi_person"
            ? "one_session"
            : "threshold_session_only",
        recipientScope:
          category === "multi_person" ? "threshold_only" : undefined,
      },
    ]);
  }

  function removeRule(index: number) {
    setRules((prev) => prev.filter((_, i) => i !== index));
  }

  function updateRule<K extends keyof DiscountRules>(
    index: number,
    key: K,
    value: DiscountRules[K],
  ) {
    setRules((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value };
      return next;
    });
  }

  function toggleSession(id: string) {
    setSelectedSessionIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Save Handler                                                             */
  /* ------------------------------------------------------------------------ */

  async function handleSave() {
    console.group("💾 CreateDiscountForm.handleSave");

    try {
      const discountId = await createDiscount({
        name,
        category,
        eligibleSessionsMode,
        giveSessionScope,
        recipientScope,
        rules,
        sessionIds:
          eligibleSessionsMode === "selected" ? selectedSessionIds : [],
      });

      console.log("Returned discountId:", discountId);

      if (discountId) {
        onCreated?.();
      }
    } catch (error) {
      console.error("Failed to create discount.", error);
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Render                                                                   */
  /* ------------------------------------------------------------------------ */

  return (
    <>
      <div
        className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm "
        // onClick={onCancel}
      >
        <div className="space-y-8 inset-0 z-40 bg-white border border-gray-200 rounded-2xl shadow-lg p-6 w-full max-w-lg mx-auto my-16 overflow-auto max-h-140">
          {/* Header */}
          <div>
            <h2 className="text-xl font-semibold text-slate-900">
              Create a Discount
            </h2>
          </div>

          {/* Discount Name */}
          <input
            className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-400"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Discount name"
          />

          {/* Discount Type */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-gray-700">
              Discount type
            </label>

            <div className="space-y-2">
              {(
                [
                  "multi_person",
                  "multi_session",
                  "custom",
                ] as DiscountCategory[]
              ).map((type) => (
                <label
                  key={type}
                  className="flex items-center gap-3 border border-gray-200 rounded-xl p-3 hover:border-gray-300 transition cursor-pointer"
                >
                  <input
                    type="radio"
                    checked={category === type}
                    onChange={() => setCategory(type)}
                    className="h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-800 capitalize">
                    {type.replace("_", " ")}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Eligible Sessions */}
          <div className="space-y-4">
            <label className="text-sm font-medium text-gray-700">
              Eligible sessions
            </label>

            <div className="space-y-2">
              <label className="flex items-center gap-3">
                <input
                  type="radio"
                  checked={eligibleSessionsMode === "all"}
                  onChange={() => setEligibleSessionsMode("all")}
                  className="h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-800">All sessions</span>
              </label>

              <label className="flex items-center gap-3">
                <input
                  type="radio"
                  checked={eligibleSessionsMode === "selected"}
                  onChange={() => setEligibleSessionsMode("selected")}
                  className="h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-800">Selected sessions</span>
              </label>
            </div>

            {eligibleSessionsMode === "selected" && (
              <div className="border border-gray-200 rounded-xl p-4 space-y-3 overflow-scroll h-52">
                <div className="text-sm font-medium text-gray-800">
                  Select sessions
                </div>

                {sessions?.map((session) => (
                  <label
                    key={session.id}
                    className="flex items-center gap-3 text-sm text-gray-700"
                  >
                    <input
                      type="checkbox"
                      checked={selectedSessionIds.includes(session.id)}
                      onChange={() => toggleSession(session.id)}
                      className="h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                    />
                    {session.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Give Discount To */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-gray-700">
              Give discount to
            </label>

            {category === "multi_person" && (
              <div className="flex flex-wrap items-center gap-3">
                <select
                  className="rounded-xl border text-gray-500 border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  value={giveSessionScope}
                  onChange={(e) =>
                    setGiveSessionScope(e.target.value as GiveSessionScope)
                  }
                >
                  <option value="one_session">1 session</option>
                  <option value="all_sessions">All sessions</option>
                </select>

                <span className="text-sm text-gray-600">for</span>

                <select
                  className="rounded-xl border text-gray-500 border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  value={recipientScope}
                  onChange={(e) =>
                    setRecipientScope(e.target.value as RecipientScope)
                  }
                >
                  <option value="threshold_only">
                    the threshold registrant only
                  </option>
                  <option value="threshold_and_additional">
                    threshold + additional registrants
                  </option>
                </select>
              </div>
            )}

            {category === "multi_session" && (
              <select
                className="rounded-xl border border-gray-300 px-3 py-2 text-sm text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                value={giveSessionScope}
                onChange={(e) =>
                  setGiveSessionScope(e.target.value as GiveSessionScope)
                }
              >
                <option value="all_sessions_once_threshold">
                  All sessions once threshold reached
                </option>
                <option value="threshold_session_only">
                  Threshold session only
                </option>
                <option value="threshold_and_additional_sessions">
                  Threshold + additional sessions
                </option>
              </select>
            )}
          </div>

          {/* Rules */}
          <div className="border border-gray-200 rounded-2xl p-6 space-y-6 bg-gray-50">
            <h3 className="text-lg font-semibold text-gray-900">
              Discount rules
            </h3>

            {rules.map((rule, i) => (
              <div
                key={i}
                className="border border-gray-200 bg-white rounded-xl p-4 space-y-4"
              >
                {/* Threshold */}
                <div className="flex flex-wrap items-center gap-3 text-sm text-gray-700">
                  <span>If there are</span>
                  <input
                    type="number"
                    className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    value={rule.threshold}
                    onChange={(e) =>
                      updateRule(i, "threshold", Number(e.target.value))
                    }
                  />
                  <span>
                    {category === "multi_person" ? "persons" : "sessions"}{" "}
                    registered
                  </span>
                </div>

                {/* Value */}
                <div className="flex flex-wrap items-center gap-3 text-sm text-gray-700">
                  <span>Give</span>
                  <input
                    type="number"
                    className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    value={rule.value}
                    onChange={(e) =>
                      updateRule(i, "value", Number(e.target.value))
                    }
                  />
                  <select
                    className="rounded-lg border border-gray-300 px-2 py-1 text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    value={rule.valueType}
                    onChange={(e) =>
                      updateRule(
                        i,
                        "valueType",
                        e.target.value as "flat" | "percent",
                      )
                    }
                  >
                    <option value="flat">dollars off</option>
                    <option value="percent">% off</option>
                  </select>
                </div>

                {rules.length > 1 && (
                  <button
                    type="button"
                    className="text-sm font-medium text-red-600 hover:text-red-700 transition"
                    onClick={() => removeRule(i)}
                  >
                    Remove rule
                  </button>
                )}
              </div>
            ))}

            <button
              type="button"
              onClick={addRule}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-700 transition"
            >
              + Add another rule
            </button>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 rounded-xl text-sm text-slate-700"
            >
              Cancel
            </button>

            <button
              onClick={handleSave}
              className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white text-sm"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

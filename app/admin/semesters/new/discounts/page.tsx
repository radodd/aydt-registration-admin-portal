"use client";

import {
  DiscountCategory,
  DiscountRule,
  EligibleSessionsMode,
  GiveSessionScope,
  RecipientScope,
} from "@/types";
import { useEffect, useState } from "react";
import { createDiscount } from "./CreateDiscount";
import { useRouter } from "next/navigation";
import { getSessions } from "@/queries/admin";

export default function CreateDiscountForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<DiscountCategory>("multi_person");
  const [giveSessionScope, setGiveSessionScope] =
    useState<GiveSessionScope>("one_session");
  const [recipientScope, setRecipientScope] =
    useState<RecipientScope>("threshold_only");
  const [eligibleSessionsMode, setEligibleSessionsMode] =
    useState<EligibleSessionsMode>("all");
  const [sessions, setSessions] = useState<
    { id: string; name: string }[] | null
  >([]);
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  const [rules, setRules] = useState<DiscountRule[]>([
    {
      threshold: 2,
      value: 0,
      valueType: "flat",
      sessionScope: "one_session",
      recipientScope: "threshold_only",
    },
  ]);

  /* ------------------------------------------------------------------------ */
  /* Data loading                                                             */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    if (eligibleSessionsMode !== "selected") return;

    let mounted = true;

    async function loadSessions() {
      const data = await getSessions();
      if (mounted) setSessions(data);
    }

    loadSessions();

    return () => {
      mounted = false;
    };
  }, [eligibleSessionsMode]);

  /* ------------------------------------------------------------------------ */
  /* Helpers                                                             */
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

  function updateRule<K extends keyof DiscountRule>(
    index: number,
    key: K,
    value: DiscountRule[K],
  ) {
    setRules((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value };
      return next;
    });
  }

  /* ------------------------------------------------------------------------ */
  /* Handlers                                                             */
  /* ------------------------------------------------------------------------ */

  async function handleSave() {
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
      if (discountId) {
        router.replace("/admin/semesters/new?step=discounts");
      }
    } catch (error) {
      console.error("Failed to create discount.", error);
      alert("Failed to create discount. See console for details.");
    }
  }

  function toggleSession(id: string) {
    setSelectedSessionIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  /* -------------------------------------------------------------------------- */
  /* Render                                                                     */
  /* -------------------------------------------------------------------------- */

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 space-y-10">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 tracking-tight">
            Create a Discount
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Configure eligibility and rule logic for this discount.
          </p>
        </div>

        {/* Discount Name */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">
            Discount name
          </label>
          <input
            className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {/* Discount Type */}
        <div className="space-y-3">
          <label className="text-sm font-medium text-gray-700">
            Discount type
          </label>

          <div className="space-y-2">
            {(
              ["multi_person", "multi_session", "custom"] as DiscountCategory[]
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
            <div className="border border-gray-200 rounded-xl p-4 space-y-3">
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
              className="rounded-xl border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
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
                  className="w-20 rounded-lg border border-gray-300 px-2 py-1 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
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
                  className="w-24 rounded-lg border border-gray-300 px-2 py-1 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  value={rule.value}
                  onChange={(e) =>
                    updateRule(i, "value", Number(e.target.value))
                  }
                />
                <select
                  className="rounded-lg border border-gray-300 px-2 py-1 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
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

        {/* Save Actions */}
        <div className="flex justify-end gap-3">
          <button className="px-4 py-2 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
            Cancel
          </button>

          <button
            className="px-6 py-2.5 rounded-xl bg-indigo-600 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition"
            onClick={handleSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

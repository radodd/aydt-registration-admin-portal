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
    <div className="max-w-3xl space-y-6 text-slate-700">
      <h2 className="text-xl font-semibold">Create a Discount</h2>

      {/* Discount Name */}
      <div>
        <label className="block font-medium">Discount name</label>
        <input
          className="border p-2 w-full"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      {/* Discount Type */}
      <div>
        <label className="block font-medium">Discount type</label>
        {(
          ["multi_person", "multi_session", "custom"] as DiscountCategory[]
        ).map((type) => (
          <label key={type} className="block">
            <input
              type="radio"
              checked={category === type}
              onChange={() => setCategory(type)}
            />{" "}
            {type.replace("_", " ")}
          </label>
        ))}
      </div>

      {/* Eligible Sessions */}
      <div>
        <label className="block font-medium">Eligible sessions</label>
        <label>
          <input
            type="radio"
            checked={eligibleSessionsMode === "all"}
            onChange={() => setEligibleSessionsMode("all")}
          />{" "}
          All sessions
        </label>
        <label className="ml-4">
          <input
            type="radio"
            checked={eligibleSessionsMode === "selected"}
            onChange={() => setEligibleSessionsMode("selected")}
          />{" "}
          Selected sessions
        </label>
        {eligibleSessionsMode === "selected" && (
          <div className="border p-3 space-y-2">
            <div className="font-medium">Select sessions</div>

            {sessions?.map((session) => (
              <label key={session.id} className="block">
                <input
                  type="checkbox"
                  checked={selectedSessionIds.includes(session.id)}
                  onChange={() => {
                    toggleSession(session.id);
                  }}
                />{" "}
                {session.name}
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Give Discount To (discount-level) */}
      <div className="space-y-2">
        <label className="block font-medium">Give discount to</label>

        {category === "multi_person" && (
          <div className="flex items-center gap-2 flex-wrap">
            <select
              className="border p-1"
              value={giveSessionScope}
              onChange={(e) =>
                setGiveSessionScope(e.target.value as GiveSessionScope)
              }
            >
              <option value="one_session">1 session</option>
              <option value="all_sessions">All sessions</option>
            </select>

            <span>for</span>

            <select
              className="border p-1"
              value={recipientScope}
              onChange={(e) =>
                setRecipientScope(e.target.value as RecipientScope)
              }
            >
              <option value="threshold_only">
                the threshold registrant only
              </option>
              <option value="threshold_and_additional">
                the threshold registrant and all additional
              </option>
            </select>
          </div>
        )}

        {category === "multi_session" && (
          <select
            className="border p-1"
            value={giveSessionScope}
            onChange={(e) =>
              setGiveSessionScope(e.target.value as GiveSessionScope)
            }
          >
            <option value="all_sessions_once_threshold">
              all sessions once the threshold is reached
            </option>
            <option value="threshold_session_only">
              the threshold session only
            </option>
            <option value="threshold_and_additional_sessions">
              the threshold session and all additional sessions
            </option>
          </select>
        )}
      </div>

      {/* Rules */}
      <div className="border p-4 space-y-4">
        <h3 className="font-semibold">Discount rules</h3>

        {rules.map((rule, i) => (
          <div key={i} className="border p-3 space-y-3">
            {/* Threshold */}
            <div className="flex items-center gap-2">
              <span>If there are</span>
              <input
                type="number"
                className="border p-1 w-16"
                value={rule.threshold}
                onChange={(e) => {
                  updateRule(i, "threshold", Number(e.target.value));
                }}
              />
              <span>
                {category === "multi_person" ? "persons" : "sessions"}{" "}
                registered
              </span>
            </div>

            {/* Discount Value */}
            <div className="flex items-center gap-2">
              <span>Give</span>
              <input
                type="number"
                className="border p-1 w-24"
                value={rule.value}
                onChange={(e) => {
                  updateRule(i, "value", Number(e.target.value));
                }}
              />
              <select
                className="border p-1"
                value={rule.valueType}
                onChange={(e) => {
                  updateRule(
                    i,
                    "valueType",
                    e.target.value as "flat" | "percent",
                  );
                }}
              >
                <option value="flat">dollars off</option>
                <option value="percent">% off</option>
              </select>
            </div>

            {/* Remove Rule */}
            {rules.length > 1 && (
              <button
                type="button"
                className="text-red-600 text-sm underline"
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
          className="text-blue-600 underline"
        >
          + Add another rule
        </button>
      </div>

      {/* Save */}
      <div className="flex justify-end gap-2">
        <button className="border px-4 py-2">Cancel</button>
        <button
          className="bg-blue-600 text-white px-4 py-2"
          onClick={handleSave}
        >
          Save
        </button>
      </div>
    </div>
  );
}

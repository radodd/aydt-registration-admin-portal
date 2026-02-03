"use client";

import { DiscountCategory, DiscountRule } from "@/types";
import { useState } from "react";

export default function CreateDiscountForm() {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<DiscountCategory>("multi_person");
  const [giveSessionScope, setGiveSessionScope] = useState<
    | "one_session"
    | "all_sessions"
    | "all_sessions_once_threshold"
    | "threshold_session_only"
    | "threshold_and_additional_sessions"
  >("one_session");

  const [recipientScope, setRecipientScope] = useState<
    "threshold_only" | "threshold_and_additional"
  >("threshold_only");

  const [eligibleSessionsMode, setEligibleSessionsMode] = useState<
    "all" | "selected"
  >("all");

  const [rules, setRules] = useState<DiscountRule[]>([
    {
      threshold: 2,
      value: 0,
      valueType: "flat",
      sessionScope: "one_session",
      recipientScope: "threshold_only",
    },
  ]);

  function addRule() {
    setRules([
      ...rules,
      {
        threshold: rules.length + 2,
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
    setRules(rules.filter((_, i) => i !== index));
  }

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
        ).map((t) => (
          <label key={t} className="block">
            <input
              type="radio"
              checked={category === t}
              onChange={() => setCategory(t)}
            />{" "}
            {t.replace("_", " ")}
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
      </div>

      {/* Give Discount To (discount-level) */}
      <div className="space-y-2">
        <label className="block font-medium">Give discount to</label>

        {category === "multi_person" && (
          <div className="flex items-center gap-2 flex-wrap">
            <select
              className="border p-1"
              value={giveSessionScope}
              onChange={(e) => setGiveSessionScope(e.target.value as any)}
            >
              <option value="one_session">1 session</option>
              <option value="all_sessions">All sessions</option>
            </select>

            <span>for</span>

            <select
              className="border p-1"
              value={recipientScope}
              onChange={(e) => setRecipientScope(e.target.value as any)}
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
            onChange={(e) => setGiveSessionScope(e.target.value as any)}
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
                  const next = [...rules];
                  next[i].threshold = Number(e.target.value);
                  setRules(next);
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
                  const next = [...rules];
                  next[i].value = Number(e.target.value);
                  setRules(next);
                }}
              />
              <select
                className="border p-1"
                value={rule.valueType}
                onChange={(e) => {
                  const next = [...rules];
                  next[i].valueType = e.target.value as any;
                  setRules(next);
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
        <button className="bg-blue-600 text-white px-4 py-2">Save</button>
      </div>
    </div>
  );
}

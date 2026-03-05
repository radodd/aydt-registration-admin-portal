"use client";

import { mapSemesterToDraft } from "@/utils/mapSemesterToDraft";
import SemesterTabs from "../SemesterTabs";

type Props = {
  semester: any;
};

export default function SemesterDetailTabs({ semester }: Props) {
  const draft = mapSemesterToDraft(semester);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      <SemesterTabs data={draft} />
    </div>
  );
}

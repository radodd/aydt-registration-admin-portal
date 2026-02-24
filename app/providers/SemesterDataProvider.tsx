"use client";

import { createContext, useContext } from "react";
import type { DataMode, PublicSemester } from "@/types/public";

/* -------------------------------------------------------------------------- */
/* Context                                                                     */
/* -------------------------------------------------------------------------- */

interface SemesterDataContextValue {
  semester: PublicSemester;
  mode: DataMode;
}

const SemesterDataContext = createContext<SemesterDataContextValue | null>(
  null,
);

/* -------------------------------------------------------------------------- */
/* Provider                                                                    */
/*                                                                             */
/* Data is fetched server-side by the parent Server Component (page.tsx) and  */
/* passed in as `semester`. This provider distributes it via context to all   */
/* descendant client components without prop drilling.                        */
/* -------------------------------------------------------------------------- */

interface SemesterDataProviderProps {
  semester: PublicSemester;
  mode: DataMode;
  children: React.ReactNode;
}

export function SemesterDataProvider({
  semester,
  mode,
  children,
}: SemesterDataProviderProps) {
  return (
    <SemesterDataContext.Provider value={{ semester, mode }}>
      {children}
    </SemesterDataContext.Provider>
  );
}

/* -------------------------------------------------------------------------- */
/* Hook                                                                        */
/* -------------------------------------------------------------------------- */

export function useSemesterData(): SemesterDataContextValue {
  const ctx = useContext(SemesterDataContext);
  if (!ctx) {
    throw new Error(
      "useSemesterData must be used inside <SemesterDataProvider>",
    );
  }
  return ctx;
}

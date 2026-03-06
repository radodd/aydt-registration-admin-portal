import { notFound } from "next/navigation";
import { getSemesterForDisplay } from "@/app/actions/getSemesterForDisplay";
import { SemesterDataProvider } from "@/app/providers/SemesterDataProvider";
import { CartPageContent } from "@/app/(user-facing)/cart/CartPageContent";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PreviewCartPage({ params }: Props) {
  const { id } = await params;

  let semester;
  try {
    semester = await getSemesterForDisplay(id, "preview");
  } catch {
    notFound();
  }

  return (
    // SemesterDataProvider makes semester data available to CartDrawer if rendered here.
    // CartProvider is provided by the preview layout (shared across all preview pages).
    <SemesterDataProvider semester={semester} mode="preview">
      <CartPageContent />
    </SemesterDataProvider>
  );
}

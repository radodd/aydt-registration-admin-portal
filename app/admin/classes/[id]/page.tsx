import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ClassDetailPage({ params }: PageProps) {
  const { id } = await params;
  redirect(`/admin/classes?id=${id}`);
}

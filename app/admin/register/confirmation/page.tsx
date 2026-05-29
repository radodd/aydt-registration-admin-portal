import AdminInstallmentConfirmation from "./AdminInstallmentConfirmation";

type Props = {
  searchParams: Promise<{ batch?: string; dancer?: string; semester?: string }>;
};

/**
 * Return landing for the admin installment hosted-page redirect (#7). The EPG
 * webhook confirms the order asynchronously, so this page polls the batch status
 * and shows confirmed / still-processing / needs-attention to the super-admin
 * who set the plan up.
 */
export default async function AdminInstallmentConfirmationPage({ searchParams }: Props) {
  const { batch, dancer } = await searchParams;

  return (
    <div className="max-w-xl mx-auto p-6">
      <AdminInstallmentConfirmation batchId={batch ?? null} dancerId={dancer ?? null} />
    </div>
  );
}

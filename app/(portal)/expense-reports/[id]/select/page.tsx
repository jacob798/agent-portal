import { redirect } from "next/navigation";

/** The item picker is now part of the report workspace at /expense-reports/[id].
 *  This route is kept only so old links redirect there (preserving any date filter). */
export default async function SelectRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { id } = await params;
  const { from, to } = await searchParams;
  const q = new URLSearchParams();
  if (from) q.set("from", from);
  if (to) q.set("to", to);
  const qs = q.toString();
  redirect(`/expense-reports/${id}${qs ? `?${qs}` : ""}`);
}

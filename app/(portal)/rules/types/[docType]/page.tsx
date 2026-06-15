import { getDocTypeDetail } from "@/lib/data/rules";
import DocTypeDetail from "@/components/rules/DocTypeDetail";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DocTypePage({ params }: { params: Promise<{ docType: string }> }) {
  const { docType } = await params;
  const detail = await getDocTypeDetail(decodeURIComponent(docType));
  if (!detail) notFound();
  return <DocTypeDetail detail={detail} />;
}

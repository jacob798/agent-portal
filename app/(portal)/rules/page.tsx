import { getLearningStats, getFailureReport, getLearnedItems, getDocTypeCatalog, getKnowledgeVendors } from "@/lib/data/rules";
import Rules from "@/components/rules/Rules";

export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const [stats, report, learned, catalog, vendors] = await Promise.all([
    getLearningStats(), getFailureReport(), getLearnedItems(), getDocTypeCatalog(), getKnowledgeVendors(),
  ]);
  return <Rules stats={stats} report={report} learned={learned} catalog={catalog} vendors={vendors} />;
}

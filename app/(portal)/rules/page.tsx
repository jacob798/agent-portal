import { getLearningStats, getFailureReport, getLearnedItems, getRouting, getKnowledgeVendors } from "@/lib/data/rules";
import Rules from "@/components/rules/Rules";

export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const [stats, report, learned, routing, vendors] = await Promise.all([
    getLearningStats(), getFailureReport(), getLearnedItems(), getRouting(), getKnowledgeVendors(),
  ]);
  return <Rules stats={stats} report={report} learned={learned} routing={routing} vendors={vendors} />;
}

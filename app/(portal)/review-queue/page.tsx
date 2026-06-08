import { getReviewItems } from "@/lib/data/review";
import ReviewQueue from "@/components/review/ReviewQueue";
import PageHeader from "@/components/ui/PageHeader";

export default async function ReviewQueuePage() {
  const items = await getReviewItems();

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <PageHeader
        title="Review Queue"
        subtitle="Items across all agents that need an operator decision."
      />
      <div className="mt-6">
        <ReviewQueue initial={items} />
      </div>
    </div>
  );
}

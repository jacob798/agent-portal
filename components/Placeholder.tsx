import { Construction } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";

/** "Not built yet" body for routes that are scaffolded but empty. */
export default function Placeholder({
  title,
  note,
}: {
  title: string;
  note: string;
}) {
  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <PageHeader title={title} />
      <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-10 py-16 text-center">
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <Construction className="h-6 w-6" strokeWidth={1.75} />
        </span>
        <p className="max-w-sm text-sm text-slate-500">{note}</p>
        <span className="mt-4 text-xs font-medium uppercase tracking-wider text-slate-400">
          Coming soon
        </span>
      </div>
    </div>
  );
}

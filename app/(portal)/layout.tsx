import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";

/** Authenticated shell: sidebar + context bar + scrollable content.
 *  Login/auth routes sit outside this group, so they render without it. */
export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

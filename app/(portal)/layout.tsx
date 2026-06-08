import Sidebar from "@/components/Sidebar";

/** Authenticated shell: sidebar + main content. Login/auth routes sit
 *  outside this group, so they render without the shell. */
export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}

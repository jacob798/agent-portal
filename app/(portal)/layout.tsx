import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { getProfile } from "@/lib/auth/profile";
import { roleLabel } from "@/lib/auth/roles";

/** Authenticated shell: sidebar + context bar + scrollable content.
 *  Login/auth routes sit outside this group, so they render without it. */
export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getProfile();
  const user = profile
    ? {
        displayName: profile.displayName,
        email: profile.email,
        roleLabel: roleLabel(profile.role),
      }
    : null;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar user={user} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

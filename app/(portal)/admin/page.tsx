// Operator data — render fresh so a change shows on the next screen without lag.
export const dynamic = "force-dynamic";

import PageHeader from "@/components/ui/PageHeader";
import UserTable from "@/components/admin/UserTable";
import { getProfile, getProfiles } from "@/lib/auth/profile";

export default async function AdminPage() {
  // Access is already gated by app/(portal)/admin/layout.tsx (manage_users).
  const [me, users] = await Promise.all([getProfile(), getProfiles()]);

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <PageHeader
        title="User Management"
        subtitle="Assign portal roles. Admins manage users; operators act; viewers read."
      />
      <div className="mt-6">
        <UserTable initial={users} currentUserId={me?.id ?? ""} />
      </div>
    </div>
  );
}

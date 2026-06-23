// Operator data — render fresh so a change shows on the next screen without lag.
export const dynamic = "force-dynamic";

import PageHeader from "@/components/ui/PageHeader";
import AccessManager from "@/components/admin/AccessManager";
import { getProfile, getProfiles } from "@/lib/auth/profile";
import { getAllModuleGrants } from "@/lib/auth/moduleGrants";
import { getPendingInvitations } from "@/lib/auth/provisioning";
import { grantableModules } from "@/lib/auth/modules";

export default async function AdminPage() {
  // Access is already gated by app/(portal)/admin/layout.tsx (manage_users).
  const [me, users, grants, invites] = await Promise.all([
    getProfile(),
    getProfiles(),
    getAllModuleGrants(),
    getPendingInvitations(),
  ]);

  const rows = users.map((u) => ({
    id: u.id,
    displayName: u.displayName,
    email: u.email,
    role: u.role,
    modules: [...(grants.get(u.id) ?? new Set<string>())],
  }));

  const modules = grantableModules().map((m) => ({
    key: m.key,
    label: m.label,
    section: m.section,
  }));

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <PageHeader
        title="User Management"
        subtitle="Assign portal roles and per-user module access. Admins manage users; the role sets what a user can do, the module grants set what they can see."
      />
      <div className="mt-6">
        <AccessManager
          initial={rows}
          currentUserId={me?.id ?? ""}
          modules={modules}
          invites={invites}
        />
      </div>
    </div>
  );
}

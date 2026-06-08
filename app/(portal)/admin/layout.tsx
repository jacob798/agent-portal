import { requireCapability } from "@/lib/auth/guard";

/** Gate the entire /admin section to users with the manage_users capability. */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireCapability("manage_users");
  return <>{children}</>;
}

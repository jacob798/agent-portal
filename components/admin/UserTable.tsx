"use client";

import { useState, useTransition } from "react";
import { ROLES, type Role } from "@/lib/auth/roles";
import { updateUserRole } from "@/app/(portal)/admin/actions";

interface Row {
  id: string;
  displayName: string;
  email: string;
  role: Role;
}

export default function UserTable({
  initial,
  currentUserId,
}: {
  initial: Row[];
  currentUserId: string;
}) {
  const [rows, setRows] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function changeRole(id: string, role: Role) {
    const prev = rows;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, role } : r)));
    setError(null);
    startTransition(async () => {
      const res = await updateUserRole(id, role);
      if (!res.ok) {
        setRows(prev); // revert
        setError(res.error ?? "Failed to update role.");
      }
    });
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
            <th className="px-5 py-3">User</th>
            <th className="px-5 py-3">Email</th>
            <th className="px-5 py-3">Role</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className={i > 0 ? "border-t border-slate-100" : ""}>
              <td className="px-5 py-3">
                <span className="font-medium text-slate-900">
                  {r.displayName}
                </span>
                {r.id === currentUserId && (
                  <span className="ml-2 text-xs text-slate-400">(you)</span>
                )}
              </td>
              <td className="px-5 py-3 text-slate-500">{r.email}</td>
              <td className="px-5 py-3">
                <select
                  value={r.role}
                  disabled={pending || r.id === currentUserId}
                  onChange={(e) => changeRole(r.id, e.target.value as Role)}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 capitalize transition hover:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role} className="capitalize">
                      {role}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && (
        <p className="border-t border-slate-100 px-5 py-3 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

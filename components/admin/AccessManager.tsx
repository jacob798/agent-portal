"use client";

import { useState, useTransition } from "react";
import { ChevronDown, Check, Mail, X } from "lucide-react";
import { ROLES, roleLabel, type Role } from "@/lib/auth/roles";
import {
  updateUserRole,
  setUserModules,
  inviteUser,
  revokeInvite,
} from "@/app/(portal)/admin/actions";

interface ModuleOpt {
  key: string;
  label: string;
  section: string;
}
interface UserRow {
  id: string;
  displayName: string;
  email: string;
  role: Role;
  modules: string[];
}
interface Invite {
  email: string;
  role: Role;
  modules: string[];
  invitedAt: string;
}

const SECTIONS = ["Operations", "Agents", "Settings"] as const;

function ModuleChecklist({
  modules,
  selected,
  onToggle,
  disabled,
}: {
  modules: ModuleOpt[];
  selected: Set<string>;
  onToggle: (key: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
      {SECTIONS.map((section) => {
        const items = modules.filter((m) => m.section === section);
        if (!items.length) return null;
        return (
          <div key={section}>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {section}
            </p>
            <div className="space-y-1.5">
              {items.map((m) => (
                <label
                  key={m.key}
                  className="flex cursor-pointer items-center gap-2 text-sm text-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(m.key)}
                    disabled={disabled}
                    onChange={() => onToggle(m.key)}
                    className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
                  />
                  {m.label}
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function UserCard({
  row,
  modules,
  isSelf,
  onSaved,
}: {
  row: UserRow;
  modules: ModuleOpt[];
  isSelf: boolean;
  onSaved: (next: UserRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role>(row.role);
  const [selected, setSelected] = useState<Set<string>>(new Set(row.modules));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const isAdmin = role === "admin";
  const dirty =
    role !== row.role ||
    selected.size !== row.modules.length ||
    row.modules.some((m) => !selected.has(m));

  function toggle(key: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      if (role !== row.role && !isSelf) {
        const r = await updateUserRole(row.id, role);
        if (!r.ok) {
          setError(r.error ?? "Failed to update role.");
          return;
        }
      }
      const m = await setUserModules(row.id, [...selected]);
      if (!m.ok) {
        setError(m.error ?? "Failed to update modules.");
        return;
      }
      setSaved(true);
      onSaved({ ...row, role, modules: [...selected] });
    });
  }

  return (
    <div className="border-t border-slate-100 first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-4 px-5 py-3 text-left hover:bg-slate-50"
      >
        <div className="min-w-0 flex-1">
          <span className="font-medium text-slate-900">{row.displayName}</span>
          {isSelf && <span className="ml-2 text-xs text-slate-400">(you)</span>}
          <span className="ml-2 text-sm text-slate-400">{row.email}</span>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium capitalize text-slate-600">
          {roleLabel(row.role)}
        </span>
        <span className="text-xs text-slate-400">
          {row.role === "admin"
            ? "all modules"
            : `${row.modules.length} module${row.modules.length === 1 ? "" : "s"}`}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-slate-400 transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="space-y-4 bg-slate-50/60 px-5 py-4">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-slate-600">Role</label>
            <select
              value={role}
              disabled={pending || isSelf}
              onChange={(e) => setRole(e.target.value as Role)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium capitalize text-slate-700 disabled:bg-slate-100 disabled:text-slate-400"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </select>
            {isSelf && (
              <span className="text-xs text-slate-400">
                You can&apos;t change your own role.
              </span>
            )}
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-slate-600">
              Module access
            </p>
            {isAdmin ? (
              <p className="text-sm text-slate-500">
                Admins have access to every module implicitly.
              </p>
            ) : (
              <ModuleChecklist
                modules={modules}
                selected={selected}
                onToggle={toggle}
                disabled={pending}
              />
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={pending || !dirty}
              className="rounded-lg bg-brand px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-brand-navy disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save changes"}
            </button>
            {saved && !dirty && (
              <span className="flex items-center gap-1 text-sm text-emerald-600">
                <Check className="h-4 w-4" /> Saved
              </span>
            )}
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function InviteForm({
  modules,
  onInvited,
}: {
  modules: ModuleOpt[];
  onInvited: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("operator");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function toggle(key: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }

  function submit() {
    setError(null);
    setDone(null);
    startTransition(async () => {
      const r = await inviteUser(email, role, [...selected]);
      if (!r.ok) {
        setError(r.error ?? "Failed to invite.");
        return;
      }
      setDone(email.trim().toLowerCase());
      setEmail("");
      setSelected(new Set());
      onInvited();
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Mail className="h-4 w-4 text-brand" /> Invite a user
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        Pre-assigns a role + modules by email. The grant applies on their first
        Microsoft sign-in. (Creating the Microsoft account itself is done in Entra.)
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="person@foundry-capital.co"
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-brand focus:ring-brand"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Role
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium capitalize text-slate-700"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
        </div>
      </div>
      {role !== "admin" && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-slate-500">Modules</p>
          <ModuleChecklist
            modules={modules}
            selected={selected}
            onToggle={toggle}
            disabled={pending}
          />
        </div>
      )}
      {role === "admin" && (
        <p className="mt-3 text-xs text-slate-500">
          Admins get every module implicitly.
        </p>
      )}
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending || !email.trim()}
          className="rounded-lg bg-brand px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-brand-navy disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send invite"}
        </button>
        {done && (
          <span className="flex items-center gap-1 text-sm text-emerald-600">
            <Check className="h-4 w-4" /> Invited {done}
          </span>
        )}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}

export default function AccessManager({
  initial,
  currentUserId,
  modules,
  invites,
}: {
  initial: UserRow[];
  currentUserId: string;
  modules: ModuleOpt[];
  invites: Invite[];
}) {
  const [rows, setRows] = useState(initial);
  const [pendingInvites, setPendingInvites] = useState(invites);
  const [, startTransition] = useTransition();

  function onSaved(next: UserRow) {
    setRows((rs) => rs.map((r) => (r.id === next.id ? next : r)));
  }

  function onRevoke(email: string) {
    setPendingInvites((inv) => inv.filter((i) => i.email !== email));
    startTransition(async () => {
      await revokeInvite(email);
    });
  }

  return (
    <div className="space-y-8">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {rows.map((r) => (
          <UserCard
            key={r.id}
            row={r}
            modules={modules}
            isSelf={r.id === currentUserId}
            onSaved={onSaved}
          />
        ))}
        {!rows.length && (
          <p className="px-5 py-6 text-sm text-slate-400">No users yet.</p>
        )}
      </div>

      {pendingInvites.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">
            Pending invitations
          </h2>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {pendingInvites.map((inv) => (
              <div
                key={inv.email}
                className="flex items-center gap-4 border-t border-slate-100 px-5 py-3 first:border-t-0"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                  {inv.email}
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium capitalize text-slate-600">
                  {roleLabel(inv.role)}
                </span>
                <span className="text-xs text-slate-400">
                  {inv.role === "admin"
                    ? "all modules"
                    : `${inv.modules.length} module${inv.modules.length === 1 ? "" : "s"}`}
                </span>
                <button
                  type="button"
                  onClick={() => onRevoke(inv.email)}
                  title="Revoke invite"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <InviteForm
        modules={modules}
        onInvited={() => {
          // Re-fetch happens via revalidatePath on next navigation; optimistic
          // note only. Keep it simple — the list refreshes on reload.
        }}
      />
    </div>
  );
}

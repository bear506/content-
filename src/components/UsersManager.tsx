import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Trash2, ShieldCheck, Eye, EyeOff, Users as UsersIcon, Key, Check, X } from "lucide-react";
import { authApi, ManagedUser, Role } from "../lib/api";
import { ConfirmDialog } from "./ConfirmDialog";
import { useToast } from "./Toast";

interface UsersManagerProps {
  currentUserId?: string;
}

const ROLE_OPTIONS: Role[] = ["admin", "editor", "viewer"];

export const UsersManager: React.FC<UsersManagerProps> = ({ currentUserId }) => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const usersQuery = useQuery({ queryKey: ["users"], queryFn: authApi.listUsers });

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<Role>("editor");
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null);

  const [resetTargetId, setResetTargetId] = useState<string | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () => authApi.createUser(username.trim(), password, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setUsername("");
      setPassword("");
      setRole("editor");
      setFormError(null);
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { role?: Role; isActive?: boolean } }) => authApi.updateUser(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => authApi.deleteUser(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, newPassword }: { id: string; newPassword: string }) => authApi.resetUserPassword(id, newPassword),
    onSuccess: (_data, { id }) => {
      const u = users.find((x) => x.id === id);
      toast.success(`Password reset for "${u?.username || "user"}".`);
      setResetTargetId(null);
      setNewPasswordInput("");
      setResetError(null);
    },
    onError: (err: Error) => setResetError(err.message),
  });

  const handleStartReset = (id: string) => {
    setResetTargetId(id);
    setNewPasswordInput("");
    setResetError(null);
  };

  const handleConfirmReset = () => {
    if (!resetTargetId) return;
    if (newPasswordInput.length < 8) {
      setResetError("New password must be at least 8 characters.");
      return;
    }
    resetPasswordMutation.mutate({ id: resetTargetId, newPassword: newPasswordInput });
  };

  const users: ManagedUser[] = usersQuery.data || [];

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!username.trim() || password.length < 8) {
      setFormError("Username and a password of at least 8 characters are required.");
      return;
    }
    createMutation.mutate();
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl text-slate-100">
      <div className="flex items-center gap-3 p-6 border-b border-slate-800">
        <div className="bg-slate-800 p-2.5 rounded-xl border border-slate-700 text-slate-200">
          <UsersIcon className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">Team Accounts</h2>
          <p className="text-xs text-slate-400">Create and manage individual named accounts and their roles.</p>
        </div>
      </div>

      <div className="p-6 space-y-6 bg-slate-950/40">
        {/* Add User Form */}
        <form onSubmit={handleCreate} className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3 shadow-xs">
          <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
            <UserPlus className="w-4 h-4 text-slate-300" />
            Add Team Member
          </h4>

          {formError && (
            <div className="p-2.5 bg-rose-950/50 border border-rose-800/60 rounded-lg text-xs text-rose-300 font-medium">{formError}</div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[10px] text-slate-300 mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. sarah"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[10px] text-slate-300 mb-1">Password (min. 8 characters)</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Choose a password"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 pr-8 text-xs text-white focus:outline-none focus:border-amber-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-[10px] text-slate-300 mb-1">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-amber-500 cursor-pointer"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="w-full px-3 py-1.5 text-xs font-bold bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 rounded-lg shadow-xs disabled:opacity-50"
              >
                {createMutation.isPending ? "Creating..." : "Create Account"}
              </button>
            </div>
          </div>
        </form>

        {/* Users Table */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-2xs">
          <table className="w-full text-left text-xs text-slate-200">
            <thead className="bg-slate-950/60 text-slate-400 text-[10px] uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {users.map((u) => (
                <React.Fragment key={u.id}>
                <tr className="hover:bg-slate-800/40">
                  <td className="px-4 py-3 font-bold text-white flex items-center gap-1.5">
                    {u.username}
                    {u.id === currentUserId && (
                      <span className="text-[9px] font-mono bg-slate-800 text-slate-300 border border-slate-700 px-1.5 py-0.2 rounded">you</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      disabled={u.id === currentUserId}
                      onChange={(e) => updateMutation.mutate({ id: u.id, patch: { role: e.target.value as Role } })}
                      className="bg-slate-950 border border-slate-700 text-white rounded px-2 py-1 text-[11px] font-bold disabled:opacity-50"
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => updateMutation.mutate({ id: u.id, patch: { isActive: !u.isActive } })}
                      disabled={u.id === currentUserId}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 disabled:opacity-50 ${
                        u.isActive
                          ? "bg-emerald-950/50 text-emerald-300 border border-emerald-800/60"
                          : "bg-slate-800 text-slate-400 border border-slate-700"
                      }`}
                    >
                      {u.isActive ? <ShieldCheck className="w-3 h-3" /> : null}
                      {u.isActive ? "Active" : "Deactivated"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-slate-500 font-mono text-[10px]">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleStartReset(u.id)}
                        className="p-1.5 text-slate-400 hover:text-amber-400 rounded-lg hover:bg-slate-800"
                        title="Reset password"
                      >
                        <Key className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(u)}
                        disabled={u.id === currentUserId}
                        className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 disabled:opacity-30 disabled:hover:text-slate-400"
                        title="Delete account"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
                {resetTargetId === u.id && (
                  <tr className="bg-slate-950/60">
                    <td colSpan={5} className="px-4 py-3">
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="flex-1 min-w-[220px]">
                          <label className="block text-[10px] text-slate-300 mb-1">
                            New password for "{u.username}" (min. 8 characters)
                          </label>
                          <div className="relative">
                            <input
                              type={showNewPassword ? "text" : "password"}
                              autoFocus
                              value={newPasswordInput}
                              onChange={(e) => setNewPasswordInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleConfirmReset();
                                if (e.key === "Escape") setResetTargetId(null);
                              }}
                              placeholder="Choose a new password"
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 pr-8 text-xs text-white focus:outline-none focus:border-amber-500"
                            />
                            <button
                              type="button"
                              onClick={() => setShowNewPassword(!showNewPassword)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                            >
                              {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={resetPasswordMutation.isPending}
                          onClick={handleConfirmReset}
                          className="px-3 py-1.5 text-xs font-bold bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 rounded-lg shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>{resetPasswordMutation.isPending ? "Saving..." : "Save"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setResetTargetId(null)}
                          className="px-3 py-1.5 text-xs font-bold text-slate-300 hover:text-white bg-slate-900 border border-slate-700 rounded-lg flex items-center gap-1.5"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Cancel</span>
                        </button>
                      </div>
                      {resetError && <p className="text-[11px] text-rose-400 mt-1.5">{resetError}</p>}
                    </td>
                  </tr>
                )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete this account?"
        message={deleteTarget ? `"${deleteTarget.username}" will lose access immediately and be permanently removed. This cannot be undone.` : ""}
        confirmLabel="Delete Account"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
};

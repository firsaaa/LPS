"use client";

import { useState, useEffect } from "react";
import { Plus, Loader2, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { GLOBAL_ROLE_LABELS } from "@/types";
import { formatDate, parseErrorMessage } from "@/lib/utils";
import type { GlobalRole } from "@/types";

const GLOBAL_ROLES: GlobalRole[] = ["SUPERADMIN", "INSPECTOR"];

export function UsersClient() {
  const { toast } = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "", email: "", password: "",
    globalRole: "" as GlobalRole | "",
    canLeadProject: false,
  });

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      if (res.ok) setUsers(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditUser(null);
    setForm({ name: "", email: "", password: "", globalRole: "", canLeadProject: false });
    setDialogOpen(true);
  }

  function openEdit(u: any) {
    setEditUser(u);
    setForm({ name: u.name, email: u.email, password: "", globalRole: u.globalRole ?? "", canLeadProject: u.canLeadProject ?? false });
    setDialogOpen(true);
  }

  async function submit() {
    setSubmitting(true);
    try {
      const payload: any = {
        name: form.name,
        globalRole: form.globalRole || null,
        canLeadProject: form.canLeadProject,
      };
      if (!editUser) {
        if (!form.email || !form.password) {
          toast({ title: "Lengkapi semua field", variant: "destructive" });
          setSubmitting(false);
          return;
        }
        payload.email = form.email;
        payload.password = form.password;
      }
      const res = editUser
        ? await fetch(`/api/users/${editUser.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

      if (res.ok) {
        toast({ title: editUser ? "User berhasil diperbarui" : "User berhasil dibuat", variant: "success" });
        setDialogOpen(false);
        load();
      } else {
        toast({ title: "Gagal", description: await parseErrorMessage(res), variant: "destructive" });
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(u: any) {
    await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !u.isActive }),
    });
    toast({ title: `User ${u.isActive ? "dinonaktifkan" : "diaktifkan"}`, variant: "success" });
    load();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Manajemen User</h2>
          <p className="text-sm text-gray-500">{users.length} user terdaftar</p>
        </div>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Tambah User</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
      ) : (
        <div className="space-y-3">
          {users.map((u) => (
            <Card key={u.id} className={!u.isActive ? "opacity-60" : ""}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900">{u.name}</p>
                      {!u.isActive && <Badge variant="secondary" className="text-xs">Nonaktif</Badge>}
                    </div>
                    <p className="text-xs text-gray-500">{u.email}</p>
                    <p className="text-xs text-gray-400">Bergabung {formatDate(u.createdAt)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1 flex-wrap justify-end">
                    {u.globalRole && (
                      <Badge variant="info" className="text-xs">{GLOBAL_ROLE_LABELS[u.globalRole as GlobalRole]}</Badge>
                    )}
                    {u.canLeadProject && (
                      <Badge variant="secondary" className="text-xs">Team Leader</Badge>
                    )}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => openEdit(u)}>Edit</Button>
                  <Button
                    variant="ghost" size="icon"
                    className={u.isActive ? "text-red-500 hover:text-red-700 hover:bg-red-50" : "text-green-600 hover:bg-green-50"}
                    onClick={() => toggleActive(u)}
                    title={u.isActive ? "Nonaktifkan" : "Aktifkan"}
                  >
                    {u.isActive ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editUser ? "Edit User" : "Tambah User Baru"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nama Lengkap *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Budi Santoso" />
            </div>
            {!editUser && (
              <>
                <div className="space-y-2">
                  <Label>Email *</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Password *</Label>
                  <Input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="••••••••" />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label>Global Role (opsional)</Label>
              <div className="flex gap-2 flex-wrap">
                <button type="button" onClick={() => setForm((f) => ({ ...f, globalRole: "" }))}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${!form.globalRole ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                  Tidak Ada
                </button>
                {GLOBAL_ROLES.map((role) => (
                  <button key={role} type="button" onClick={() => setForm((f) => ({ ...f, globalRole: role }))}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${form.globalRole === role ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                    {GLOBAL_ROLE_LABELS[role]}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.canLeadProject}
                onChange={(e) => setForm((f) => ({ ...f, canLeadProject: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300" />
              <span className="text-sm text-gray-700">Bisa memimpin proyek (Team Leader)</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editUser ? "Simpan" : "Buat User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

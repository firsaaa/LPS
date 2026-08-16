"use client";

import { useState, useEffect, useCallback } from "react";
import { Link2, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DOCUMENT_STATUS_LABELS } from "@/types";
import type { DocumentStatus } from "@/types";
import { parseErrorMessage } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { DocumentTitle } from "@/components/documents/document-title";

type RefDoc = { id: string; title: string; documentCode: string; status: DocumentStatus; projectPhase: { phase: string } };
type Reference = { id: string; referencedDocument?: RefDoc; document?: RefDoc; createdBy: { name: string } };

// "Berdasarkan" (references) = dokumen lain yang jadi dasar dokumen ini.
// "Dijadikan dasar oleh" (referencedBy) = dokumen lain yang menautkan balik ke dokumen ini.
// Menautkan dokumen lintas fase ini mendukung penelusuran siklus dokumen
// (mis. Desain LPS -> based-on -> Laporan Assessment Risiko).
export function DocumentReferencesPanel({
  documentId,
  projectId,
  canEdit,
}: {
  documentId: string;
  projectId: string;
  canEdit: boolean;
}) {
  const { toast } = useToast();
  const [references, setReferences] = useState<Reference[]>([]);
  const [referencedBy, setReferencedBy] = useState<Reference[]>([]);
  const [candidates, setCandidates] = useState<RefDoc[]>([]);
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/references`);
      if (res.ok) {
        const data = await res.json();
        setReferences(data.references ?? []);
        setReferencedBy(data.referencedBy ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!adding) return;
    fetch(`/api/projects/${projectId}/documents`)
      .then((r) => (r.ok ? r.json() : []))
      .then((docs) => setCandidates(Array.isArray(docs) ? docs.filter((d: any) => d.id !== documentId) : []));
  }, [adding, projectId, documentId]);

  async function addReference() {
    if (!selectedId) return;
    const res = await fetch(`/api/documents/${documentId}/references`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referencedDocumentId: selectedId }),
    });
    if (res.ok) {
      setAdding(false); setSelectedId("");
      load();
      toast({ title: "Referensi ditambahkan", variant: "success" });
    } else {
      toast({ title: "Gagal menambah referensi", description: await parseErrorMessage(res), variant: "destructive" });
    }
  }

  async function removeReference(refId: string) {
    const res = await fetch(`/api/documents/${documentId}/references/${refId}`, { method: "DELETE" });
    if (res.ok) load();
    else toast({ title: "Gagal menghapus referensi", description: await parseErrorMessage(res), variant: "destructive" });
  }

  if (loading) return null;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Berdasarkan Dokumen</p>
        {references.length === 0 && !adding && <p className="text-xs text-gray-400">Belum ada referensi.</p>}
        <div className="space-y-1.5">
          {references.map((r) => (
            <RefRow key={r.id} doc={r.referencedDocument!} onRemove={canEdit ? () => removeReference(r.id) : undefined} />
          ))}
        </div>
        {canEdit && !adding && (
          <Button variant="ghost" size="sm" className="mt-2 h-7 text-xs text-blue-600 hover:text-blue-700" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Tambah Referensi
          </Button>
        )}
        {adding && (
          <div className="mt-2 flex items-center gap-2">
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger className="w-72"><SelectValue placeholder="Pilih dokumen dasar" /></SelectTrigger>
              <SelectContent>
                {candidates.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.documentCode} — {d.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" className="h-8 text-xs" disabled={!selectedId} onClick={addReference}>Simpan</Button>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setAdding(false); setSelectedId(""); }}>Batal</Button>
          </div>
        )}
      </div>

      {referencedBy.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Dijadikan Dasar Oleh</p>
          <div className="space-y-1.5">
            {referencedBy.map((r) => (
              <RefRow key={r.id} doc={r.document!} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RefRow({ doc, onRemove }: { doc: RefDoc; onRemove?: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-sm">
      <div className="min-w-0 flex items-center gap-2">
        <Link2 className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        <span className="truncate">
          <DocumentTitle code={doc.documentCode} title={doc.title} />
        </span>
        <span className="text-xs text-gray-400 shrink-0">{DOCUMENT_STATUS_LABELS[doc.status] ?? doc.status}</span>
      </div>
      {onRemove && (
        <button onClick={onRemove} aria-label="Hapus referensi" className="shrink-0 text-gray-400 hover:text-red-600">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

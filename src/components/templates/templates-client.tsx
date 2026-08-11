"use client";

import { useState, useEffect } from "react";
import { parseErrorMessage } from "@/lib/utils";
import { FileText, Loader2, ChevronRight, ClipboardList, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { LPS_PHASES } from "@/types";

// Section headers for Laporan Harian fields
const LH_SECTIONS: Record<string, string> = {
  tanggal_laporan: "Identitas Laporan",
  cuaca_pagi: "Kondisi Cuaca",
  jumlah_mandor: "Tenaga Kerja",
  pekerjaan_dilaksanakan: "Uraian Pekerjaan",
  kendala: "Kendala & Tindak Lanjut",
  catatan_pengawas: "Catatan & Pengesahan",
};

// Section headers for Progress Report fields
const PR_SECTIONS: Record<string, string> = {
  periode_laporan: "Identitas Laporan",
  progress_rencana_persen: "Progress Fisik",
  nilai_kontrak_total: "Keuangan",
  pekerjaan_selesai: "Status Pekerjaan",
  kendala: "Risiko & Tindak Lanjut",
  referensi_kurva_s: "Kurva-S & Pengesahan",
};

export function TemplatesClient({ userId }: { userId: string }) {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [selectedProject, setSelectedProject] = useState("");
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/templates").then((r) => r.ok ? r.json() : []),
      fetch("/api/projects").then((r) => r.ok ? r.json() : []),
    ]).then(([t, p]) => {
      setTemplates(Array.isArray(t) ? t : []);
      setProjects(Array.isArray(p) ? p : []);
    }).finally(() => setLoading(false));
  }, []);

  function openTemplate(t: any) {
    setSelectedTemplate(t);
    setFormData({});
    setTitle(`${t.documentType?.typeName ?? t.name} — `);
    setSelectedProject("");
  }

  async function submitForm() {
    if (!selectedProject) { toast({ title: "Pilih proyek terlebih dahulu", variant: "destructive" }); return; }
    if (!title.trim()) { toast({ title: "Judul dokumen wajib diisi", variant: "destructive" }); return; }

    const missingRequired = selectedTemplate.fields
      .filter((f: any) => f.isRequired && !formData[f.fieldName]?.trim());
    if (missingRequired.length > 0) {
      toast({
        title: `Field wajib belum diisi: ${missingRequired.map((f: any) => f.label).join(", ")}`,
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/templates/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: selectedTemplate.id,
          projectId: selectedProject,
          title: title.trim(),
          fieldValues: formData,
        }),
      });
      if (res.ok) {
        toast({ title: "Dokumen berhasil disimpan dari template", variant: "success" });
        setSelectedTemplate(null);
      } else {
        toast({ title: "Gagal menyimpan", description: await parseErrorMessage(res), variant: "destructive" });
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>;
  }

  const sectionMap = selectedTemplate?.documentType?.typeName?.includes("Harian") ? LH_SECTIONS : PR_SECTIONS;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Template Dokumen</h2>
        <p className="text-sm text-gray-500">
          Formulir terstruktur untuk <strong>Laporan Harian</strong> dan <strong>Progress Report/Kurva-S</strong> —
          isi langsung di sistem, hasilnya tersimpan sebagai dokumen proyek.
        </p>
      </div>

      <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 flex gap-3">
        <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
        <p className="text-sm text-blue-800">
          Hanya Laporan Harian (DT-06) dan Progress Report/Kurva-S (DT-07) yang tersedia sebagai template terstruktur,
          sesuai desain sistem. Dokumen fase lain (Assessment, Desain, Commissioning, Maintenance) diunggah sebagai file
          karena menggunakan format proprietary masing-masing perusahaan.
        </p>
      </div>

      {templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 py-16">
          <ClipboardList className="h-12 w-12 text-gray-300 mb-3" />
          <p className="text-sm text-gray-500">Belum ada template aktif</p>
          <p className="text-xs text-gray-400 mt-1">Template dikonfigurasi oleh Superadmin melalui database</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {templates.map((t: any) => {
            const phase = LPS_PHASES.find((p) => p.phase === t.documentType?.phase);
            const requiredCount = t.fields.filter((f: any) => f.isRequired).length;
            return (
              <Card
                key={t.id}
                className="cursor-pointer hover:border-blue-300 hover:shadow-md transition-all"
                onClick={() => openTemplate(t)}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 border border-blue-100">
                        <FileText className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{t.documentType?.typeName}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {t.fields.length} field · {requiredCount} wajib · v{t.version}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-400 mt-1 shrink-0" />
                  </div>
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    {phase && <Badge variant="info" className="text-xs">Fase {phase.order}: {phase.label}</Badge>}
                    <Badge variant="secondary" className="text-xs">{t.documentType?.standardReference ?? "—"}</Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Template form dialog */}
      {selectedTemplate && (
        <Dialog open onOpenChange={() => setSelectedTemplate(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedTemplate.documentType?.typeName}</DialogTitle>
              <p className="text-sm text-gray-500 mt-1">
                Template v{selectedTemplate.version} · {selectedTemplate.fields.length} field ({selectedTemplate.fields.filter((f: any) => f.isRequired).length} wajib)
              </p>
            </DialogHeader>

            <div className="space-y-5 pb-2">
              {/* Dokumen meta */}
              <div className="grid grid-cols-1 gap-4 rounded-lg bg-gray-50 p-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Proyek <span className="text-red-500">*</span></Label>
                  <Select value={selectedProject} onValueChange={setSelectedProject}>
                    <SelectTrigger><SelectValue placeholder="Pilih proyek" /></SelectTrigger>
                    <SelectContent>
                      {projects.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Judul Dokumen <span className="text-red-500">*</span></Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={`${selectedTemplate.documentType?.typeName} — [Nama/Tanggal]`}
                  />
                </div>
              </div>

              {/* Fields grouped by section */}
              {(() => {
                const fields: any[] = selectedTemplate.fields;
                const sections: { header: string; fields: any[] }[] = [];
                let currentSection = { header: "", fields: [] as any[] };

                for (const field of fields) {
                  const sectionHeader = sectionMap[field.fieldName];
                  if (sectionHeader) {
                    if (currentSection.fields.length > 0) sections.push(currentSection);
                    currentSection = { header: sectionHeader, fields: [field] };
                  } else {
                    currentSection.fields.push(field);
                  }
                }
                if (currentSection.fields.length > 0) sections.push(currentSection);

                return sections.map((section, si) => (
                  <div key={si} className="space-y-3">
                    {section.header && (
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 border-b pb-1">
                        {section.header}
                      </p>
                    )}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {section.fields.map((field: any) => (
                        <div
                          key={field.id}
                          className={field.dataType === "TEXTAREA" ? "sm:col-span-2" : ""}
                        >
                          <div className="space-y-1.5">
                            <Label className="text-sm">
                              {field.label}
                              {field.isRequired && <span className="text-red-500 ml-1">*</span>}
                              {field.unit && (
                                <span className="text-gray-400 font-normal ml-1.5">({field.unit})</span>
                              )}
                            </Label>
                            {field.dataType === "TEXTAREA" ? (
                              <Textarea
                                value={formData[field.fieldName] ?? ""}
                                onChange={(e) => setFormData((f) => ({ ...f, [field.fieldName]: e.target.value }))}
                                rows={3}
                                placeholder={`Isi ${field.label.toLowerCase()}...`}
                              />
                            ) : field.dataType === "DATE" ? (
                              <Input
                                type="date"
                                value={formData[field.fieldName] ?? ""}
                                onChange={(e) => setFormData((f) => ({ ...f, [field.fieldName]: e.target.value }))}
                              />
                            ) : field.dataType === "NUMBER" ? (
                              <Input
                                type="number"
                                value={formData[field.fieldName] ?? ""}
                                onChange={(e) => setFormData((f) => ({ ...f, [field.fieldName]: e.target.value }))}
                                placeholder="0"
                              />
                            ) : (
                              <Input
                                value={formData[field.fieldName] ?? ""}
                                onChange={(e) => setFormData((f) => ({ ...f, [field.fieldName]: e.target.value }))}
                                placeholder={`Isi ${field.label.toLowerCase()}...`}
                              />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedTemplate(null)}>Batal</Button>
              <Button onClick={submitForm} disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Simpan sebagai Dokumen
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

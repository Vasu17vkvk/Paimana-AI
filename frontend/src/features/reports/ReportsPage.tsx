import { ArrowDown, ArrowUp, Eye, FileText, GripVertical, Plus, Trash2, X } from "lucide-react";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import PageHeader from "../../components/layout/PageHeader";
import { useState } from "react";
import { reportSectionCatalog, useReportsStore } from "./reportsStore";

function csvCell(value: unknown): string {
    if (value === null || value === undefined) return "";
    const text = typeof value === "object" ? JSON.stringify(value) : String(value);
    return `"${text.replace(/"/g, '""')}"`;
}

function exportReportCsv(title: string, description: string, observation: string, sections: ReturnType<typeof useReportsStore.getState>["sections"]) {
    const rows: string[][] = [
        ["Report Title", title || "PAIMANA Project Report"],
        ["Description", description],
        ["Observation / Note", observation],
        [],
        ["Section", "Description", "Snapshot Data"],
    ];

    sections.forEach((section) => {
        rows.push([
            section.title,
            section.description,
            section.snapshot === undefined ? "" : typeof section.snapshot === "object"
                ? JSON.stringify(section.snapshot)
                : String(section.snapshot),
        ]);
    });

    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob(["\\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(title || "PAIMANA_Project_Report").replace(/[^a-z0-9_-]+/gi, "_")}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function printReport() {
    window.print();
}

function SnapshotValue({ value }: { value: unknown }) {
    if (value === null || value === undefined) return <span className="text-slate-400">—</span>;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return <span>{String(value)}</span>;
    }
    if (Array.isArray(value)) {
        if (value.length === 0) return <span className="text-slate-400">No data</span>;
        return (
            <div className="space-y-2">
                {value.map((item, index) => (
                    <div key={index} className="rounded-lg border border-slate-200 bg-white p-3">
                        <SnapshotValue value={item} />
                    </div>
                ))}
            </div>
        );
    }
    if (typeof value === "object") {
        return (
            <div className="grid gap-2 sm:grid-cols-2">
                {Object.entries(value as Record<string, unknown>).map(([key, item]) => (
                    <div key={key} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{key.replace(/_/g, " ")}</div>
                        <div className="mt-1 break-words text-xs text-slate-700"><SnapshotValue value={item} /></div>
                    </div>
                ))}
            </div>
        );
    }
    return <span>{String(value)}</span>;
}

export default function ReportsPage() {
    const { title, description, observation, sections, setTitle, setDescription, setObservation, addSection, removeSection, moveSection, clearSections } = useReportsStore();
    const [previewOpen, setPreviewOpen] = useState(false);
    const availableSections = reportSectionCatalog.filter((candidate) => !sections.some((section) => section.type === candidate.type));

    return (
        <div className="mx-auto w-full max-w-[1500px]">
            <PageHeader
                eyebrow="INTELLIGENCE · REPORTS"
                title="Reports"
                description="Build a focused project report by selecting the analysis sections you want to include."
                action={
                    <div className="flex items-center gap-2">
                        <span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                            {sections.length} {sections.length === 1 ? "section" : "sections"}
                        </span>
                        {sections.length > 0 && <Button variant="secondary" onClick={clearSections}>Clear</Button>}
                        <Button variant="primary" onClick={() => setPreviewOpen(true)} disabled={sections.length === 0}>
                            <Eye size={15} /> Preview
                        </Button>
                    </div>
                }
            />

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
                <div className="space-y-5">
                    <Card padding="lg">
                        <div className="flex items-start gap-3">
                            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600"><FileText size={18} /></div>
                            <div>
                                <h2 className="text-sm font-bold text-slate-900">Report Details</h2>
                                <p className="mt-1 text-[11px] leading-5 text-slate-400">Add the basic information that will appear with the selected report sections.</p>
                            </div>
                        </div>

                        <div className="mt-6 grid gap-4">
                            <label>
                                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Report Title</span>
                                <input value={title} onChange={(event) => setTitle(event.target.value)}
                                    className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700 outline-none transition focus:border-slate-400 focus:bg-white" />
                            </label>
                            <label>
                                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Description</span>
                                <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder="Optional report description..."
                                    className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-700 outline-none transition focus:border-slate-400 focus:bg-white" />
                            </label>
                            <label>
                                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Observation / Note</span>
                                <textarea value={observation} onChange={(event) => setObservation(event.target.value)} rows={3} placeholder="Add an observation for the report..."
                                    className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-700 outline-none transition focus:border-slate-400 focus:bg-white" />
                            </label>
                        </div>
                    </Card>

                    <Card padding="lg">
                        <h2 className="text-sm font-bold text-slate-900">Report Sections</h2>
                        <p className="mt-1 text-[11px] text-slate-400">Arrange the sections in the order you want them to appear.</p>

                        {sections.length === 0 ? (
                            <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-5 py-10 text-center">
                                <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-white text-slate-400 shadow-sm"><FileText size={17} /></div>
                                <div className="mt-3 text-sm font-semibold text-slate-700">No sections added yet</div>
                                <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-400">Choose sections from the available list to start building this report.</p>
                            </div>
                        ) : (
                            <div className="mt-5 space-y-2">
                                {sections.map((section, index) => (
                                    <div key={section.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3">
                                        <GripVertical size={15} className="shrink-0 text-slate-300" />
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-xs font-bold text-slate-800">{index + 1}. {section.title}</div>
                                            <div className="mt-1 text-[11px] text-slate-400">{section.description}</div>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-1">
                                            <button type="button" disabled={index === 0} onClick={() => moveSection(section.id, "up")} className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30" aria-label="Move section up"><ArrowUp size={14} /></button>
                                            <button type="button" disabled={index === sections.length - 1} onClick={() => moveSection(section.id, "down")} className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30" aria-label="Move section down"><ArrowDown size={14} /></button>
                                            <button type="button" onClick={() => removeSection(section.id)} className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600" aria-label="Remove section"><Trash2 size={14} /></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>

                <aside className="space-y-5">
                    <Card padding="lg">
                        <h2 className="text-sm font-bold text-slate-900">Add to Report</h2>
                        <p className="mt-1 text-[11px] leading-5 text-slate-400">Select the report sections you want to include.</p>

                        <div className="mt-5 space-y-2">
                            {availableSections.length === 0 ? (
                                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-xs font-semibold text-slate-500">All available sections are already included.</div>
                            ) : (
                                availableSections.map((section) => (
                                    <button key={section.type} type="button"
                                        onClick={() => addSection({ id: section.type + "-" + Date.now(), ...section })}
                                        className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-left transition hover:border-slate-300 hover:bg-slate-50">
                                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 transition group-hover:bg-slate-200"><Plus size={15} /></span>
                                        <span className="min-w-0">
                                            <span className="block text-xs font-bold text-slate-800">{section.title}</span>
                                            <span className="mt-0.5 block text-[10px] leading-4 text-slate-400">{section.description}</span>
                                        </span>
                                    </button>
                                ))
                            )}
                        </div>
                    </Card>

                    <Card padding="lg" className="border-slate-200 bg-slate-50/60">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current Stage</div>
                        <div className="mt-2 text-sm font-bold text-slate-800">Report workspace</div>
                        <p className="mt-2 text-[11px] leading-5 text-slate-500">
                            Section selection, ordering and report metadata are available now. Export, report history, data snapshots and AI summary will be connected after their exact data/API contracts are verified.
                        </p>
                    </Card>
                </aside>
            </div>

            {previewOpen && (
                <div className="report-preview-overlay fixed inset-0 z-50 overflow-y-auto bg-slate-950/30 p-4 backdrop-blur-[2px] sm:p-8">
                    <div className="mx-auto min-h-full max-w-5xl py-4 sm:py-8">
                        <Card padding="lg" className="report-print-root overflow-hidden bg-white shadow-xl">
                            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-5">
                                <div className="min-w-0">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Report Preview</div>
                                    <h2 className="mt-1 text-xl font-bold text-slate-900">{title || "PAIMANA Project Report"}</h2>
                                    {description && <p className="mt-2 text-xs leading-5 text-slate-500">{description}</p>}
                                </div>
                                <button type="button" onClick={() => setPreviewOpen(false)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Close preview">
                                    <X size={17} />
                                </button>
                            </div>

                            {observation && (
                                <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Observation / Note</div>
                                    <p className="mt-1.5 text-xs leading-5 text-slate-600">{observation}</p>
                                </div>
                            )}

                            <div className="mt-6 space-y-5">
                                {sections.map((section, index) => (
                                    <section key={section.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                                        <div className="flex items-start gap-3">
                                            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-200 text-[11px] font-bold text-slate-600">{index + 1}</span>
                                            <div className="min-w-0 flex-1">
                                                <h3 className="text-sm font-bold text-slate-800">{section.title}</h3>
                                                <p className="mt-1 text-[11px] leading-5 text-slate-400">{section.description}</p>
                                            </div>
                                        </div>
                                        <div className="mt-4">
                                            {section.snapshot === undefined ? (
                                                <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-5 text-center text-xs text-slate-400">
                                                    No snapshot data is attached to this section yet.
                                                </div>
                                            ) : (
                                                <SnapshotValue value={section.snapshot} />
                                            )}
                                        </div>
                                    </section>
                                ))}
                            </div>

                            <div className="report-preview-actions mt-6 flex justify-end border-t border-slate-200 pt-5">
                                <div className="flex flex-wrap justify-end gap-2">
                                    <Button variant="secondary" onClick={() => exportReportCsv(title, description, observation, sections)}>Excel (CSV)</Button>
                                    <Button variant="primary" onClick={printReport}>PDF / Print</Button>
                                    <Button variant="secondary" onClick={() => setPreviewOpen(false)}>Close Preview</Button>
                                </div>
                            </div>
                        </Card>
                    </div>
                </div>
            )}
        </div>
    );
}

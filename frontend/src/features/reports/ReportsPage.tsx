import {
    ArrowDown,
    ArrowUp,
    Check,
    Copy,
    Download,
    Eye,
    FileText,
    GripVertical,
    History,
    Pencil,
    Plus,
    Printer,
    Sparkles,
    Trash2,
    X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import PageHeader from "../../components/layout/PageHeader";
import {
    defaultReportFilters,
    defaultReportParts,
    reportSectionCatalog,
    useReportsStore,
    type ReportPart,
    type ReportScope,
    type ReportSection,
    type SavedReport,
} from "./reportsStore";
import { generateReportExecutiveSummary } from "../../services/api";

function displayValue(value: unknown): string {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
}

function exportReportXlsx(report: SavedReport | ReturnType<typeof useReportsStore.getState>) {
    const isSaved = "id" in report;
    const title = report.title || "PAIMANA Project Report";
    const sections = report.sections ?? [];
    const filters = report.filters ?? defaultReportFilters;
    const rows: Array<Array<string | number>> = [
        ["PAIMANA REPORT", ""],
        ["Report Title", title],
        ["Scope", report.scope === "project" ? "Project Report" : "Portfolio Report"],
        ["Project Code", report.projectCode || ""],
        ["Project Name", report.projectName || ""],
        ["Description", report.description || ""],
        ["Observation / Note", report.observation || ""],
        ["Created At", isSaved ? new Date(report.createdAt).toLocaleString("en-IN") : new Date().toLocaleString("en-IN")],
        [],
        ["Filter", "Value"],
        ["Ministry", filters.ministry],
        ["Sector", filters.sector],
        ["State / UT", filters.state],
        ["Risk Level", filters.riskLevel],
        ["Project Status", filters.projectStatus],
        ["Date / Month", filters.dateMonth],
        [],
        ["Section", "Description", "Captured At", "Selected Parts", "Section Observation", "Snapshot"],
    ];

    sections.forEach((section) => {
        rows.push([
            section.title,
            section.description,
            new Date(section.capturedAt ?? section.addedAt).toLocaleString("en-IN"),
            (section.selectedParts ?? defaultReportParts).join(", "),
            section.observation || "",
            displayValue(section.snapshot),
        ]);
    });

    if (report.executiveSummary) {
        rows.push([]);
        rows.push(["AI Executive Summary", report.executiveSummary]);
    }

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    worksheet["!cols"] = [
        { wch: 28 },
        { wch: 38 },
        { wch: 24 },
        { wch: 42 },
        { wch: 40 },
        { wch: 80 },
    ];
    XLSX.utils.book_append_sheet(workbook, worksheet, "Report");
    XLSX.writeFileXLSX(
        workbook,
        `${title.replace(/[^a-z0-9_-]+/gi, "_") || "PAIMANA_Report"}.xlsx`,
        { compression: true },
    );
}

function printReport(
    title: string,
    description: string,
    observation: string,
    scope: ReportScope,
    projectCode: string,
    projectName: string,
    filters: typeof defaultReportFilters,
    sections: ReportSection[],
    executiveSummary: string,
) {
    const popup = window.open("", "_blank", "noopener,noreferrer,width=1000,height=800");
    if (!popup) {
        window.print();
        return;
    }

    const sectionHtml = sections.map((section, index) => `
        <section class="section">
            <div class="section-title">${index + 1}. ${escapeHtml(section.title)}</div>
            <div class="muted">${escapeHtml(section.description)}</div>
            <div class="meta">Captured: ${escapeHtml(new Date(section.capturedAt ?? section.addedAt).toLocaleString("en-IN"))}</div>
            ${section.observation ? `<div class="note"><strong>Observation:</strong> ${escapeHtml(section.observation)}</div>` : ""}
            <pre>${escapeHtml(displayValue(section.snapshot))}</pre>
        </section>
    `).join("");

    popup.document.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title>
        <style>
        body{font-family:Arial,sans-serif;color:#17202a;margin:40px;line-height:1.5}
        h1{margin-bottom:4px}h2{margin-top:32px}.muted,.meta{color:#667085;font-size:12px}
        .meta{margin-top:6px}.section{border-top:1px solid #d9dde3;padding:18px 0}
        .section-title{font-size:16px;font-weight:700}.note{margin-top:10px;background:#f5f6f7;padding:10px;border-radius:8px}
        pre{white-space:pre-wrap;word-break:break-word;background:#f7f8fa;padding:12px;border-radius:8px;font-size:11px}
        .summary{background:#f5f6f7;padding:16px;border-radius:10px}.filters{font-size:12px;color:#475467}
        @media print{body{margin:18mm}.no-print{display:none}}
        </style></head><body>
        <div class="no-print"><button onclick="window.print()">Print / Save as PDF</button></div>
        <h1>${escapeHtml(title)}</h1>
        <div class="muted">${scope === "project" ? "Project Report" : "Portfolio Report"}${projectName ? " · " + escapeHtml(projectName) : ""}</div>
        ${projectCode ? `<div class="muted">Project Code: ${escapeHtml(projectCode)}</div>` : ""}
        ${description ? `<p>${escapeHtml(description)}</p>` : ""}
        ${observation ? `<div class="note"><strong>Observation:</strong> ${escapeHtml(observation)}</div>` : ""}
        <h2>Scope & Filters</h2>
        <div class="filters">${escapeHtml(JSON.stringify(filters, null, 2))}</div>
        ${executiveSummary ? `<h2>AI Executive Summary</h2><div class="summary">${escapeHtml(executiveSummary)}</div>` : ""}
        <h2>Report Sections</h2>
        ${sectionHtml}
        </body></html>`);
    popup.document.close();
    popup.focus();
}

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
    }[character] ?? character));
}

function SnapshotValue({ value }: { value: unknown }) {
    if (value === null || value === undefined) return <span className="text-slate-400">—</span>;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return <span>{String(value)}</span>;
    if (Array.isArray(value)) {
        if (value.length === 0) return <span className="text-slate-400">No data</span>;
        return <div className="space-y-2">{value.map((item, index) => <div key={index} className="rounded-lg border border-slate-200 bg-white p-3"><SnapshotValue value={item} /></div>)}</div>;
    }
    if (typeof value === "object") {
        return <div className="grid gap-2 sm:grid-cols-2">{Object.entries(value as Record<string, unknown>).map(([key, item]) => (
            <div key={key} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{key.replace(/_/g, " ")}</div>
                <div className="mt-1 break-words text-xs text-slate-700"><SnapshotValue value={item} /></div>
            </div>
        ))}</div>;
    }
    return <span>{String(value)}</span>;
}

function PartLabel({ part }: { part: ReportPart }) {
    const labels: Record<ReportPart, string> = {
        summary: "Summary",
        risk_breakdown: "Risk Breakdown",
        contributing_factors: "Contributing Factors",
        chart: "Chart",
        table: "Table",
        recommendations: "Recommendations",
    };
    return <span>{labels[part]}</span>;
}

export default function ReportsPage() {
    const navigate = useNavigate();
    const store = useReportsStore();
    const {
        title, description, observation, scope, projectCode, projectName, filters,
        sections, history, executiveSummary,
        setTitle, setDescription, setObservation, setScope, setProjectCode, setProjectName,
        setFilter, addSection, removeSection, moveSection, clearSections, updateSection,
        setExecutiveSummary, saveCurrentReport, loadReport, duplicateReport, deleteReport,
    } = store;

    const [previewOpen, setPreviewOpen] = useState(false);
    const [customizeId, setCustomizeId] = useState<string | null>(null);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState("");
    const [searchCatalog, setSearchCatalog] = useState("");

    const customizeSection = sections.find((section) => section.id === customizeId) ?? null;
    const availableSections = useMemo(
        () => reportSectionCatalog.filter((candidate) => !sections.some((section) => section.type === candidate.type))
            .filter((candidate) => candidate.title.toLowerCase().includes(searchCatalog.toLowerCase())),
        [sections, searchCatalog],
    );

    async function generateExecutiveSummary() {
        if (sections.length === 0) return;
        setAiLoading(true);
        setAiError("");
        try {
            const response = await generateReportExecutiveSummary({
                title,
                scope,
                projectCode,
                projectName,
                filters,
                sections: sections.map((section) => ({
                    title: section.title,
                    description: section.description,
                    selectedParts: section.selectedParts,
                    snapshot: section.snapshot,
                    observation: section.observation,
                })),
            });
            setExecutiveSummary(response.summary);
        } catch (error) {
            setAiError(error instanceof Error ? error.message : "Failed to generate AI Executive Summary.");
        } finally {
            setAiLoading(false);
        }
    }

    return (
        <div className="mx-auto w-full max-w-[1500px]">
            <PageHeader
                eyebrow="INTELLIGENCE · REPORTS"
                title="Reports"
                description="Build a project or portfolio report from verified PAIMANA analytics snapshots."
                action={
                    <div className="flex flex-wrap items-center justify-end gap-2">
                        <span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                            {sections.length} {sections.length === 1 ? "section" : "sections"}
                        </span>
                        <Button variant="secondary" onClick={() => setHistoryOpen(true)}><History size={15} /> History</Button>
                        {sections.length > 0 && <Button variant="secondary" onClick={clearSections}>Clear</Button>}
                        <Button variant="secondary" onClick={saveCurrentReport} disabled={sections.length === 0}><Check size={15} /> Save Report</Button>
                        <Button variant="primary" onClick={() => setPreviewOpen(true)} disabled={sections.length === 0}><Eye size={15} /> Preview</Button>
                    </div>
                }
            />

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
                <div className="space-y-5">
                    <Card padding="lg">
                        <div className="flex items-start gap-3">
                            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600"><FileText size={18} /></div>
                            <div><h2 className="text-sm font-bold text-slate-900">Report Details</h2><p className="mt-1 text-[11px] leading-5 text-slate-400">Define the report identity, scope and contextual filters.</p></div>
                        </div>

                        <div className="mt-6 grid gap-4">
                            <label>
                                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Report Title</span>
                                <input value={title} onChange={(event) => setTitle(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700 outline-none transition focus:border-slate-400 focus:bg-white" />
                            </label>
                            <label>
                                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Description</span>
                                <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder="Optional report description..." className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-700 outline-none transition focus:border-slate-400 focus:bg-white" />
                            </label>

                            <div>
                                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Report Scope</span>
                                <div className="grid grid-cols-2 gap-2">
                                    {(["project", "portfolio"] as ReportScope[]).map((item) => (
                                        <button key={item} type="button" onClick={() => setScope(item)} className={`rounded-lg border px-3 py-2.5 text-left text-xs font-semibold transition ${scope === item ? "border-slate-400 bg-slate-100 text-slate-900" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}>
                                            {item === "project" ? "Project Report" : "Portfolio Report"}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {scope === "project" && (
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Project Code</span><input value={projectCode} onChange={(event) => setProjectCode(event.target.value)} placeholder="e.g. project code" className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700 outline-none focus:border-slate-400 focus:bg-white" /></label>
                                    <label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Project Name</span><input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Project name" className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700 outline-none focus:border-slate-400 focus:bg-white" /></label>
                                </div>
                            )}

                            {scope === "portfolio" && (
                                <div>
                                    <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Portfolio Filters</span>
                                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        {([
                                            ["ministry", "Ministry"],
                                            ["sector", "Sector"],
                                            ["state", "State / UT"],
                                            ["riskLevel", "Risk Level"],
                                            ["projectStatus", "Project Status"],
                                            ["dateMonth", "Date / Month"],
                                        ] as Array<[keyof typeof filters, string]>).map(([key, label]) => (
                                            <label key={key}><span className="mb-1 block text-[10px] font-semibold text-slate-400">{label}</span><input value={filters[key]} onChange={(event) => setFilter(key, event.target.value)} className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700 outline-none focus:border-slate-400 focus:bg-white" placeholder={label} /></label>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <label>
                                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Report Observation / Note</span>
                                <textarea value={observation} onChange={(event) => setObservation(event.target.value)} rows={3} placeholder="Add an observation for the report..." className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-700 outline-none focus:border-slate-400 focus:bg-white" />
                            </label>
                        </div>
                    </Card>

                    <Card padding="lg">
                        <div className="flex items-center justify-between gap-3">
                            <div><h2 className="text-sm font-bold text-slate-900">Report Sections</h2><p className="mt-1 text-[11px] text-slate-400">Reorder, customize and remove the captured sections.</p></div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{sections.length} selected</span>
                        </div>

                        {sections.length === 0 ? (
                            <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-5 py-10 text-center">
                                <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-white text-slate-400 shadow-sm"><FileText size={17} /></div>
                                <div className="mt-3 text-sm font-semibold text-slate-700">No sections added yet</div>
                                <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-400">Use the Add to Report list or the Save to Report buttons on analytics sections.</p>
                            </div>
                        ) : (
                            <div className="mt-5 space-y-2">
                                {sections.map((section, index) => (
                                    <div key={section.id} className="rounded-xl border border-slate-200 bg-white p-3">
                                        <div className="flex items-center gap-3">
                                            <GripVertical size={15} className="shrink-0 text-slate-300" />
                                            <div className="min-w-0 flex-1"><div className="truncate text-xs font-bold text-slate-800">{index + 1}. {section.title}</div><div className="mt-1 text-[10px] text-slate-400">{section.description} · Captured {new Date(section.capturedAt ?? section.addedAt).toLocaleString("en-IN")}</div></div>
                                            <div className="flex shrink-0 items-center gap-1">
                                                <button type="button" disabled={index === 0} onClick={() => moveSection(section.id, "up")} className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-30"><ArrowUp size={14} /></button>
                                                <button type="button" disabled={index === sections.length - 1} onClick={() => moveSection(section.id, "down")} className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-30"><ArrowDown size={14} /></button>
                                                <button type="button" onClick={() => setCustomizeId(section.id)} className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Customize section"><Pencil size={14} /></button>
                                                <button type="button" onClick={() => removeSection(section.id)} className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove section"><Trash2 size={14} /></button>
                                            </div>
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-1.5 pl-7">{(section.selectedParts ?? defaultReportParts).map((part) => <span key={part} className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-semibold text-slate-500"><PartLabel part={part} /></span>)}</div>
                                        {section.observation && <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[10px] text-slate-600">{section.observation}</div>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>

                    <Card padding="lg">
                        <div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-bold text-slate-900">AI Executive Summary</h2><p className="mt-1 text-[11px] text-slate-400">Summarize the selected report evidence into findings, major risks, changes and recommended actions.</p></div><Button variant="secondary" onClick={generateExecutiveSummary} disabled={sections.length === 0 || aiLoading}><Sparkles size={15} /> {aiLoading ? "Generating..." : "Generate Summary"}</Button></div>
                        {aiError && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{aiError}</div>}
                        {executiveSummary ? <div className="mt-4 whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-6 text-slate-700">{executiveSummary}</div> : <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-5 text-xs text-slate-400">No AI summary generated yet.</div>}
                    </Card>
                </div>

                <aside className="space-y-5">
                    <Card padding="lg">
                        <div className="flex items-center justify-between gap-2"><div><h2 className="text-sm font-bold text-slate-900">Add to Report</h2><p className="mt-1 text-[11px] leading-5 text-slate-400">Add a section manually when a verified snapshot is available.</p></div></div>
                        <input value={searchCatalog} onChange={(event) => setSearchCatalog(event.target.value)} placeholder="Search sections..." className="mt-4 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700 outline-none focus:border-slate-400 focus:bg-white" />
                        <div className="mt-4 space-y-2">
                            {availableSections.map((section) => (
                                <button key={section.type} type="button" onClick={() => addSection({ id: section.type + "-" + Date.now(), ...section })} className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-left transition hover:border-slate-300 hover:bg-slate-50">
                                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 group-hover:bg-slate-200"><Plus size={15} /></span>
                                    <span className="min-w-0"><span className="block text-xs font-bold text-slate-800">{section.title}</span><span className="mt-0.5 block text-[10px] leading-4 text-slate-400">{section.description}</span></span>
                                </button>
                            ))}
                        </div>
                    </Card>

                    <Card padding="lg" className="border-slate-200 bg-slate-50/60">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Export</div>
                        <div className="mt-2 text-sm font-bold text-slate-800">Official report outputs</div>
                        <div className="mt-3 grid gap-2">
                            <Button variant="secondary" disabled={sections.length === 0} onClick={() => exportReportXlsx(store)}><Download size={15} /> Excel (.xlsx)</Button>
                            <Button variant="secondary" disabled={sections.length === 0} onClick={() => printReport(title, description, observation, scope, projectCode, projectName, filters, sections, executiveSummary)}><Printer size={15} /> PDF / Print</Button>
                            <Button variant="primary" disabled={sections.length === 0} onClick={() => setPreviewOpen(true)}><Eye size={15} /> Preview</Button>
                        </div>
                        <p className="mt-3 text-[10px] leading-4 text-slate-400">PDF uses the browser print dialog so the report can be saved as a PDF without changing the existing app shell.</p>
                    </Card>
                </aside>
            </div>

            {customizeSection && (
                <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/40 p-4" onMouseDown={() => setCustomizeId(null)}>
                    <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
                        <div className="flex items-start justify-between gap-3"><div><h3 className="text-base font-bold text-slate-900">Customize Section</h3><p className="mt-1 text-xs text-slate-400">{customizeSection.title}</p></div><button type="button" onClick={() => setCustomizeId(null)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"><X size={16} /></button></div>
                        <div className="mt-5 grid grid-cols-2 gap-2">
                            {defaultReportParts.map((part) => {
                                const selected = (customizeSection.selectedParts ?? defaultReportParts).includes(part);
                                return <button key={part} type="button" onClick={() => {
                                    const current = customizeSection.selectedParts ?? defaultReportParts;
                                    const next = selected ? current.filter((item) => item !== part) : [...current, part];
                                    updateSection(customizeSection.id, { selectedParts: next.length ? next : ["summary"] });
                                }} className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-xs font-semibold transition ${selected ? "border-slate-400 bg-slate-100 text-slate-900" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}>
                                    {selected ? <Check size={14} /> : <Plus size={14} />} <PartLabel part={part} />
                                </button>;
                            })}
                        </div>
                        <label className="mt-5 block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Section Observation</span><textarea value={customizeSection.observation ?? ""} onChange={(event) => updateSection(customizeSection.id, { observation: event.target.value })} rows={4} className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-700 outline-none focus:border-slate-400 focus:bg-white" placeholder="Add an observation/comment for this section..." /></label>
                        <div className="mt-5 flex justify-end"><Button variant="primary" onClick={() => setCustomizeId(null)}>Done</Button></div>
                    </div>
                </div>
            )}

            {previewOpen && (
                <div className="fixed inset-0 z-[90] overflow-y-auto bg-slate-950/50 p-4 md:p-8" onMouseDown={() => setPreviewOpen(false)}>
                    <div className="mx-auto max-w-5xl rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
                        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4"><div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{scope === "project" ? "Project Report" : "Portfolio Report"}</div><h2 className="mt-1 text-xl font-bold text-slate-900">{title || "PAIMANA Project Report"}</h2><p className="mt-1 text-xs text-slate-500">{projectName || projectCode || description}</p></div><div className="flex items-center gap-2"><Button variant="secondary" onClick={() => printReport(title, description, observation, scope, projectCode, projectName, filters, sections, executiveSummary)}><Printer size={15} /> PDF / Print</Button><button type="button" onClick={() => setPreviewOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"><X size={16} /></button></div></div>
                        {executiveSummary && <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">AI Executive Summary</div><div className="mt-2 whitespace-pre-wrap text-xs leading-6 text-slate-700">{executiveSummary}</div></div>}
                        {observation && <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600"><strong>Observation:</strong> {observation}</div>}
                        <div className="mt-5 space-y-4">{sections.map((section, index) => <div key={section.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-xs font-bold text-slate-900">{index + 1}. {section.title}</div><div className="mt-1 text-[10px] text-slate-400">{section.description}</div></div><span className="text-[9px] font-semibold text-slate-400">{new Date(section.capturedAt ?? section.addedAt).toLocaleString("en-IN")}</span></div><div className="mt-3"><SnapshotValue value={section.snapshot} /></div>{section.observation && <div className="mt-3 rounded-lg bg-white p-3 text-xs text-slate-600"><strong>Observation:</strong> {section.observation}</div>}</div>)}</div>
                    </div>
                </div>
            )}

            {historyOpen && (
                <div className="fixed inset-0 z-[90] overflow-y-auto bg-slate-950/50 p-4 md:p-8" onMouseDown={() => setHistoryOpen(false)}>
                    <div className="mx-auto max-w-4xl rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
                        <div className="flex items-center justify-between border-b border-slate-200 pb-4"><div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Saved Reports</div><h2 className="mt-1 text-lg font-bold text-slate-900">Report History</h2></div><button type="button" onClick={() => setHistoryOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"><X size={16} /></button></div>
                        <div className="mt-4 space-y-2">
                            {history.length === 0 ? <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-xs text-slate-400">No saved reports yet.</div> : history.map((report) => (
                                <div key={report.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><div className="text-xs font-bold text-slate-800">{report.title}</div><div className="mt-1 text-[10px] text-slate-400">{report.scope === "project" ? "Project" : "Portfolio"} · {report.sections.length} sections · {new Date(report.createdAt).toLocaleString("en-IN")}</div></div><div className="flex flex-wrap gap-1.5"><Button variant="secondary" size="sm" onClick={() => { loadReport(report.id); setHistoryOpen(false); }}><Eye size={13} /> View</Button><Button variant="secondary" size="sm" onClick={() => exportReportXlsx(report)}><Download size={13} /> Download</Button><Button variant="secondary" size="sm" onClick={() => duplicateReport(report.id)}><Copy size={13} /> Duplicate</Button><Button variant="ghost" size="sm" onClick={() => deleteReport(report.id)}><Trash2 size={13} /> Delete</Button></div></div></div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

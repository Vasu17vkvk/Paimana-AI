import { ArrowDown, ArrowUp, Check, Copy, Download, Eye, FileText, GripVertical, History, Pencil, Plus, Printer, Sparkles, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import PageHeader from "../../components/layout/PageHeader";
import { defaultReportParts, reportSectionCatalog, useReportsStore, type ReportPart, type ReportScope, type SavedReport } from "./reportsStore";
import { generateReportExecutiveSummary } from "../../services/api";

type ReportExportData = Pick<SavedReport, "title" | "description" | "observation" | "scope" | "projectCode" | "projectName" | "filters" | "sections" | "executiveSummary"> & { createdAt?: number };

function valueText(value: unknown): string {
    if (value === null || value === undefined || value === "") return "—";
    return typeof value === "object" ? JSON.stringify(value) : String(value);
}
function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[c] ?? c));
}
function SnapshotValue({ value }: { value: unknown }) {
    if (value === null || value === undefined) return <span className="text-slate-400">—</span>;
    if (["string","number","boolean"].includes(typeof value)) return <span>{String(value)}</span>;
    if (Array.isArray(value)) return value.length ? <div className="space-y-2">{value.map((item,i)=><div key={i} className="rounded-lg border border-slate-200 bg-white p-3"><SnapshotValue value={item}/></div>)}</div> : <span className="text-slate-400">No data</span>;
    return <div className="grid gap-2 sm:grid-cols-2">{Object.entries(value as Record<string,unknown>).map(([key,item])=><div key={key} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{key.replace(/_/g," ")}</div><div className="mt-1 break-words text-xs text-slate-700"><SnapshotValue value={item}/></div></div>)}</div>;
}
function partLabel(part: ReportPart) {
    return ({summary:"Summary",risk_breakdown:"Risk Breakdown",contributing_factors:"Contributing Factors",chart:"Chart",table:"Table",recommendations:"Recommendations"} as Record<ReportPart,string>)[part];
}
function flattenSnapshot(value: unknown, path = ""): Array<[string,string]> {
    if (value === null || value === undefined || value === "") return [[path || "Value", "—"]];
    if (Array.isArray(value)) {
        if (!value.length) return [[path || "Value", "No data"]];
        return value.flatMap((item, index) => flattenSnapshot(item, path ? `${path}[${index + 1}]` : `[${index + 1}]`));
    }
    if (typeof value === "object") {
        return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) =>
            flattenSnapshot(item, path ? `${path} › ${key.replace(/_/g, " ")}` : key.replace(/_/g, " "))
        );
    }
    return [[path || "Value", String(value)]];
}

function styleSheet(ws: XLSX.WorkSheet, widths: number[], freeze = "A2") {
    ws["!cols"] = widths.map(w => ({ wch: w }));
    ws["!freeze"] = { xSplit: 0, ySplit: 1 };
    ws["!autofilter"] = { ref: `A1:${String.fromCharCode(64 + widths.length)}1` };
    if (freeze) ws["!freeze"] = freeze;
}

function exportXlsx(report: ReportExportData) {
    const wb = XLSX.utils.book_new();
    const createdAt = "createdAt" in report ? new Date(report.createdAt ?? Date.now()).toLocaleString("en-IN") : new Date().toLocaleString("en-IN");

    const summaryRows:any[][] = [
        ["PAIMANA REPORT"],
        ["Report Title", report.title || "PAIMANA Project Report"],
        ["Report Type", report.scope === "project" ? "Project Report" : "Portfolio Report"],
        ["Project Code", report.projectCode || "—"],
        ["Project Name", report.projectName || "—"],
        ["Description", report.description || "—"],
        ["Observation", report.observation || "—"],
        ["Created At", createdAt],
        [],
        ["FILTER", "VALUE"],
        ...Object.entries(report.filters).map(([k,v]) => [k.replace(/([A-Z])/g, " $1"), v || "—"]),
    ];
    if (report.executiveSummary) summaryRows.push([], ["AI EXECUTIVE SUMMARY"], [report.executiveSummary]);

    const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
    summaryWs["!merges"] = [{ s:{r:0,c:0}, e:{r:0,c:1} }];
    summaryWs["A1"].s = { font:{ bold:true, sz:16 }, alignment:{ horizontal:"left" } };
    styleSheet(summaryWs, [28, 72], "");
    summaryWs["!rows"] = [{ hpt:28 }];
    XLSX.utils.book_append_sheet(wb, summaryWs, "Report Summary");

    const sectionRows:any[][] = [["No.","Section","Description","Captured At","Selected Parts","Observation"]];
    report.sections.forEach((s,i) => sectionRows.push([
        i + 1,
        s.title,
        s.description,
        new Date(s.capturedAt ?? s.addedAt).toLocaleString("en-IN"),
        (s.selectedParts ?? defaultReportParts).map(partLabel).join(", "),
        s.observation || "—",
    ]));
    const sectionWs = XLSX.utils.aoa_to_sheet(sectionRows);
    styleSheet(sectionWs, [8, 28, 52, 24, 52, 42]);
    XLSX.utils.book_append_sheet(wb, sectionWs, "Sections");

    const snapshotRows:any[][] = [["Section","Field / Path","Value"]];
    report.sections.forEach((s) => {
        flattenSnapshot(s.snapshot).forEach(([path,value]) => snapshotRows.push([s.title, path, value]));
    });
    const snapshotWs = XLSX.utils.aoa_to_sheet(snapshotRows);
    styleSheet(snapshotWs, [28, 62, 72]);
    XLSX.utils.book_append_sheet(wb, snapshotWs, "Snapshot Data");

    XLSX.writeFileXLSX(wb,(report.title||"PAIMANA_Report").replace(/[^a-z0-9_-]+/gi,"_")+".xlsx",{compression:true});
}
function printReport(report: ReportExportData) {
    const popup=window.open("","_blank","noopener,noreferrer,width=1000,height=800");
    if(!popup){window.print();return;}
    const sections=report.sections.map((s,i)=>`<section class="section"><h3>${i+1}. ${escapeHtml(s.title)}</h3><div class="muted">${escapeHtml(s.description)}</div><div class="muted">Captured: ${escapeHtml(new Date(s.capturedAt??s.addedAt).toLocaleString("en-IN"))}</div>${s.observation?`<div class="note"><b>Observation:</b> ${escapeHtml(s.observation)}</div>`:""}<pre>${escapeHtml(valueText(s.snapshot))}</pre></section>`).join("");
    popup.document.write(`<!doctype html><html><head><title>${escapeHtml(report.title)}</title><style>body{font-family:Arial,sans-serif;color:#17202a;margin:40px;line-height:1.5}.muted{color:#667085;font-size:12px}.section{border-top:1px solid #d9dde3;padding:18px 0}pre{white-space:pre-wrap;word-break:break-word;background:#f7f8fa;padding:12px;border-radius:8px;font-size:11px}.note{margin-top:10px;background:#f5f6f7;padding:10px;border-radius:8px}@media print{body{margin:18mm}.no-print{display:none}}</style></head><body><button class="no-print" onclick="window.print()">Print / Save as PDF</button><h1>${escapeHtml(report.title||"PAIMANA Project Report")}</h1><div class="muted">${report.scope==="project"?"Project Report":"Portfolio Report"} · ${escapeHtml(report.projectName||report.projectCode||"")}</div>${report.description?`<p>${escapeHtml(report.description)}</p>`:""}${report.observation?`<div class="note"><b>Observation:</b> ${escapeHtml(report.observation)}</div>`:""}${report.executiveSummary?`<h2>AI Executive Summary</h2><div class="note">${escapeHtml(report.executiveSummary)}</div>`:""}<h2>Report Sections</h2>${sections}</body></html>`);
    popup.document.close();popup.focus();
}
export default function ReportsPage(){
    const store=useReportsStore();
    const {title,description,observation,scope,projectCode,projectName,filters,sections,history,executiveSummary,setTitle,setDescription,setObservation,setScope,setProjectCode,setProjectName,setFilter,addSection,removeSection,moveSection,clearSections,updateSection,setExecutiveSummary,saveCurrentReport,loadReport,duplicateReport,deleteReport}=store;
    const [preview,setPreview]=useState(false),[historyOpen,setHistoryOpen]=useState(false),[customizeId,setCustomizeId]=useState<string|null>(null),[aiLoading,setAiLoading]=useState(false),[aiError,setAiError]=useState(""),[catalogSearch,setCatalogSearch]=useState("");
    const customize=sections.find(s=>s.id===customizeId)??null;
    const available=useMemo(()=>reportSectionCatalog.filter(c=>!sections.some(s=>s.type===c.type)).filter(c=>c.title.toLowerCase().includes(catalogSearch.toLowerCase())),[sections,catalogSearch]);
    async function aiSummary(){
        setAiLoading(true);setAiError("");
        try{
            const result=await generateReportExecutiveSummary({title,scope,projectCode,projectName,filters: { ...filters },sections:sections.map(s=>({title:s.title,description:s.description,selectedParts:s.selectedParts,snapshot:s.snapshot,observation:s.observation}))});
            setExecutiveSummary(result.summary);
        }catch(e){setAiError(e instanceof Error?e.message:"Failed to generate AI Executive Summary.");}finally{setAiLoading(false);}
    }
    const current: ReportExportData={title,description,observation,scope,projectCode,projectName,filters,sections,executiveSummary,createdAt:Date.now()};
    return <div className="mx-auto w-full max-w-[1500px]">
        <PageHeader eyebrow="INTELLIGENCE · REPORTS" title="Reports" description="Build a project or portfolio report from verified PAIMANA analytics snapshots." action={<div className="flex flex-wrap items-center justify-end gap-2"><span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">{sections.length} {sections.length===1?"section":"sections"}</span><Button variant="secondary" onClick={()=>setHistoryOpen(true)}><History size={15}/> History</Button>{sections.length>0&&<Button variant="secondary" onClick={clearSections}>Clear</Button>}<Button variant="secondary" onClick={saveCurrentReport} disabled={!sections.length}><Check size={15}/> Save Report</Button><Button variant="primary" onClick={()=>setPreview(true)} disabled={!sections.length}><Eye size={15}/> Preview</Button></div>}/>
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_390px]"><div className="space-y-5">
            <Card padding="lg" className="overflow-hidden">
                <div className="flex items-start gap-3 border-b border-slate-100 pb-5"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-900 text-white shadow-sm"><FileText size={18}/></div><div><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Report workspace</div><h2 className="mt-1 text-base font-bold text-slate-900">Report Details</h2><p className="mt-1 text-xs text-slate-500">Set the report identity and keep the selected project context clear.</p></div></div>
                <div className="mt-6 space-y-6">
                    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
                        <label><span className="mb-2 block text-[11px] font-bold text-slate-600">Report Title</span><input value={title} onChange={e=>setTitle(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-100" placeholder="e.g. Project Monitoring Report"/></label>
                        <div><span className="mb-2 block text-[11px] font-bold text-slate-600">Report Scope</span><div className="grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-1">{(["project","portfolio"] as ReportScope[]).map(s=><button key={s} type="button" onClick={()=>setScope(s)} className={`rounded-lg px-3 py-2.5 text-[11px] font-bold transition ${scope===s?"bg-slate-900 text-white shadow-sm":"text-slate-500 hover:bg-slate-200/70 hover:text-slate-800"}`}>{s==="project"?"Project":"Portfolio"}</button>)}</div></div>
                    </div>
                    <label><span className="mb-2 block text-[11px] font-bold text-slate-600">Description</span><textarea value={description} onChange={e=>setDescription(e.target.value)} rows={3} className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-100" placeholder="Briefly describe what this report covers..."/></label>
                    {scope==="project"&&<div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4"><div className="mb-3 flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-white text-[10px] font-bold text-slate-600 shadow-sm">ID</span><div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Project context</div><div className="text-xs font-semibold text-slate-700">Selected project for this report</div></div></div><div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1.5 block text-[10px] font-semibold text-slate-500">Project Code</span><input value={projectCode} onChange={e=>setProjectCode(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100" placeholder="Project code"/></label><label><span className="mb-1.5 block text-[10px] font-semibold text-slate-500">Project Name</span><input value={projectName} onChange={e=>setProjectName(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100" placeholder="Project name"/></label></div></div>}
                    {scope==="portfolio"&&<div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4"><div className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Portfolio filters</div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{([["ministry","Ministry"],["sector","Sector"],["state","State / UT"],["riskLevel","Risk Level"],["projectStatus","Project Status"],["dateMonth","Date / Month"]] as Array<[keyof typeof filters,string]>).map(([k,l])=><label key={k}><span className="mb-1.5 block text-[10px] font-semibold text-slate-500">{l}</span><input value={filters[k]} onChange={e=>setFilter(k,e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100" placeholder={l}/></label>)}</div></div>}
                    <label><span className="mb-2 block text-[11px] font-bold text-slate-600">Report Observation / Note</span><div className="relative"><textarea value={observation} onChange={e=>setObservation(e.target.value)} rows={3} className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm leading-6 text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-100" placeholder="Add an observation, officer note, or context for this report..."/><span className="pointer-events-none absolute bottom-2 right-3 text-[9px] text-slate-300">Optional</span></div></label>
                </div>
            </Card>
            <Card padding="lg"><div className="flex items-center justify-between"><div><h2 className="text-sm font-bold text-slate-900">Report Sections</h2><p className="mt-1 text-[11px] text-slate-400">Reorder, customize and remove captured sections.</p></div><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{sections.length} selected</span></div>
                <div className="mt-5 space-y-2">{sections.length===0?<div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-10 text-center text-xs text-slate-400">No sections added yet. Use Save to Report from an analytics section or add a verified section from the right.</div>:sections.map((s,i)=><div key={s.id} className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-center gap-3"><GripVertical size={15} className="text-slate-300"/><div className="min-w-0 flex-1"><div className="truncate text-xs font-bold text-slate-800">{i+1}. {s.title}</div><div className="mt-1 text-[10px] text-slate-400">{s.description} · {new Date(s.capturedAt??s.addedAt).toLocaleString("en-IN")}</div></div><div className="flex gap-1"><button type="button" disabled={!i} onClick={()=>moveSection(s.id,"up")} className="icon-btn"><ArrowUp size={14}/></button><button type="button" disabled={i===sections.length-1} onClick={()=>moveSection(s.id,"down")} className="icon-btn"><ArrowDown size={14}/></button><button type="button" onClick={()=>setCustomizeId(s.id)} className="icon-btn"><Pencil size={14}/></button><button type="button" onClick={()=>removeSection(s.id)} className="icon-btn"><Trash2 size={14}/></button></div></div><div className="mt-2 flex flex-wrap gap-1.5 pl-7">{(s.selectedParts??defaultReportParts).map(p=><span key={p} className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-semibold text-slate-500">{partLabel(p)}</span>)}</div>{s.observation&&<div className="mt-2 rounded-lg bg-slate-50 p-2 text-[10px] text-slate-600">{s.observation}</div>}</div>)}</div>
            </Card>
            <Card padding="lg"><div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-bold text-slate-900">AI Executive Summary</h2><p className="mt-1 text-[11px] text-slate-400">Key findings, major risks, changes and recommended actions from selected evidence.</p></div><Button variant="secondary" onClick={aiSummary} disabled={!sections.length||aiLoading}><Sparkles size={15}/>{aiLoading?"Generating...":"Generate Summary"}</Button></div>{aiError&&<div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{aiError}</div>}{executiveSummary?<div className="mt-4 whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-6 text-slate-700">{executiveSummary}</div>:<div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-5 text-xs text-slate-400">No AI summary generated yet.</div>}</Card>
        </div>
        <aside className="space-y-5"><Card padding="lg"><h2 className="text-sm font-bold text-slate-900">Add to Report</h2><p className="mt-1 text-[11px] text-slate-400">Only verified report section types are available here.</p><input value={catalogSearch} onChange={e=>setCatalogSearch(e.target.value)} placeholder="Search sections..." className="field mt-4"/><div className="mt-4 space-y-2">{available.map(s=><button key={s.type} type="button" onClick={()=>addSection({id:s.type+"-"+Date.now(),...s})} className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-left hover:bg-slate-50"><span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-500"><Plus size={15}/></span><span><span className="block text-xs font-bold text-slate-800">{s.title}</span><span className="mt-0.5 block text-[10px] text-slate-400">{s.description}</span></span></button>)}</div></Card>
            <Card padding="lg" className="border-slate-200 bg-slate-50/60"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Export</div><div className="mt-2 text-sm font-bold text-slate-800">Official report outputs</div><div className="mt-3 grid gap-2"><Button variant="secondary" disabled={!sections.length} onClick={()=>exportXlsx(current)}><Download size={15}/> Excel (.xlsx)</Button><Button variant="secondary" disabled={!sections.length} onClick={()=>printReport(current)}><Printer size={15}/> PDF / Print</Button><Button variant="primary" disabled={!sections.length} onClick={()=>setPreview(true)}><Eye size={15}/> Preview</Button></div><p className="mt-3 text-[10px] leading-4 text-slate-400">PDF opens a print-ready report; choose “Save as PDF” in the browser dialog.</p></Card>
        </aside></div>

        {customize&&<div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/40 p-4" onMouseDown={()=>setCustomizeId(null)}><div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={e=>e.stopPropagation()}><div className="flex items-start justify-between"><div><h3 className="text-base font-bold text-slate-900">Customize Section</h3><p className="mt-1 text-xs text-slate-400">{customize.title}</p></div><button type="button" onClick={()=>setCustomizeId(null)} className="icon-btn"><X size={16}/></button></div><div className="mt-5 grid grid-cols-2 gap-2">{defaultReportParts.map(p=>{const selected=(customize.selectedParts??defaultReportParts).includes(p);return <button key={p} type="button" onClick={()=>{const currentParts=customize.selectedParts??defaultReportParts;const next=selected?currentParts.filter(x=>x!==p):[...currentParts,p];updateSection(customize.id,{selectedParts:next.length?next:["summary"]});}} className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-xs font-semibold ${selected?"border-slate-400 bg-slate-100 text-slate-900":"border-slate-200 text-slate-500"}`}>{selected?<Check size={14}/>:<Plus size={14}/>} {partLabel(p)}</button>})}</div><label className="mt-5 block"><span className="label">Section Observation / Comment</span><textarea value={customize.observation??""} onChange={e=>updateSection(customize.id,{observation:e.target.value})} rows={4} className="field py-2.5" placeholder="Add an observation/comment..."/></label><div className="mt-5 flex justify-end"><Button variant="primary" onClick={()=>setCustomizeId(null)}>Done</Button></div></div></div>}

        {preview&&<div className="fixed inset-0 z-[90] overflow-y-auto bg-slate-950/50 p-4 md:p-8" onMouseDown={()=>setPreview(false)}><div className="mx-auto max-w-5xl rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={e=>e.stopPropagation()}><div className="flex items-start justify-between border-b border-slate-200 pb-4"><div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{scope==="project"?"Project Report":"Portfolio Report"}</div><h2 className="mt-1 text-xl font-bold text-slate-900">{title}</h2><p className="mt-1 text-xs text-slate-500">{projectName||projectCode||description}</p></div><div className="flex gap-2"><Button variant="secondary" onClick={()=>printReport(current)}><Printer size={15}/> PDF / Print</Button><button type="button" onClick={()=>setPreview(false)} className="icon-btn"><X size={16}/></button></div></div>{executiveSummary&&<div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">AI Executive Summary</div><div className="mt-2 whitespace-pre-wrap text-xs leading-6 text-slate-700">{executiveSummary}</div></div>}<div className="mt-5 space-y-4">{sections.map((s,i)=><div key={s.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"><div className="flex items-start justify-between"><div><div className="text-xs font-bold text-slate-900">{i+1}. {s.title}</div><div className="mt-1 text-[10px] text-slate-400">{s.description}</div></div><span className="text-[9px] text-slate-400">{new Date(s.capturedAt??s.addedAt).toLocaleString("en-IN")}</span></div><div className="mt-3"><SnapshotValue value={s.snapshot}/></div>{s.observation&&<div className="mt-3 rounded-lg bg-white p-3 text-xs text-slate-600"><b>Observation:</b> {s.observation}</div>}</div>)}</div></div></div>}

        {historyOpen&&<div className="fixed inset-0 z-[90] overflow-y-auto bg-slate-950/50 p-4 md:p-8" onMouseDown={()=>setHistoryOpen(false)}><div className="mx-auto max-w-4xl rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={e=>e.stopPropagation()}><div className="flex items-center justify-between border-b border-slate-200 pb-4"><div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Saved Reports</div><h2 className="mt-1 text-lg font-bold text-slate-900">Report History</h2></div><button type="button" onClick={()=>setHistoryOpen(false)} className="icon-btn"><X size={16}/></button></div><div className="mt-4 space-y-2">{history.length===0?<div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-xs text-slate-400">No saved reports yet.</div>:history.map(r=><div key={r.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><div className="text-xs font-bold text-slate-800">{r.title}</div><div className="mt-1 text-[10px] text-slate-400">{r.scope==="project"?"Project":"Portfolio"} · {r.sections.length} sections · {new Date(r.createdAt).toLocaleString("en-IN")}</div></div><div className="flex flex-wrap gap-1.5"><Button variant="secondary" size="sm" onClick={()=>{loadReport(r.id);setHistoryOpen(false)}}><Eye size={13}/> View</Button><Button variant="secondary" size="sm" onClick={()=>exportXlsx(r)}><Download size={13}/> Download</Button><Button variant="secondary" size="sm" onClick={()=>duplicateReport(r.id)}><Copy size={13}/> Duplicate</Button><Button variant="ghost" size="sm" onClick={()=>deleteReport(r.id)}><Trash2 size={13}/> Delete</Button></div></div></div>)}</div></div></div>}
    </div>;
}

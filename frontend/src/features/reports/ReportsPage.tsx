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

function humanLabel(key: string): string {
    return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function shortValue(value: unknown): string {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "number") return Number.isFinite(value) ? value.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "string") return value;
    return "—";
}

function collectPrimitiveRows(value: unknown, prefix = ""): Array<[string, string]> {
    if (value === null || value === undefined || value === "") return prefix ? [[humanLabel(prefix), "—"]] : [];
    if (Array.isArray(value)) return [];
    if (typeof value !== "object") return prefix ? [[humanLabel(prefix), shortValue(value)]] : [];
    return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => {
        const path = prefix ? prefix + "_" + key : key;
        if (Array.isArray(item) || (item && typeof item === "object")) return collectPrimitiveRows(item, path);
        return [[humanLabel(path), shortValue(item)]];
    });
}

function uniqueRows(rows: Array<[string, string]>): Array<[string, string]> {
    const seen = new Set<string>();
    return rows.filter(([label, value]) => {
        const key = label + "|" + value;
        if (seen.has(key) || value === "—") return false;
        seen.add(key);
        return true;
    });
}

function sectionRows(section: SavedReport["sections"][number]): Array<[string, string]> {
    const snapshot = section.snapshot as Record<string, unknown>;
    const preferred = section.type === "overview" ? ["project", "key_facts"]
        : section.type === "risk" ? ["risk", "selectedRiskScore", "selectedRiskLevel"]
        : section.type === "cost" ? ["project", "key_facts", "cost_risk"]
        : section.type === "schedule" ? ["project", "key_facts", "risk", "delay_reasons"]
        : section.type === "prediction" ? ["project_code", "project_name", "scenario_inputs", "result"]
        : section.type === "recommendations" ? ["delay_reasons"]
        : Object.keys(snapshot);
    const rows: Array<[string, string]> = [];
    preferred.forEach((key) => {
        if (key in snapshot) rows.push(...collectPrimitiveRows(snapshot[key], key));
    });
    return uniqueRows(rows);
}

function trendTableRows(section: SavedReport["sections"][number]): Array<Record<string, string>> {
    const snapshot = section.snapshot as Record<string, unknown>;
    const arrays = Object.entries(snapshot).filter(([, value]) => Array.isArray(value)) as Array<[string, unknown[]]>;
    const source = arrays.find(([, value]) => value.length && value.every((item) => item && typeof item === "object"))?.[1];
    if (!source) return [];
    return source.map((item) => Object.fromEntries(collectPrimitiveRows(item).map(([label, value]) => [label, value])));
}

function exportXlsx(report: ReportExportData) {
    const wb = XLSX.utils.book_new();
    const createdAt = "createdAt" in report ? new Date(report.createdAt ?? Date.now()).toLocaleString("en-IN") : new Date().toLocaleString("en-IN");
    const overview: any[][] = [
        ["PAIMANA PROJECT REPORT"],
        [report.title || "Project Monitoring Report"],
        ["Generated", createdAt],
        [],
        ["PROJECT IDENTITY"],
        ["Project Code", report.projectCode || "—"],
        ["Project Name", report.projectName || "—"],
        ["Report Type", report.scope === "project" ? "Project Report" : "Portfolio Report"],
        ["Description", report.description || "—"],
    ];
    if (report.scope === "portfolio") overview.push([], ["REPORT FILTERS"], ...Object.entries(report.filters).map(([k, v]) => [humanLabel(k), v || "—"]));
    report.sections.filter((s) => ["overview","risk","cost","schedule","prediction","recommendations"].includes(s.type)).forEach((s) => {
        const rows = sectionRows(s);
        if (!rows.length) return;
        overview.push([], [s.title.toUpperCase()]);
        rows.forEach(([label, value]) => overview.push([label, value]));
        if (s.observation) overview.push(["Officer Observation", s.observation]);
    });
    if (report.executiveSummary) overview.push([], ["AI EXECUTIVE SUMMARY"], [report.executiveSummary]);
    if (report.observation) overview.push([], ["REPORT OBSERVATION"], [report.observation]);
    const overviewWs = XLSX.utils.aoa_to_sheet(overview);
    overviewWs["!merges"] = [{ s:{r:0,c:0}, e:{r:0,c:1} }, { s:{r:1,c:0}, e:{r:1,c:1} }];
    overviewWs["!cols"] = [{wch:30},{wch:88}];
    overviewWs["!rows"] = [{hpt:28},{hpt:24}];
    XLSX.utils.book_append_sheet(wb, overviewWs, "Project Overview");

    const detailRows: any[][] = [["SECTION","POINT","VALUE","CAPTURED AT","OBSERVATION"]];
    report.sections.forEach((s) => {
        const rows = sectionRows(s);
        if (!rows.length) detailRows.push([s.title,"Section","No structured values captured",new Date(s.capturedAt ?? s.addedAt).toLocaleString("en-IN"),s.observation || ""]);
        else rows.forEach(([label,value]) => detailRows.push([s.title,label,value,new Date(s.capturedAt ?? s.addedAt).toLocaleString("en-IN"),s.observation || ""]));
    });
    const detailWs = XLSX.utils.aoa_to_sheet(detailRows);
    detailWs["!cols"] = [{wch:28},{wch:34},{wch:72},{wch:24},{wch:44}];
    detailWs["!freeze"] = "A2";
    detailWs["!autofilter"] = {ref:"A1:E" + detailRows.length};
    XLSX.utils.book_append_sheet(wb, detailWs, "Detailed Analysis");

    const trendRows: any[][] = [["SECTION","ROW","FIELD","VALUE"]];
    report.sections.filter((s) => s.type === "trends" || s.type === "prediction").forEach((s) => {
        const rows = trendTableRows(s);
        if (rows.length) rows.forEach((row,index) => Object.entries(row).forEach(([field,value]) => trendRows.push([s.title,index+1,field,value])));
        else sectionRows(s).forEach(([field,value]) => trendRows.push([s.title,"",field,value]));
    });
    const trendWs = XLSX.utils.aoa_to_sheet(trendRows);
    trendWs["!cols"] = [{wch:28},{wch:10},{wch:38},{wch:60}];
    trendWs["!freeze"] = "A2";
    trendWs["!autofilter"] = {ref:"A1:D" + trendRows.length};
    XLSX.utils.book_append_sheet(wb, trendWs, "Trends & Simulation");

    const appendixRows: any[][] = [["SECTION","FIELD / PATH","VALUE","CAPTURED AT"]];
    report.sections.forEach((s) => flattenSnapshot(s.snapshot).forEach(([path,value]) => appendixRows.push([s.title,path,value,new Date(s.capturedAt ?? s.addedAt).toLocaleString("en-IN")]));
    const appendixWs = XLSX.utils.aoa_to_sheet(appendixRows);
    appendixWs["!cols"] = [{wch:28},{wch:64},{wch:76},{wch:24}];
    appendixWs["!freeze"] = "A2";
    appendixWs["!autofilter"] = {ref:"A1:D" + appendixRows.length};
    XLSX.utils.book_append_sheet(wb, appendixWs, "Technical Appendix");
    XLSX.writeFileXLSX(wb,(report.title||"PAIMANA_Report").replace(/[^a-z0-9_-]+/gi,"_")+".xlsx",{compression:true});
}

function htmlMetric(label: string, value: string): string {
    return '<div class="metric"><div class="metric-label">' + escapeHtml(label) + '</div><div class="metric-value">' + escapeHtml(value) + '</div></div>';
}
function htmlRows(rows: Array<[string,string]>): string {
    if (!rows.length) return '<div class="empty">No structured data captured for this section.</div>';
    return '<div class="facts">' + rows.map(([label,value]) => '<div class="fact"><div class="fact-label">' + escapeHtml(label) + '</div><div class="fact-value">' + escapeHtml(value) + '</div></div>').join("") + '</div>';
}

function printReport(report: ReportExportData) {
    const sections = report.sections;
    const overview = sections.find((s) => s.type === "overview");
    const risk = sections.find((s) => s.type === "risk");
    const cost = sections.find((s) => s.type === "cost");
    const schedule = sections.find((s) => s.type === "schedule");
    const metrics = [...(risk ? sectionRows(risk).filter(([l]) => /risk score|risk level|delay probability|progress stall/i.test(l)).slice(0,4) : []), ...(cost ? sectionRows(cost).filter(([l]) => /original cost|revised cost|expenditure|cost risk/i.test(l)).slice(0,4) : []), ...(schedule ? sectionRows(schedule).filter(([l]) => /delay days|physical progress|schedule status|completion/i.test(l)).slice(0,4) : [])].slice(0,8);
    const sectionHtml = sections.filter((s) => s.type !== "overview").map((s,i) => {
        const rows = sectionRows(s);
        const trendRows = trendTableRows(s);
        let table = "";
        if (trendRows.length) {
            const keys = Object.keys(trendRows[0]).slice(0,8);
            table = '<div class="table-wrap"><table><thead><tr>' + keys.map((k) => '<th>' + escapeHtml(k) + '</th>').join("") + '</tr></thead><tbody>' + trendRows.slice(0,40).map((row) => '<tr>' + keys.map((k) => '<td>' + escapeHtml(row[k] || "—") + '</td>').join("") + '</tr>').join("") + '</tbody></table></div>' + (trendRows.length > 40 ? '<div class="muted">Showing first 40 trend rows. Complete captured values are retained in the Excel Technical Appendix.</div>' : "");
        }
        return '<section class="page-section"><div class="section-kicker">' + String(i+2).padStart(2,"0") + ' · ANALYSIS</div><h2>' + escapeHtml(s.title) + '</h2><p class="section-description">' + escapeHtml(s.description) + '</p>' + htmlRows(rows) + table + (s.observation ? '<div class="note"><b>Officer observation</b><br>' + escapeHtml(s.observation) + '</div>' : '') + '</section>';
    }).join("");
    const executive = report.executiveSummary ? '<section class="page-section"><div class="section-kicker">EXECUTIVE SUMMARY</div><h2>Key Findings & Actions</h2><div class="ai-summary">' + escapeHtml(report.executiveSummary) + '</div></section>' : "";
    const overviewHtml = '<section class="page-section overview-page"><div class="brand">PAIMANA <span>· PROJECT MONITORING REPORT</span></div><div class="section-kicker">01 · PROJECT OVERVIEW</div><h1>' + escapeHtml(report.title || "Project Monitoring Report") + '</h1><p class="lead">' + escapeHtml(report.projectName || report.projectCode || report.description || "Selected project analysis") + '</p><div class="identity">' + htmlRows([["Project Code",report.projectCode||"—"],["Project Name",report.projectName||"—"],["Report Type",report.scope==="project"?"Project Report":"Portfolio Report"],["Generated",new Date(report.createdAt??Date.now()).toLocaleString("en-IN")]]) + '</div>' + (metrics.length ? '<div class="metrics">' + metrics.map(([l,v]) => htmlMetric(l,v)).join("") + '</div>' : '') + (overview ? '<h3>Project Details</h3>' + htmlRows(sectionRows(overview)) : '') + (report.description ? '<div class="note"><b>Report scope</b><br>' + escapeHtml(report.description) + '</div>' : '') + (report.observation ? '<div class="note"><b>Officer observation</b><br>' + escapeHtml(report.observation) + '</div>' : '') + '</section>';
    const popup = window.open("","_blank","noopener,noreferrer,width=1100,height=850");
    if (!popup) { window.print(); return; }
    const css = '@page{size:A4;margin:14mm 14mm 16mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#17202a;background:#fff;margin:0;line-height:1.45;font-size:10.5pt}.report{max-width:900px;margin:0 auto}.brand{font-size:10px;font-weight:800;letter-spacing:.14em;color:#475467;margin-bottom:28px}.brand span{font-weight:600;color:#98a2b3}.section-kicker{font-size:9px;font-weight:800;letter-spacing:.16em;color:#667085;text-transform:uppercase;margin-bottom:7px}h1{font-size:25px;line-height:1.18;margin:0 0 7px;color:#101828}h2{font-size:18px;margin:0 0 6px;color:#101828}h3{font-size:12px;margin:22px 0 9px;color:#344054;text-transform:uppercase;letter-spacing:.06em}.lead{font-size:12px;color:#667085;margin:0 0 20px}.section-description,.muted{font-size:9px;color:#667085}.identity,.facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;background:#e4e7ec;border:1px solid #e4e7ec;border-radius:9px;overflow:hidden}.fact{background:#fff;padding:9px 11px;min-height:43px}.fact-label,.metric-label{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#98a2b3}.fact-value{font-size:10px;color:#344054;margin-top:3px;word-break:break-word}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:16px 0}.metric{border:1px solid #e4e7ec;border-radius:9px;padding:10px;background:#fafafa;min-height:65px}.metric-value{font-size:14px;font-weight:800;color:#101828;margin-top:5px}.page-section{padding:0 0 20px;margin-bottom:20px;border-bottom:1px solid #eaecf0}.overview-page{min-height:245mm}.note{margin-top:12px;padding:10px 12px;border-left:3px solid #667085;background:#f8f9fb;border-radius:5px;font-size:9.5px;color:#475467}.ai-summary{white-space:pre-wrap;border:1px solid #d0d5dd;background:#fafafa;border-radius:9px;padding:14px;font-size:10px}.table-wrap{margin-top:14px;overflow:hidden;border:1px solid #e4e7ec;border-radius:8px}table{width:100%;border-collapse:collapse;font-size:8px}th{background:#f2f4f7;color:#475467;text-align:left;font-weight:800;padding:7px;border-bottom:1px solid #d0d5dd}td{padding:6px 7px;border-bottom:1px solid #eaecf0;color:#344054;vertical-align:top}.no-print{position:fixed;right:20px;top:20px;border:0;border-radius:8px;background:#101828;color:#fff;padding:10px 14px;font-weight:700;cursor:pointer}@media print{.no-print{display:none}.overview-page{break-after:page}}';
    popup.document.write('<!doctype html><html><head><title>' + escapeHtml(report.title || "PAIMANA Project Report") + '</title><style>' + css + '</style></head><body><button class="no-print" onclick="window.print()">Print / Save as PDF</button><main class="report">' + overviewHtml + executive + sectionHtml + '</main></body></html>');
    popup.document.close();
    popup.focus();
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

import { ArrowDown, ArrowUp, Check, Copy, Download, Eye, FileText, GripVertical, History, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import PageHeader from "../../components/layout/PageHeader";
import { defaultReportParts, reportSectionCatalog, useReportsStore, type ReportPart, type ReportScope, type SavedReport } from "./reportsStore";
import { generateReportExecutiveSummary } from "../../services/api";

type ReportExportData = Pick<SavedReport, "title" | "description" | "observation" | "scope" | "projectCode" | "projectName" | "filters" | "sections" | "executiveSummary"> & { createdAt?: number };

function SnapshotValue({ value }: { value: unknown }) {
    if (value === null || value === undefined) return <span className="text-slate-400">—</span>;
    if (["string","number","boolean"].includes(typeof value)) return <span>{String(value)}</span>;
    if (Array.isArray(value)) return value.length ? <div className="space-y-2">{value.map((item,i)=><div key={i} className="rounded-lg border border-slate-200 bg-white p-3"><SnapshotValue value={item}/></div>)}</div> : <span className="text-slate-400">No data</span>;
    return <div className="grid gap-2 sm:grid-cols-2">{Object.entries(value as Record<string,unknown>).map(([key,item])=><div key={key} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{key.replace(/_/g," ")}</div><div className="mt-1 break-words text-xs text-slate-700"><SnapshotValue value={item}/></div></div>)}</div>;
}
function partLabel(part: ReportPart) {
    return ({summary:"Summary",risk_breakdown:"Risk Breakdown",contributing_factors:"Contributing Factors",chart:"Chart",table:"Table",recommendations:"Recommendations"} as Record<ReportPart,string>)[part];
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


function findMetric(rows: Array<[string, string]>, patterns: RegExp[]): [string, string] | null {
    return rows.find(([label, value]) => patterns.some((pattern) => pattern.test(label)) && value !== "—") ?? null;
}
function numericValue(value: string): number | null {
    const match = value.replace(/,/g, "").replace(/₹/g, "").match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
}
function chartRowsForSection(section: SavedReport["sections"][number]): Array<[string, number]> {
    const rows = sectionRows(section);
    const candidates = section.type === "risk"
        ? [["Cost Risk", /cost risk/i], ["Future Delay", /future delay|delay probability/i], ["Progress Stall", /progress stall/i]]
        : section.type === "cost"
            ? [["Original Cost", /original cost/i], ["Revised Cost", /revised cost/i], ["Expenditure", /expenditure/i]]
            : [];
    return candidates.map(([label, pattern]) => {
        const found = findMetric(rows, [pattern as RegExp]);
        return [label as string, found ? (numericValue(found[1]) ?? 0) : NaN] as [string, number];
    }).filter(([, value]) => Number.isFinite(value));
}
function writeTable(pdf: jsPDF, headers: string[], rows: string[][], x: number, y: number, widths: number[], fontSize = 7.2): number {
    const pageHeight = pdf.internal.pageSize.getHeight();
    const totalWidth = widths.reduce((a, b) => a + b, 0);
    const rowHeight = 7.5;
    let cursorY = y;
    const drawRow = (values: string[], header = false) => {
        let cursorX = x;
        pdf.setFillColor(header ? 239 : 255, header ? 242 : 255, header ? 246 : 255);
        pdf.setDrawColor(220, 225, 231);
        pdf.rect(x, cursorY, totalWidth, rowHeight, "FD");
        values.forEach((value, index) => {
            const cellWidth = widths[index];
            pdf.setFont("helvetica", header ? "bold" : "normal");
            pdf.setFontSize(fontSize);
            pdf.setTextColor(header ? 51 : 67, header ? 65 : 78, header ? 85 : 92);
            pdf.text(pdf.splitTextToSize(String(value || "—"), cellWidth - 4).slice(0, 2), cursorX + 2, cursorY + 4.6);
            cursorX += cellWidth;
            if (index < values.length - 1) pdf.line(cursorX, cursorY, cursorX, cursorY + rowHeight);
        });
        cursorY += rowHeight;
    };
    drawRow(headers, true);
    rows.forEach((row) => {
        if (cursorY + rowHeight > pageHeight - 18) {
            pdf.addPage();
            cursorY = 16;
            drawRow(headers, true);
        }
        drawRow(row);
    });
    return cursorY;
}
function drawBarChart(pdf: jsPDF, title: string, items: Array<[string, number]>, x: number, y: number, width: number, height: number, suffix = ""): number {
    if (!items.length) return y;
    const max = Math.max(...items.map(([, value]) => value), 1);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(51, 65, 85);
    pdf.text(title, x, y);
    const top = y + 6;
    const labelWidth = 34;
    const barWidth = width - labelWidth - 18;
    const gap = 7;
    const barHeight = Math.min(9, Math.max(5, (height - 12 - (items.length - 1) * gap) / items.length));
    items.forEach(([label, value], index) => {
        const yy = top + index * (barHeight + gap);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(6.8);
        pdf.setTextColor(71, 84, 103);
        pdf.text(label.slice(0, 22), x, yy + barHeight - 1);
        pdf.setFillColor(235, 239, 243);
        pdf.roundedRect(x + labelWidth, yy, barWidth, barHeight, 1.2, 1.2, "F");
        pdf.setFillColor(71, 85, 105);
        pdf.roundedRect(x + labelWidth, yy, Math.max(1, barWidth * Math.max(0, value) / max), barHeight, 1.2, 1.2, "F");
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(6.8);
        pdf.setTextColor(51, 65, 85);
        pdf.text(String(value.toFixed(1)) + suffix, x + labelWidth + barWidth + 2, yy + barHeight - 1);
    });
    return top + items.length * (barHeight + gap) + 2;
}
function drawLineChart(pdf: jsPDF, title: string, points: Array<[string, number]>, x: number, y: number, width: number, height: number): number {
    if (points.length < 2) return y;
    const values = points.map(([, value]) => value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const left = x + 12;
    const top = y + 8;
    const chartWidth = width - 18;
    const chartHeight = height - 22;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(51, 65, 85);
    pdf.text(title, x, y);
    pdf.setDrawColor(210, 216, 223);
    pdf.line(left, top, left, top + chartHeight);
    pdf.line(left, top + chartHeight, left + chartWidth, top + chartHeight);
    const coords = points.map(([, value], index) => {
        const px = left + (index / (points.length - 1)) * chartWidth;
        const py = top + chartHeight - ((value - min) / range) * chartHeight;
        return [px, py] as [number, number];
    });
    pdf.setDrawColor(71, 85, 105);
    coords.slice(1).forEach((point, index) => pdf.line(coords[index][0], coords[index][1], point[0], point[1]));
    coords.forEach(([px, py], index) => {
        pdf.setFillColor(71, 85, 105);
        pdf.circle(px, py, 1.3, "F");
        if (index === 0 || index === points.length - 1 || points.length <= 6) {
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(5.7);
            pdf.setTextColor(100, 112, 128);
            pdf.text(points[index][0].slice(0, 12), px, top + chartHeight + 7, { align: "center" });
        }
    });
    return top + chartHeight + 15;
}

function exportXlsx(report: ReportExportData) {
    const wb = XLSX.utils.book_new();
    const generated = new Date(report.createdAt ?? Date.now()).toLocaleString("en-IN");
    const overview: any[][] = [
        ["PAIMANA", "PROJECT MONITORING REPORT"],
        ["Report Title", report.title || "Project Monitoring Report"],
        ["Generated", generated],
        ["Report Type", report.scope === "project" ? "Project Report" : "Portfolio Report"],
        [],
        ["PROJECT IDENTITY", ""],
        ["Project Code", report.projectCode || "—"],
        ["Project Name", report.projectName || "—"],
    ];
    const overviewSection = report.sections.find((s) => s.type === "overview");
    const risk = report.sections.find((s) => s.type === "risk");
    const cost = report.sections.find((s) => s.type === "cost");
    const schedule = report.sections.find((s) => s.type === "schedule");
    const progress = report.sections.find((s) => s.type === "progress");
    const facts: Array<[string, string]> = [
        ...(overviewSection ? sectionRows(overviewSection).filter(([l]) => /ministry|sector|state|implementing agency|schedule status|original completion|revised completion/i.test(l)) : []),
        ...(risk ? sectionRows(risk).filter(([l]) => /risk score|risk level|cost risk|future delay|progress stall/i.test(l)) : []),
        ...(cost ? sectionRows(cost).filter(([l]) => /original cost|revised cost|expenditure/i.test(l)) : []),
        ...(schedule ? sectionRows(schedule).filter(([l]) => /delay|completion|schedule status|physical progress/i.test(l)) : []),
        ...(progress ? sectionRows(progress) : []),
    ];
    uniqueRows(facts).forEach(([label, value]) => overview.push([humanLabel(label), value]));
    if (report.observation) overview.push([], ["OFFICER OBSERVATION", report.observation]);
    if (report.executiveSummary) overview.push([], ["EXECUTIVE SUMMARY", report.executiveSummary]);
    const overviewWs = XLSX.utils.aoa_to_sheet(overview);
    overviewWs["!cols"] = [{ wch: 30 }, { wch: 95 }];
    overviewWs["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
    overviewWs["!freeze"] = "A7";
    XLSX.utils.book_append_sheet(wb, overviewWs, "Overview");

    const analysis: any[][] = [["SECTION", "INDICATOR / ITEM", "VALUE", "CAPTURED AT", "OBSERVATION"]];
    report.sections.forEach((section) => {
        const captured = new Date(section.capturedAt ?? section.addedAt).toLocaleString("en-IN");
        const rows = sectionRows(section);
        rows.forEach(([label, value]) => analysis.push([section.title, humanLabel(label), value, captured, section.observation || ""]));
        trendTableRows(section).forEach((row, index) => Object.entries(row).forEach(([field, value]) => analysis.push([section.title + " · Row " + (index + 1), humanLabel(field), value, captured, section.observation || ""])));
    });
    if (report.scope === "portfolio") {
        Object.entries(report.filters).forEach(([key, value]) => analysis.push(["Portfolio Filter", humanLabel(key), value || "—", "", ""]));
    }
    const analysisWs = XLSX.utils.aoa_to_sheet(analysis);
    analysisWs["!cols"] = [{ wch: 30 }, { wch: 38 }, { wch: 65 }, { wch: 24 }, { wch: 42 }];
    analysisWs["!freeze"] = "A2";
    analysisWs["!autofilter"] = { ref: "A1:E" + analysis.length };
    XLSX.utils.book_append_sheet(wb, analysisWs, "Analysis");
    XLSX.writeFileXLSX(wb, (report.title || "PAIMANA_Project_Report").replace(/[^a-z0-9_-]+/gi, "_") + ".xlsx", { compression: true });
}

function downloadPdf(report: ReportExportData) {
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;
    let y = margin;
    const pageBreak = (needed = 12) => {
        if (y + needed > pageHeight - 17) {
            pdf.addPage();
            y = margin;
        }
    };
    const heading = (title: string, subtitle: string) => {
        pageBreak(18);
        pdf.setDrawColor(218, 224, 230);
        pdf.line(margin, y, pageWidth - margin, y);
        y += 6;
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(7);
        pdf.setTextColor(100, 112, 128);
        pdf.text(subtitle.toUpperCase(), margin, y);
        y += 5;
        pdf.setFontSize(14);
        pdf.setTextColor(20, 30, 43);
        pdf.text(pdf.splitTextToSize(title, contentWidth), margin, y);
        y += 7;
    };
    const paragraph = (text: string, size = 8.5) => {
        if (!text) return;
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(size);
        pdf.setTextColor(55, 68, 84);
        const lines = pdf.splitTextToSize(text, contentWidth);
        pageBreak(lines.length * 4 + 3);
        pdf.text(lines, margin, y);
        y += lines.length * 4 + 3;
    };
    const keyValueTable = (rows: Array<[string, string]>) => {
        if (!rows.length) return;
        const split = Math.ceil(rows.length / 2);
        const left = rows.slice(0, split);
        const right = rows.slice(split);
        const tableRows = Array.from({ length: Math.max(left.length, right.length) }, (_, i) => [
            left[i]?.[0] ?? "", left[i]?.[1] ?? "", right[i]?.[0] ?? "", right[i]?.[1] ?? "",
        ]);
        pageBreak(Math.min(60, 10 + tableRows.length * 7.5));
        y = writeTable(pdf, ["Indicator", "Value", "Indicator", "Value"], tableRows, margin, y, [39, 43, 39, 43]);
        y += 4;
    };

    const overview = report.sections.find((s) => s.type === "overview");
    const risk = report.sections.find((s) => s.type === "risk");
    const cost = report.sections.find((s) => s.type === "cost");
    const schedule = report.sections.find((s) => s.type === "schedule");
    const trends = report.sections.find((s) => s.type === "trends");
    const simulation = report.sections.find((s) => s.type === "prediction");
    const recommendation = report.sections.find((s) => s.type === "recommendations");

    pdf.setProperties({ title: report.title || "PAIMANA Project Monitoring Report", subject: "PAIMANA Project Monitoring Report", author: "PAIMANA", creator: "PAIMANA" });
    pdf.setFillColor(30, 36, 43);
    pdf.rect(0, 0, pageWidth, 9, "F");
    y = 19;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(82, 97, 115);
    pdf.text("PAIMANA  |  PROJECT MONITORING & ANALYTICS", margin, y);
    y += 10;
    pdf.setFontSize(20);
    pdf.setTextColor(20, 30, 43);
    pdf.text(pdf.splitTextToSize(report.title || "Project Monitoring Report", contentWidth), margin, y);
    y += 9;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(92, 104, 119);
    pdf.text(pdf.splitTextToSize(report.projectName || "Selected project", contentWidth), margin, y);
    y += 9;
    keyValueTable([
        ["Project Code", report.projectCode || "—"],
        ["Report Type", report.scope === "project" ? "Project Report" : "Portfolio Report"],
        ["Generated", new Date(report.createdAt ?? Date.now()).toLocaleString("en-IN")],
    ]);

    heading("Project Overview", "01 · Project identity & current position");
    if (overview) keyValueTable(sectionRows(overview).filter(([label]) => !/project code|project name/i.test(label)).slice(0, 20));

    const indicatorRows: Array<[string, string]> = [];
    if (risk) sectionRows(risk).filter(([label]) => /risk score|risk level|cost risk|future delay|progress stall/i.test(label)).forEach((r) => indicatorRows.push(r));
    if (cost) sectionRows(cost).filter(([label]) => /original cost|revised cost|expenditure/i.test(label)).forEach((r) => indicatorRows.push(r));
    if (schedule) sectionRows(schedule).filter(([label]) => /delay|physical progress|completion|schedule status/i.test(label)).forEach((r) => indicatorRows.push(r));
    const indicators = uniqueRows(indicatorRows).slice(0, 12);
    if (indicators.length) {
        heading("Key Monitoring Indicators", "Current captured position");
        keyValueTable(indicators);
    }

    if (risk) {
        heading("Risk Assessment", "02 · Risk position");
        keyValueTable(sectionRows(risk));
        const chart = chartRowsForSection(risk);
        if (chart.length) { pageBreak(58); y = drawBarChart(pdf, "Risk indicator profile", chart, margin, y, contentWidth, 48, "%"); }
    }
    if (cost) {
        heading("Cost & Financial Position", "03 · Financial monitoring");
        keyValueTable(sectionRows(cost));
        const chart = chartRowsForSection(cost);
        if (chart.length) { pageBreak(58); y = drawBarChart(pdf, "Cost position", chart, margin, y, contentWidth, 48, " Cr"); }
    }
    if (schedule) {
        heading("Schedule & Delay Analysis", "04 · Schedule monitoring");
        keyValueTable(sectionRows(schedule));
    }

    if (trends) {
        const snap = trends.snapshot as Record<string, unknown>;
        const raw = Array.isArray(snap.risk_trajectory) ? snap.risk_trajectory : Array.isArray(snap.progress_trajectory) ? snap.progress_trajectory : Array.isArray(snap.history) ? snap.history : [];
        const points: Array<[string, number]> = [];
        raw.forEach((item, index) => {
            if (!item || typeof item !== "object") return;
            const obj = item as Record<string, unknown>;
            const rawValue = obj.risk ?? obj.risk_score ?? obj.progress ?? obj.physical_progress ?? obj.value;
            if (typeof rawValue === "number" && Number.isFinite(rawValue)) points.push([String(obj.date ?? obj.month ?? obj.period ?? obj.label ?? index + 1), rawValue]);
        });
        if (points.length >= 2) {
            heading("Project Trend", "05 · Historical trajectory");
            pageBreak(72);
            y = drawLineChart(pdf, "Captured project trajectory", points.slice(0, 12), margin, y, contentWidth, 60);
            paragraph("Values are reproduced from the saved Project Analytics snapshot; the export does not recalculate them.");
        }
    }

    if (simulation) {
        heading("What-If Risk Simulation", "06 · Scenario analysis");
        keyValueTable(sectionRows(simulation));
        if (simulation.observation) paragraph("Observation: " + simulation.observation);
    }

    if (recommendation || report.observation || report.executiveSummary) {
        heading("Observations & Actions", "07 · Officer record");
        if (report.observation) paragraph("Officer Observation: " + report.observation);
        if (recommendation?.observation) paragraph("Section Observation: " + recommendation.observation);
        if (report.executiveSummary) paragraph(report.executiveSummary);
    }

    const totalPages = pdf.getNumberOfPages();
    for (let page = 1; page <= totalPages; page++) {
        pdf.setPage(page);
        pdf.setDrawColor(220, 225, 231);
        pdf.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(6.8);
        pdf.setTextColor(135, 146, 159);
        pdf.text("PAIMANA · Generated from captured analytics snapshot", margin, pageHeight - 7);
        pdf.text("Page " + page + " of " + totalPages, pageWidth - margin, pageHeight - 7, { align: "right" });
    }
    pdf.save((report.title || "PAIMANA_Project_Report").replace(/[^a-z0-9_-]+/gi, "_") + ".pdf");
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
            <Card padding="lg" className="border-slate-200 bg-slate-50/70"><div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-900 text-white"><Download size={17}/></div><div><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Report output</div><div className="mt-1 text-sm font-bold text-slate-900">Generate official report</div><p className="mt-1 text-[11px] leading-5 text-slate-500">Exports use only the saved analytics snapshot for this report.</p></div></div><div className="mt-4 space-y-2"><Button variant="primary" className="w-full justify-center" disabled={!sections.length} onClick={()=>downloadPdf(current)}><Download size={15}/> Download PDF</Button><Button variant="secondary" className="w-full justify-center" disabled={!sections.length} onClick={()=>exportXlsx(current)}><Download size={15}/> Download Excel</Button><Button variant="secondary" className="w-full justify-center" disabled={!sections.length} onClick={()=>setPreview(true)}><Eye size={15}/> Preview Report</Button></div><div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 text-[10px] leading-4 text-slate-500"><span className="font-semibold text-slate-700">PDF:</span> readable official report with tables/charts where captured data supports them.<br/><span className="font-semibold text-slate-700">Excel:</span> compact two-sheet workbook for review and record keeping.</div></Card>
        </aside></div>

        {customize&&<div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/40 p-4" onMouseDown={()=>setCustomizeId(null)}><div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={e=>e.stopPropagation()}><div className="flex items-start justify-between"><div><h3 className="text-base font-bold text-slate-900">Customize Section</h3><p className="mt-1 text-xs text-slate-400">{customize.title}</p></div><button type="button" onClick={()=>setCustomizeId(null)} className="icon-btn"><X size={16}/></button></div><div className="mt-5 grid grid-cols-2 gap-2">{defaultReportParts.map(p=>{const selected=(customize.selectedParts??defaultReportParts).includes(p);return <button key={p} type="button" onClick={()=>{const currentParts=customize.selectedParts??defaultReportParts;const next=selected?currentParts.filter(x=>x!==p):[...currentParts,p];updateSection(customize.id,{selectedParts:next.length?next:["summary"]});}} className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-xs font-semibold ${selected?"border-slate-400 bg-slate-100 text-slate-900":"border-slate-200 text-slate-500"}`}>{selected?<Check size={14}/>:<Plus size={14}/>} {partLabel(p)}</button>})}</div><label className="mt-5 block"><span className="label">Section Observation / Comment</span><textarea value={customize.observation??""} onChange={e=>updateSection(customize.id,{observation:e.target.value})} rows={4} className="field py-2.5" placeholder="Add an observation/comment..."/></label><div className="mt-5 flex justify-end"><Button variant="primary" onClick={()=>setCustomizeId(null)}>Done</Button></div></div></div>}

        {preview&&<div className="fixed inset-0 z-[90] overflow-y-auto bg-slate-950/50 p-4 md:p-8" onMouseDown={()=>setPreview(false)}><div className="mx-auto max-w-5xl rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={e=>e.stopPropagation()}><div className="flex items-start justify-between border-b border-slate-200 pb-4"><div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{scope==="project"?"Project Report":"Portfolio Report"}</div><h2 className="mt-1 text-xl font-bold text-slate-900">{title}</h2><p className="mt-1 text-xs text-slate-500">{projectName||projectCode||description}</p></div><div className="flex gap-2"><Button variant="secondary" onClick={()=>downloadPdf(current)}><Download size={15}/> Download PDF</Button><button type="button" onClick={()=>setPreview(false)} className="icon-btn"><X size={16}/></button></div></div>{executiveSummary&&<div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">AI Executive Summary</div><div className="mt-2 whitespace-pre-wrap text-xs leading-6 text-slate-700">{executiveSummary}</div></div>}<div className="mt-5 space-y-4">{sections.map((s,i)=><div key={s.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"><div className="flex items-start justify-between"><div><div className="text-xs font-bold text-slate-900">{i+1}. {s.title}</div><div className="mt-1 text-[10px] text-slate-400">{s.description}</div></div><span className="text-[9px] text-slate-400">{new Date(s.capturedAt??s.addedAt).toLocaleString("en-IN")}</span></div><div className="mt-3"><SnapshotValue value={s.snapshot}/></div>{s.observation&&<div className="mt-3 rounded-lg bg-white p-3 text-xs text-slate-600"><b>Observation:</b> {s.observation}</div>}</div>)}</div></div></div>}

        {historyOpen&&<div className="fixed inset-0 z-[90] overflow-y-auto bg-slate-950/50 p-4 md:p-8" onMouseDown={()=>setHistoryOpen(false)}><div className="mx-auto max-w-4xl rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={e=>e.stopPropagation()}><div className="flex items-center justify-between border-b border-slate-200 pb-4"><div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Saved Reports</div><h2 className="mt-1 text-lg font-bold text-slate-900">Report History</h2></div><button type="button" onClick={()=>setHistoryOpen(false)} className="icon-btn"><X size={16}/></button></div><div className="mt-4 space-y-2">{history.length===0?<div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-xs text-slate-400">No saved reports yet.</div>:history.map(r=><div key={r.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><div className="text-xs font-bold text-slate-800">{r.title}</div><div className="mt-1 text-[10px] text-slate-400">{r.scope==="project"?"Project":"Portfolio"} · {r.sections.length} sections · {new Date(r.createdAt).toLocaleString("en-IN")}</div></div><div className="flex flex-wrap gap-1.5"><Button variant="secondary" size="sm" onClick={()=>{loadReport(r.id);setHistoryOpen(false)}}><Eye size={13}/> View</Button><Button variant="secondary" size="sm" onClick={()=>exportXlsx(r)}><Download size={13}/> Download</Button><Button variant="secondary" size="sm" onClick={()=>duplicateReport(r.id)}><Copy size={13}/> Duplicate</Button><Button variant="ghost" size="sm" onClick={()=>deleteReport(r.id)}><Trash2 size={13}/> Delete</Button></div></div></div>)}</div></div></div>}
    </div>;
}

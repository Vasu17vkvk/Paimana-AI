import { ArrowDown, ArrowUp, Check, Copy, Download, Eye, FileText, GripVertical, History, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import PageHeader from "../../components/layout/PageHeader";
import { defaultReportParts, useReportsStore, type ReportPart, type ReportScope, type SavedReport } from "./reportsStore";
import { generateReportExecutiveSummary, getDashboard, getDashboardFilterOptions, type DashboardFilterOptions, type DashboardResponse } from "../../services/api";

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
    const rawSnapshot = section.snapshot as Record<string, unknown>;
    // Project-specific captures wrap the original analytics snapshot inside "data".
    // Unwrap it here so PDF/Excel exports read the actual saved project analytics.
    const snapshot = rawSnapshot && rawSnapshot.data && typeof rawSnapshot.data === "object" && !Array.isArray(rawSnapshot.data)
        ? rawSnapshot.data as Record<string, unknown>
        : rawSnapshot;
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
    const rawSnapshot = section.snapshot as Record<string, unknown>;
    const snapshot = rawSnapshot && rawSnapshot.data && typeof rawSnapshot.data === "object" && !Array.isArray(rawSnapshot.data)
        ? rawSnapshot.data as Record<string, unknown>
        : rawSnapshot;
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
function formatReportValue(value: string): string {
    return value
        .replace(/\\u20b9/g, "₹")
        .replace(/\s+/g, " ")
        .trim();
}

function splitSummary(text: string): Array<{ heading: string; bullets: string[] }> {
    if (!text) return [];
    const lines = text.split(/\\r?\\n/).map((line) => line.trim()).filter(Boolean);
    const groups: Array<{ heading: string; bullets: string[] }> = [];
    let current: { heading: string; bullets: string[] } | null = null;
    lines.forEach((line) => {
        const headingMatch = line.replace(/^#+\s*/, "").replace(/[:*]+$/g, "").match(/^(Key Findings|Major Risks|Important Changes\s*\/\s*Trends|Recommended Actions)$/i);
        if (headingMatch) {
            current = { heading: headingMatch[1], bullets: [] };
            groups.push(current);
            return;
        }
        const bullet = line.replace(/^[-*•]\\s*/, "").replace(/^\\d+[.)]\\s*/, "");
        if (!current) {
            current = { heading: "Executive Summary", bullets: [] };
            groups.push(current);
        }
        current.bullets.push(bullet);
    });
    return groups;
}

function exportXlsx(report: ReportExportData) {
    const wb = XLSX.utils.book_new();
    const generated = new Date(report.createdAt ?? Date.now()).toLocaleString("en-IN");
    const overview = report.sections.find((s) => s.type === "overview");
    const risk = report.sections.find((s) => s.type === "risk");
    const cost = report.sections.find((s) => s.type === "cost");
    const schedule = report.sections.find((s) => s.type === "schedule");

    const rows: any[][] = [
        ["PAIMANA", "PROJECT MONITORING REPORT"],
        ["Project Code", report.projectCode || "—"],
        ["Project Name", report.projectName || "—"],
        ["Report Type", report.scope === "project" ? "Project Report" : "Portfolio Report"],
        ["Generated", generated],
        [],
        ["PROJECT IDENTITY & CURRENT POSITION", ""],
    ];
    const identityRows = overview ? sectionRows(overview).filter(([label]) =>
        /ministry|sector|state|implementing agency|schedule status|completion|physical progress|data completeness|data quality/i.test(label)
    ) : [];
    uniqueRows(identityRows).forEach(([label, value]) => rows.push([humanLabel(label), formatReportValue(value)]));

    rows.push([], ["KEY MONITORING INDICATORS", ""]);
    const indicatorRows: Array<[string, string]> = [];
    if (risk) sectionRows(risk).filter(([l]) => /risk score|risk level|cost risk|future delay|progress stall/i.test(l)).forEach((r) => indicatorRows.push(r));
    if (cost) sectionRows(cost).filter(([l]) => /original cost|revised cost|expenditure/i.test(l)).forEach((r) => indicatorRows.push(r));
    if (schedule) sectionRows(schedule).filter(([l]) => /delay|completion|physical progress|schedule status/i.test(l)).forEach((r) => indicatorRows.push(r));
    uniqueRows(indicatorRows).forEach(([label, value]) => rows.push([humanLabel(label), formatReportValue(value)]));

    if (report.observation) rows.push([], ["OFFICER OBSERVATION", report.observation]);
    if (report.description) rows.push(["REPORT DESCRIPTION", report.description]);

    const summaryGroups = splitSummary(report.executiveSummary || "");
    if (summaryGroups.length) {
        rows.push([], ["EXECUTIVE SUMMARY", ""]);
        summaryGroups.forEach((group) => {
            rows.push([group.heading, ""]);
            group.bullets.forEach((bullet) => rows.push(["•", bullet]));
        });
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 34 }, { wch: 92 }];
    ws["!rows"] = rows.map((row) => ({ hpt: row[0] && /^(PAIMANA|PROJECT IDENTITY|KEY MONITORING|OFFICER OBSERVATION|EXECUTIVE SUMMARY|Key Findings|Major Risks|Important Changes|Recommended Actions)/i.test(String(row[0])) ? 24 : 19 }));
    ws["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
    ];
    ws["!freeze"] = "A2";
    XLSX.utils.book_append_sheet(wb, ws, "Project Report");

    const analysis: any[][] = [
        ["SECTION", "INDICATOR / ITEM", "VALUE", "CAPTURED AT", "OFFICER OBSERVATION"],
    ];
    report.sections.forEach((section) => {
        const captured = new Date(section.capturedAt ?? section.addedAt).toLocaleString("en-IN");
        sectionRows(section).forEach(([label, value]) => {
            analysis.push([section.title, humanLabel(label), formatReportValue(value), captured, section.observation || ""]);
        });
        trendTableRows(section).forEach((row, index) => {
            Object.entries(row).forEach(([field, value]) => {
                analysis.push([section.title + " · Row " + (index + 1), humanLabel(field), formatReportValue(value), captured, section.observation || ""]);
            });
        });
    });
    if (report.scope === "portfolio") {
        Object.entries(report.filters).forEach(([key, value]) => analysis.push(["Portfolio Filter", humanLabel(key), value || "—", "", ""]));
    }
    const analysisWs = XLSX.utils.aoa_to_sheet(analysis);
    analysisWs["!cols"] = [{ wch: 30 }, { wch: 38 }, { wch: 68 }, { wch: 24 }, { wch: 44 }];
    analysisWs["!freeze"] = "A2";
    analysisWs["!autofilter"] = { ref: "A1:E" + analysis.length };
    XLSX.utils.book_append_sheet(wb, analysisWs, "Detailed Analysis");

    XLSX.writeFileXLSX(
        wb,
        (report.title || "PAIMANA_Project_Report").replace(/[^a-z0-9_-]+/gi, "_") + ".xlsx",
        { compression: true }
    );
}

function trendsRowsForReport(sections: SavedReport["sections"]): Array<Record<string,string>> {
    const section = sections.find((item) => item.type === "trends");
    return section ? trendTableRows(section) : [];
}

function downloadPdf(report: ReportExportData) {
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 16;
    const contentWidth = pageWidth - margin * 2;
    const bottom = pageHeight - 17;

    const addPage = () => {
        pdf.addPage();
        pdf.setFillColor(31, 38, 46);
        pdf.rect(0, 0, pageWidth, 7, "F");
        return margin + 3;
    };

    const footer = () => {
        const pages = pdf.getNumberOfPages();
        for (let page = 1; page <= pages; page++) {
            pdf.setPage(page);
            pdf.setDrawColor(220, 225, 231);
            pdf.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(6.8);
            pdf.setTextColor(130, 140, 151);
            pdf.text("PAIMANA · Generated from captured analytics snapshot", margin, pageHeight - 7);
            pdf.text("Page " + page + " of " + pages, pageWidth - margin, pageHeight - 7, { align: "right" });
        }
    };

    const sectionTitle = (number: string, title: string, y: number) => {
        pdf.setDrawColor(210, 216, 223);
        pdf.line(margin, y, pageWidth - margin, y);
        y += 7;
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(7);
        pdf.setTextColor(100, 112, 128);
        pdf.text(number, margin, y);
        pdf.setFontSize(13);
        pdf.setTextColor(25, 35, 47);
        pdf.text(title, margin + 11, y);
        return y + 7;
    };

    const wrappedText = (text: string, x: number, y: number, width: number, size = 8.2, lineGap = 4) => {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(size);
        pdf.setTextColor(57, 68, 82);
        const lines = pdf.splitTextToSize(formatReportValue(text), width);
        pdf.text(lines, x, y);
        return y + lines.length * lineGap;
    };

    const table = (rows: Array<[string, string]>, y: number, title?: string) => {
        if (!rows.length) return y;
        if (title) {
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(8.5);
            pdf.setTextColor(45, 58, 72);
            pdf.text(title, margin, y);
            y += 5;
        }
        const col1 = 54;
        const col2 = contentWidth - col1;
        const lineHeight = 3.6;
        rows.forEach(([label, rawValue], index) => {
            const value = formatReportValue(rawValue);
            const valueLines = pdf.splitTextToSize(value || "—", col2 - 5);
            const rowHeight = Math.max(7, valueLines.length * lineHeight + 3);
            if (y + rowHeight > bottom) y = addPage();
            pdf.setFillColor(index % 2 === 0 ? 248 : 255, index % 2 === 0 ? 249 : 255, index % 2 === 0 ? 250 : 255);
            pdf.setDrawColor(225, 229, 234);
            pdf.rect(margin, y, col1, rowHeight, "FD");
            pdf.rect(margin + col1, y, col2, rowHeight, "FD");
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(7.4);
            pdf.setTextColor(79, 91, 105);
            pdf.text(pdf.splitTextToSize(humanLabel(label), col1 - 5).slice(0, 2), margin + 2.5, y + 4.5);
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(7.6);
            pdf.setTextColor(44, 55, 68);
            pdf.text(valueLines, margin + col1 + 2.5, y + 4.5);
            y += rowHeight;
        });
        return y + 4;
    };

    const cards = (items: Array<[string, string]>, y: number) => {
        if (!items.length) return y;
        const gap = 3;
        const cardWidth = (contentWidth - gap * 3) / 4;
        const cardHeight = 18;
        items.slice(0, 4).forEach(([label, value], index) => {
            const x = margin + index * (cardWidth + gap);
            pdf.setFillColor(248, 249, 250);
            pdf.setDrawColor(222, 227, 232);
            pdf.roundedRect(x, y, cardWidth, cardHeight, 2, 2, "FD");
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(6.5);
            pdf.setTextColor(108, 119, 132);
            pdf.text(label.toUpperCase().slice(0, 20), x + 3, y + 5);
            pdf.setFontSize(10);
            pdf.setTextColor(25, 35, 47);
            pdf.text(pdf.splitTextToSize(value || "—", cardWidth - 6).slice(0, 2), x + 3, y + 11);
        });
        return y + cardHeight + 7;
    };

    const chart = (title: string, items: Array<[string, number]>, y: number, suffix = "") => {
        const valid = items.filter(([, value]) => Number.isFinite(value));
        if (!valid.length) return y;
        const max = Math.max(...valid.map(([, value]) => Math.abs(value)), 1);
        if (y + 18 + valid.length * 10 > bottom) y = addPage();
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(8.5);
        pdf.setTextColor(45, 58, 72);
        pdf.text(title, margin, y);
        y += 6;
        valid.forEach(([label, value]) => {
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(6.8);
            pdf.setTextColor(75, 87, 101);
            pdf.text(label.slice(0, 22), margin, y + 4.5);
            const barX = margin + 43;
            const barW = contentWidth - 66;
            pdf.setFillColor(235, 238, 241);
            pdf.roundedRect(barX, y, barW, 6, 1, 1, "F");
            pdf.setFillColor(78, 91, 105);
            pdf.roundedRect(barX, y, Math.max(1, barW * Math.abs(value) / max), 6, 1, 1, "F");
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(6.8);
            pdf.text(value.toLocaleString("en-IN", { maximumFractionDigits: 2 }) + suffix, barX + barW + 2, y + 4.5);
            y += 10;
        });
        return y + 3;
    };

    const overview = report.sections.find((s) => s.type === "overview");
    const risk = report.sections.find((s) => s.type === "risk");
    const cost = report.sections.find((s) => s.type === "cost");
    const schedule = report.sections.find((s) => s.type === "schedule");
    const simulation = report.sections.find((s) => s.type === "prediction");

    pdf.setProperties({
        title: report.title || "PAIMANA Project Monitoring Report",
        subject: "PAIMANA Project Monitoring Report",
        author: "PAIMANA",
        creator: "PAIMANA",
    });

    pdf.setFillColor(31, 38, 46);
    pdf.rect(0, 0, pageWidth, 8, "F");
    let y = 20;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(92, 105, 119);
    pdf.text("PAIMANA | PROJECT MONITORING & ANALYTICS", margin, y);
    y += 9;

    pdf.setFontSize(19);
    pdf.setTextColor(24, 34, 46);
    pdf.text(pdf.splitTextToSize(report.title || "Project Monitoring Report", contentWidth), margin, y);
    y += 8;

    const projectLines = pdf.splitTextToSize(report.projectName || "Selected Project", contentWidth);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(80, 92, 106);
    pdf.text(projectLines, margin, y);
    y += projectLines.length * 4.5 + 5;

    const overviewRows = overview ? sectionRows(overview) : [];
    const riskRows = risk ? sectionRows(risk) : [];
    const costRows = cost ? sectionRows(cost) : [];
    const scheduleRows = schedule ? sectionRows(schedule) : [];
    const simulationRows = simulation ? sectionRows(simulation) : [];

    if (report.scope === "portfolio") {
        pdf.setProperties({
            title: report.title || "PAIMANA Portfolio Monitoring Report",
            subject: "PAIMANA Portfolio Monitoring Report",
            author: "PAIMANA",
            creator: "PAIMANA",
        });
        pdf.setFillColor(31, 38, 46);
        pdf.rect(0, 0, pageWidth, 8, "F");
        let py = 20;
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(8);
        pdf.setTextColor(92, 105, 119);
        pdf.text("PAIMANA | PORTFOLIO MONITORING & ANALYTICS", margin, py);
        py += 9;
        pdf.setFontSize(19);
        pdf.setTextColor(24, 34, 46);
        pdf.text(pdf.splitTextToSize(report.title || "PAIMANA Portfolio Report", contentWidth), margin, py);
        py += 8;
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        pdf.setTextColor(80, 92, 106);
        pdf.text("Combined portfolio view based on the selected filters.", margin, py);
        py += 9;

        const portfolioRows = overview ? sectionRows(overview) : [];
        const portfolioRiskRows = risk ? sectionRows(risk) : [];
        const portfolioCostRows = cost ? sectionRows(cost) : [];
        const portfolioTrendRows = trendsRowsForReport(report.sections);

        const totalProjects = findMetric([...portfolioRows, ...portfolioRiskRows], [/total projects/i])?.[1] || "—";
        const delayedProjects = findMetric([...portfolioRows, ...portfolioRiskRows], [/delayed projects/i])?.[1] || "—";
        const averageRisk = findMetric(portfolioRiskRows, [/average risk score/i])?.[1] || "—";
        const expenditureTotal = findMetric(portfolioCostRows, [/total expenditure/i])?.[1] || "—";

        py = cards([
            ["TOTAL PROJECTS", totalProjects],
            ["DELAYED PROJECTS", delayedProjects],
            ["AVERAGE RISK", averageRisk],
            ["TOTAL EXPENDITURE", expenditureTotal],
        ], py);

        py = sectionTitle("01", "Portfolio Scope & Current Position", py);
        const filterRows = Object.entries(report.filters).filter(([,value]) => value).map(([key,value]) => [humanLabel(key), value] as [string,string]);
        if (filterRows.length) py = table(filterRows, py, "Applied filters");
        py = table(portfolioRows.filter(([label]) => /total projects|delayed projects|delay rate|cost overrun|average risk/i.test(label)).slice(0, 16), py, "Portfolio indicators");

        py = sectionTitle("02", "Portfolio Risk Position", py);
        const riskRows = uniqueRows(portfolioRiskRows.filter(([label]) => /risk distribution|critical|high|elevated|moderate|low|risk score|average risk|delayed projects/i.test(label)));
        py = table(riskRows.slice(0, 18), py, "Risk distribution and indicators");
        py = chart("Risk Distribution", [
            ["Critical", numericValue(findMetric(portfolioRiskRows, [/risk distribution critical/i])?.[1] || "") ?? NaN],
            ["High", numericValue(findMetric(portfolioRiskRows, [/risk distribution high/i])?.[1] || "") ?? NaN],
            ["Elevated", numericValue(findMetric(portfolioRiskRows, [/risk distribution elevated/i])?.[1] || "") ?? NaN],
            ["Moderate", numericValue(findMetric(portfolioRiskRows, [/risk distribution moderate/i])?.[1] || "") ?? NaN],
            ["Low", numericValue(findMetric(portfolioRiskRows, [/risk distribution low/i])?.[1] || "") ?? NaN],
        ], py);

        py = sectionTitle("03", "Portfolio Financial Position", py);
        py = table(uniqueRows(portfolioCostRows).slice(0, 18), py, "Combined financial indicators");

        py = sectionTitle("04", "Portfolio Trends", py);
        if (portfolioTrendRows.length) {
            const trendRows = portfolioTrendRows.slice(0, 12).map(row => [
                Object.values(row)[0] || "—",
                Object.entries(row).slice(1).map(([k,v]) => `${humanLabel(k)}: ${v}`).join(" · ")
            ] as [string,string]);
            py = table(trendRows, py, "Monthly portfolio movement");
        } else {
            py = wrappedText("No captured monthly portfolio trend data is available for this report.", margin, py, contentWidth);
        }

        if (report.observation || report.executiveSummary) {
            if (py + 35 > bottom) py = addPage();
            py = sectionTitle("05", "Executive Summary & Officer Record", py);
            if (report.observation) py = table([["Officer Observation", report.observation]], py);
            const groups = splitSummary(report.executiveSummary || "");
            groups.forEach(group => {
                if (py + 14 > bottom) py = addPage();
                pdf.setFont("helvetica", "bold");
                pdf.setFontSize(9);
                pdf.setTextColor(42, 54, 68);
                pdf.text(group.heading, margin, py);
                py += 5;
                group.bullets.forEach(bullet => {
                    const lines = pdf.splitTextToSize("• " + bullet, contentWidth - 4);
                    if (py + lines.length * 4 + 4 > bottom) py = addPage();
                    pdf.setFont("helvetica", "normal");
                    pdf.setFontSize(8);
                    pdf.setTextColor(57, 68, 82);
                    pdf.text(lines, margin + 2, py);
                    py += lines.length * 4 + 3;
                });
                py += 2;
            });
        }

        footer();
        pdf.save((report.title || "PAIMANA_Portfolio_Report").replace(/[^a-z0-9_-]+/gi, "_") + ".pdf");
        return;
    }

    const status = findMetric(overviewRows, [/schedule status/i])?.[1]
        || findMetric(scheduleRows, [/schedule status/i])?.[1]
        || "—";
    const riskLevel = findMetric(riskRows, [/risk level/i])?.[1] || "—";
    const riskScore = findMetric(riskRows, [/risk score/i])?.[1] || "—";
    const progress = findMetric([...overviewRows, ...scheduleRows, ...costRows], [/physical progress/i])?.[1] || "—";
    const expenditure = findMetric([...costRows, ...overviewRows], [/expenditure/i])?.[1] || "—";
    const delay = findMetric([...scheduleRows, ...overviewRows], [/delay.*days|schedule slippage/i])?.[1] || "—";

    y = cards([
        ["PROJECT CODE", report.projectCode || "—"],
        ["STATUS", status],
        ["RISK", riskLevel],
        ["RISK SCORE", riskScore],
    ], y);

    y = sectionTitle("01", "Project Overview & Current Position", y);
    const identityRows = uniqueRows(overviewRows.filter(([label]) =>
        !/project code|project name/i.test(label) &&
        /ministry|sector|state|implementing agency|schedule status|completion|physical progress|data completeness|data quality|cost status/i.test(label)
    ));
    y = table(identityRows.slice(0, 18), y, "Project profile");

    const overviewTextRows = uniqueRows(overviewRows.filter(([label]) =>
        /current position|summary|status|progress|expenditure|delay|risk/i.test(label)
    ));
    if (overviewTextRows.length) y = table(overviewTextRows.slice(0, 10), y, "Current monitoring position");

    const keyCards: Array<[string, string]> = [];
    if (progress !== "—") keyCards.push(["PHYSICAL PROGRESS", progress]);
    if (expenditure !== "—") keyCards.push(["EXPENDITURE", expenditure]);
    if (delay !== "—") keyCards.push(["DELAY / SLIPPAGE", delay]);
    const originalCost = findMetric(costRows, [/original cost/i])?.[1];
    if (originalCost) keyCards.push(["ORIGINAL COST", originalCost]);
    if (keyCards.length) y = cards(keyCards.slice(0, 4), y);

    if (riskRows.length || scheduleRows.length) {
        if (y + 45 > bottom) y = addPage();
        y = sectionTitle("02", "Risk & Schedule Analysis", y);
        if (riskRows.length) {
            y = table(riskRows.filter(([label]) => /risk|probability|score|cost/i.test(label)).slice(0, 12), y, "Risk assessment");
            y = chart("Risk indicators", chartRowsForSection(risk!).map(([label, value]) => [label, value] as [string, number]), y, "%");
        }
        if (scheduleRows.length) {
            y = table(scheduleRows.filter(([label]) => /delay|completion|schedule|progress/i.test(label)).slice(0, 12), y, "Schedule & delay position");
        }
    }

    if (costRows.length || overviewRows.some(([label]) => /physical progress|expenditure/i.test(label))) {
        if (y + 45 > bottom) y = addPage();
        y = sectionTitle("03", "Cost & Progress Monitoring", y);
        if (costRows.length) {
            y = table(costRows.filter(([label]) => /cost|expenditure|financial|risk/i.test(label)).slice(0, 14), y, "Financial position");
            y = chart("Cost position", chartRowsForSection(cost!).map(([label, value]) => [label, value] as [string, number]), y, " Cr");
        }
        const progressRows = uniqueRows([...overviewRows, ...scheduleRows].filter(([label]) => /physical progress|expenditure|progress/i.test(label)));
        if (progressRows.length) y = table(progressRows.slice(0, 8), y, "Progress indicators");
    }

    if (simulationRows.length) {
        if (y + 45 > bottom) y = addPage();
        y = sectionTitle("04", "What-If Risk Simulation", y);
        y = table(simulationRows, y, "Scenario inputs & simulated result");
        if (simulation?.observation) y = wrappedText("Officer observation: " + simulation.observation, margin, y, contentWidth);
    }

    const groups = splitSummary(report.executiveSummary || "");
    if (report.observation || groups.length) {
        if (y + 45 > bottom) y = addPage();
        y = sectionTitle("05", "Executive Summary & Officer Record", y);

        if (report.observation) {
            y = table([["Officer Observation", report.observation]], y);
        }

        groups.forEach((group) => {
            if (y + 16 > bottom) y = addPage();
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(9);
            pdf.setTextColor(42, 54, 68);
            pdf.text(group.heading, margin, y);
            y += 5;
            group.bullets.forEach((bullet) => {
                const lines = pdf.splitTextToSize("• " + bullet, contentWidth - 4);
                if (y + lines.length * 4 + 4 > bottom) y = addPage();
                pdf.setFont("helvetica", "normal");
                pdf.setFontSize(8);
                pdf.setTextColor(57, 68, 82);
                pdf.text(lines, margin + 2, y);
                y += lines.length * 4 + 3;
            });
            y += 2;
        });
    }

    if (report.description) {
        if (y + 24 > bottom) y = addPage();
        y = sectionTitle("06", "Report Scope & Note", y);
        y = wrappedText(report.description, margin, y, contentWidth);
    }

    footer();
    pdf.save((report.title || "PAIMANA_Project_Report").replace(/[^a-z0-9_-]+/gi, "_") + ".pdf");
}

export default function ReportsPage(){
    const store=useReportsStore();
    const {title,description,observation,scope,projectCode,projectName,filters,sections,history,executiveSummary,setTitle,setDescription,setObservation,setScope,setProjectCode,setProjectName,setFilter,addSection,removeSection,moveSection,clearSections,updateSection,setExecutiveSummary,saveCurrentReport,loadReport,duplicateReport,deleteReport}=store;
    const [preview,setPreview]=useState(false),[historyOpen,setHistoryOpen]=useState(false),[customizeId,setCustomizeId]=useState<string|null>(null),[aiLoading,setAiLoading]=useState(false),[aiError,setAiError]=useState(""),[catalogSearch,setCatalogSearch]=useState("");
    const [portfolioOptions,setPortfolioOptions]=useState<DashboardFilterOptions>({periods:[],ministries:[],sectors:[],states:[],risk_levels:[],statuses:[]});
    const [portfolioData,setPortfolioData]=useState<DashboardResponse|null>(null);
    const [portfolioLoading,setPortfolioLoading]=useState(false);
    useEffect(()=>{if(scope!=="portfolio") return; getDashboardFilterOptions().then(setPortfolioOptions).catch(()=>setPortfolioOptions({periods:[],ministries:[],sectors:[],states:[],risk_levels:[],statuses:[]}));},[scope]);
    useEffect(()=>{if(scope!=="portfolio") {setPortfolioData(null); return;} setPortfolioLoading(true); getDashboard({period:filters.dateMonth,ministry:filters.ministry,sector:filters.sector,state:filters.state,risk:filters.riskLevel,status:filters.projectStatus}).then(setPortfolioData).catch(()=>setPortfolioData(null)).finally(()=>setPortfolioLoading(false));},[scope,filters.dateMonth,filters.ministry,filters.sector,filters.state,filters.riskLevel,filters.projectStatus]);
    useEffect(()=>{if(scope!=="portfolio") return; const optionMap: Record<string,string[]>={ministry:portfolioOptions.ministries,sector:portfolioOptions.sectors,state:portfolioOptions.states,riskLevel:portfolioOptions.risk_levels,projectStatus:portfolioOptions.statuses,dateMonth:portfolioOptions.periods}; (Object.entries(optionMap) as Array<[keyof typeof filters,string[]]>).forEach(([key,options])=>{if(filters[key] && options.length && !options.includes(filters[key])) setFilter(key,"");});},[scope,portfolioOptions.ministries,portfolioOptions.sectors,portfolioOptions.states,portfolioOptions.risk_levels,portfolioOptions.statuses,portfolioOptions.periods]);
    const customize=sections.find(s=>s.id===customizeId)??null;
    const portfolioCatalog = useMemo(()=>[
        {type:"overview" as const,title:"Portfolio Overview",description:"Combined project count, status, financial and monitoring position.",snapshot:portfolioData?{filters:portfolioData.filters,metrics:portfolioData.metrics}:undefined},
        {type:"risk" as const,title:"Portfolio Risk Position",description:"Risk distribution and portfolio-level risk indicators.",snapshot:portfolioData?{risk_distribution:portfolioData.riskDistribution,metrics:portfolioData.metrics}:undefined},
        {type:"cost" as const,title:"Portfolio Financial Position",description:"Combined original and revised cost position.",snapshot:portfolioData?{financials:portfolioData.financials,metrics:portfolioData.metrics}:undefined},
        {type:"progress" as const,title:"Portfolio Project Progress",description:"Combined project status and progress position.",snapshot:portfolioData?{metrics:portfolioData.metrics,projects:portfolioData.projects}:undefined},
        {type:"trends" as const,title:"Portfolio Trends",description:"Monthly portfolio project, risk, delay and cost-risk movement.",snapshot:portfolioData?{monthly_portfolio_data:portfolioData.monthlyPortfolioData}:undefined},
    ],[portfolioData]);
    const available=useMemo(()=>{
        if(scope==="portfolio") return portfolioCatalog.filter(c=>!sections.some(s=>s.type===c.type)).filter(c=>c.title.toLowerCase().includes(catalogSearch.toLowerCase()));
        return [];
    },[scope,portfolioCatalog,sections,catalogSearch]);
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
                        <div><span className="mb-2 block text-[11px] font-bold text-slate-600">Report Scope</span><div className="grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-1">{(["project","portfolio"] as ReportScope[]).map(s=><button key={s} type="button" onClick={()=>setScope(s)} className={`rounded-lg px-3 py-2.5 text-[11px] font-bold transition ${scope===s?"bg-slate-900 text-white shadow-sm":"text-slate-500 hover:bg-slate-200/70 hover:text-slate-800"}`}>{s==="project"?"Project":"Portfolio"}</button>)}</div><p className="mt-2 text-[10px] leading-4 text-slate-400">{scope==="project"?"Single selected project report. Save its analytics directly from Project Analytics.":"Combined report for all projects matching the selected portfolio filters."}</p></div>
                    </div>
                    <label><span className="mb-2 block text-[11px] font-bold text-slate-600">Description</span><textarea value={description} onChange={e=>setDescription(e.target.value)} rows={3} className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-100" placeholder="Briefly describe what this report covers..."/></label>
                    {scope==="project"&&<div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4"><div className="mb-3 flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-white text-[10px] font-bold text-slate-600 shadow-sm">ID</span><div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Project context</div><div className="text-xs font-semibold text-slate-700">Selected project for this report</div></div></div><div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1.5 block text-[10px] font-semibold text-slate-500">Project Code</span><input value={projectCode} onChange={e=>setProjectCode(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100" placeholder="Project code"/></label><label><span className="mb-1.5 block text-[10px] font-semibold text-slate-500">Project Name</span><input value={projectName} onChange={e=>setProjectName(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100" placeholder="Project name"/></label></div></div>}
                    {scope==="portfolio"&&<div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4"><div className="mb-3 flex items-center justify-between"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Portfolio filters</div><span className="text-[10px] text-slate-400">{portfolioLoading?"Loading portfolio…":portfolioData?(`${portfolioData.metrics.totalProjects} projects matched`):"Select filters"}</span></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{([["ministry","Ministry",portfolioOptions.ministries],["sector","Sector",portfolioOptions.sectors],["state","State / UT",portfolioOptions.states],["riskLevel","Risk Level",portfolioOptions.risk_levels],["projectStatus","Project Status",portfolioOptions.statuses],["dateMonth","Date / Month",portfolioOptions.periods]] as Array<[keyof typeof filters,string,string[]]>).map(([k,l,options])=><label key={k}><span className="mb-1.5 block text-[10px] font-semibold text-slate-500">{l}</span><select value={filters[k]} onChange={e=>setFilter(k,e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"><option value="">{`All ${l}`}</option>{options.map(option=><option key={option} value={option}>{option}</option>)}</select></label>)}</div></div>}
                    <label><span className="mb-2 block text-[11px] font-bold text-slate-600">Report Observation / Note</span><div className="relative"><textarea value={observation} onChange={e=>setObservation(e.target.value)} rows={3} className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm leading-6 text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-100" placeholder="Add an observation, officer note, or context for this report..."/><span className="pointer-events-none absolute bottom-2 right-3 text-[9px] text-slate-300">Optional</span></div></label>
                </div>
            </Card>
            <Card padding="lg"><div className="flex items-center justify-between"><div><h2 className="text-sm font-bold text-slate-900">Report Sections</h2><p className="mt-1 text-[11px] text-slate-400">Reorder, customize and remove captured sections.</p></div><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{sections.length} selected</span></div>
                <div className="mt-5 space-y-2">{sections.length===0?<div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-10 text-center text-xs text-slate-400">No sections added yet. Use Save to Report from an analytics section or add a verified section from the right.</div>:sections.map((s,i)=><div key={s.id} className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-center gap-3"><GripVertical size={15} className="text-slate-300"/><div className="min-w-0 flex-1"><div className="truncate text-xs font-bold text-slate-800">{i+1}. {s.title}</div><div className="mt-1 text-[10px] text-slate-400">{s.description} · {new Date(s.capturedAt??s.addedAt).toLocaleString("en-IN")}</div></div><div className="flex gap-1"><button type="button" disabled={!i} onClick={()=>moveSection(s.id,"up")} className="icon-btn"><ArrowUp size={14}/></button><button type="button" disabled={i===sections.length-1} onClick={()=>moveSection(s.id,"down")} className="icon-btn"><ArrowDown size={14}/></button><button type="button" onClick={()=>setCustomizeId(s.id)} className="icon-btn"><Pencil size={14}/></button><button type="button" onClick={()=>removeSection(s.id)} className="icon-btn"><Trash2 size={14}/></button></div></div><div className="mt-2 flex flex-wrap gap-1.5 pl-7">{(s.selectedParts??defaultReportParts).map(p=><span key={p} className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-semibold text-slate-500">{partLabel(p)}</span>)}</div>{s.observation&&<div className="mt-2 rounded-lg bg-slate-50 p-2 text-[10px] text-slate-600">{s.observation}</div>}</div>)}</div>
            </Card>
            <Card padding="lg"><div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-bold text-slate-900">AI Executive Summary</h2><p className="mt-1 text-[11px] text-slate-400">Key findings, major risks, changes and recommended actions from selected evidence.</p></div><Button variant="secondary" onClick={aiSummary} disabled={!sections.length||aiLoading}><Sparkles size={15}/>{aiLoading?"Generating...":"Generate Summary"}</Button></div>{aiError&&<div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{aiError}</div>}{executiveSummary?<div className="mt-4 whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-6 text-slate-700">{executiveSummary}</div>:<div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-5 text-xs text-slate-400">No AI summary generated yet.</div>}</Card>
        </div>
        <aside className="space-y-5"><Card padding="lg"><h2 className="text-sm font-bold text-slate-900">Add to Report</h2><p className="mt-1 text-[11px] text-slate-400">{scope==="portfolio"?"Add a verified portfolio snapshot from the current filters.":"For project reports, save the required sections directly from Project Analytics so the selected project's actual snapshot is captured."}</p>{scope==="portfolio"&&<><input value={catalogSearch} onChange={e=>setCatalogSearch(e.target.value)} placeholder="Search sections..." className="field mt-4"/><div className="mt-4 space-y-2">{available.map(s=><button key={s.type} type="button" disabled={!s.snapshot||portfolioLoading} onClick={()=>addSection({id:s.type+"-"+Date.now(),type:s.type,title:s.title,description:s.description,snapshot:s.snapshot})} className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"><span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-500"><Plus size={15}/></span><span><span className="block text-xs font-bold text-slate-800">{s.title}</span><span className="mt-0.5 block text-[10px] text-slate-400">{s.description}</span></span></button>)}</div></>}</Card>
            <Card padding="lg" className="border-slate-200 bg-slate-50/70"><div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-900 text-white"><Download size={17}/></div><div><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Report output</div><div className="mt-1 text-sm font-bold text-slate-900">Generate official report</div><p className="mt-1 text-[11px] leading-5 text-slate-500">Exports use only the saved analytics snapshot for this report.</p></div></div><div className="mt-4 space-y-2"><Button variant="primary" className="w-full justify-center" disabled={!sections.length} onClick={()=>downloadPdf(current)}><Download size={15}/> Download PDF</Button><Button variant="secondary" className="w-full justify-center" disabled={!sections.length} onClick={()=>exportXlsx(current)}><Download size={15}/> Download Excel</Button><Button variant="secondary" className="w-full justify-center" disabled={!sections.length} onClick={()=>setPreview(true)}><Eye size={15}/> Preview Report</Button></div><div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 text-[10px] leading-4 text-slate-500"><span className="font-semibold text-slate-700">PDF:</span> readable official report with tables/charts where captured data supports them.<br/><span className="font-semibold text-slate-700">Excel:</span> compact two-sheet workbook for review and record keeping.</div></Card>
        </aside></div>

        {customize&&<div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/40 p-4" onMouseDown={()=>setCustomizeId(null)}><div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={e=>e.stopPropagation()}><div className="flex items-start justify-between"><div><h3 className="text-base font-bold text-slate-900">Customize Section</h3><p className="mt-1 text-xs text-slate-400">{customize.title}</p></div><button type="button" onClick={()=>setCustomizeId(null)} className="icon-btn"><X size={16}/></button></div><div className="mt-5 grid grid-cols-2 gap-2">{defaultReportParts.map(p=>{const selected=(customize.selectedParts??defaultReportParts).includes(p);return <button key={p} type="button" onClick={()=>{const currentParts=customize.selectedParts??defaultReportParts;const next=selected?currentParts.filter(x=>x!==p):[...currentParts,p];updateSection(customize.id,{selectedParts:next.length?next:["summary"]});}} className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-xs font-semibold ${selected?"border-slate-400 bg-slate-100 text-slate-900":"border-slate-200 text-slate-500"}`}>{selected?<Check size={14}/>:<Plus size={14}/>} {partLabel(p)}</button>})}</div><label className="mt-5 block"><span className="label">Section Observation / Comment</span><textarea value={customize.observation??""} onChange={e=>updateSection(customize.id,{observation:e.target.value})} rows={4} className="field py-2.5" placeholder="Add an observation/comment..."/></label><div className="mt-5 flex justify-end"><Button variant="primary" onClick={()=>setCustomizeId(null)}>Done</Button></div></div></div>}

        {preview&&<div className="fixed inset-0 z-[90] overflow-y-auto bg-slate-950/50 p-4 md:p-8" onMouseDown={()=>setPreview(false)}><div className="mx-auto max-w-5xl rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={e=>e.stopPropagation()}><div className="flex items-start justify-between border-b border-slate-200 pb-4"><div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{scope==="project"?"Project Report":"Portfolio Report"}</div><h2 className="mt-1 text-xl font-bold text-slate-900">{title}</h2><p className="mt-1 text-xs text-slate-500">{projectName||projectCode||description}</p></div><div className="flex gap-2"><Button variant="secondary" onClick={()=>downloadPdf(current)}><Download size={15}/> Download PDF</Button><button type="button" onClick={()=>setPreview(false)} className="icon-btn"><X size={16}/></button></div></div>{executiveSummary&&<div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">AI Executive Summary</div><div className="mt-2 whitespace-pre-wrap text-xs leading-6 text-slate-700">{executiveSummary}</div></div>}<div className="mt-5 space-y-4">{sections.map((s,i)=><div key={s.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"><div className="flex items-start justify-between"><div><div className="text-xs font-bold text-slate-900">{i+1}. {s.title}</div><div className="mt-1 text-[10px] text-slate-400">{s.description}</div></div><span className="text-[9px] text-slate-400">{new Date(s.capturedAt??s.addedAt).toLocaleString("en-IN")}</span></div><div className="mt-3"><SnapshotValue value={s.snapshot}/></div>{s.observation&&<div className="mt-3 rounded-lg bg-white p-3 text-xs text-slate-600"><b>Observation:</b> {s.observation}</div>}</div>)}</div></div></div>}

        {historyOpen&&<div className="fixed inset-0 z-[90] overflow-y-auto bg-slate-950/50 p-4 md:p-8" onMouseDown={()=>setHistoryOpen(false)}><div className="mx-auto max-w-4xl rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={e=>e.stopPropagation()}><div className="flex items-center justify-between border-b border-slate-200 pb-4"><div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Saved Reports</div><h2 className="mt-1 text-lg font-bold text-slate-900">Report History</h2></div><button type="button" onClick={()=>setHistoryOpen(false)} className="icon-btn"><X size={16}/></button></div><div className="mt-4 space-y-2">{history.length===0?<div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-xs text-slate-400">No saved reports yet.</div>:history.map(r=><div key={r.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><div className="text-xs font-bold text-slate-800">{r.title}</div><div className="mt-1 text-[10px] text-slate-400">{r.scope==="project"?"Project":"Portfolio"} · {r.sections.length} sections · {new Date(r.createdAt).toLocaleString("en-IN")}</div></div><div className="flex flex-wrap gap-1.5"><Button variant="secondary" size="sm" onClick={()=>{loadReport(r.id);setHistoryOpen(false)}}><Eye size={13}/> View</Button><Button variant="secondary" size="sm" onClick={()=>exportXlsx(r)}><Download size={13}/> Download</Button><Button variant="secondary" size="sm" onClick={()=>duplicateReport(r.id)}><Copy size={13}/> Duplicate</Button><Button variant="ghost" size="sm" onClick={()=>deleteReport(r.id)}><Trash2 size={13}/> Delete</Button></div></div></div>)}</div></div></div>}
    </div>;
}

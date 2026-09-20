import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ReportScope = "project" | "portfolio";
export type ReportSectionType = "overview" | "cost" | "schedule" | "progress" | "risk" | "prediction" | "warnings" | "analytics" | "trends" | "recommendations" | "milestones";
export type ReportPart = "summary" | "risk_breakdown" | "contributing_factors" | "chart" | "table" | "recommendations";

export interface ReportFilters {
    ministry: string;
    sector: string;
    state: string;
    riskLevel: string;
    projectStatus: string;
    dateMonth: string;
}

export interface ReportSection {
    id: string;
    type: ReportSectionType;
    title: string;
    description: string;
    addedAt: number;
    snapshot?: unknown;
    capturedAt: number;
    selectedParts: ReportPart[];
    observation: string;
}

export interface SavedReport {
    id: string;
    title: string;
    description: string;
    observation: string;
    scope: ReportScope;
    projectCode: string;
    projectName: string;
    filters: ReportFilters;
    sections: ReportSection[];
    executiveSummary: string;
    createdAt: number;
    updatedAt: number;
}

interface ReportsState {
    title: string;
    description: string;
    observation: string;
    scope: ReportScope;
    projectCode: string;
    projectName: string;
    filters: ReportFilters;
    sections: ReportSection[];
    history: SavedReport[];
    setTitle: (title: string) => void;
    setDescription: (description: string) => void;
    setObservation: (observation: string) => void;
    setScope: (scope: ReportScope) => void;
    setProjectCode: (projectCode: string) => void;
    setProjectName: (projectName: string) => void;
    setFilter: (key: keyof ReportFilters, value: string) => void;
    addSection: (section: Omit<ReportSection, "addedAt" | "capturedAt" | "selectedParts" | "observation"> & { selectedParts?: ReportPart[]; observation?: string }) => void;
    removeSection: (id: string) => void;
    clearSections: () => void;
    moveSection: (id: string, direction: "up" | "down") => void;
    updateSection: (id: string, patch: Partial<Pick<ReportSection, "selectedParts" | "observation" | "title" | "description">>) => void;
    saveCurrentReport: () => void;
    loadReport: (id: string) => void;
    duplicateReport: (id: string) => void;
    deleteReport: (id: string) => void;
    executiveSummary: string;
    setExecutiveSummary: (summary: string) => void;
}

export const defaultReportFilters: ReportFilters = { ministry: "", sector: "", state: "", riskLevel: "", projectStatus: "", dateMonth: "" };
export const defaultReportParts: ReportPart[] = ["summary", "risk_breakdown", "contributing_factors", "chart", "table", "recommendations"];

export const reportSectionCatalog: Array<Omit<ReportSection, "id" | "addedAt" | "capturedAt" | "snapshot" | "selectedParts" | "observation">> = [
    { type: "overview", title: "Project Overview", description: "Project identity, scope and current status." },
    { type: "cost", title: "Cost Analysis", description: "Original, revised and expenditure position." },
    { type: "schedule", title: "Schedule & Delay", description: "Schedule position, delay signals and timeline." },
    { type: "progress", title: "Physical & Financial Progress", description: "Progress indicators and project movement." },
    { type: "risk", title: "Risk Assessment", description: "Overall risk and contributing risk signals." },
    { type: "prediction", title: "ML Predictions", description: "Model-based future risk and prediction outputs." },
    { type: "warnings", title: "Early Warnings", description: "Active warnings and priority signals." },
    { type: "analytics", title: "Analytics", description: "Selected analytical views and data." },
    { type: "trends", title: "Trends", description: "Historical progress, risk and schedule trends." },
    { type: "milestones", title: "Milestone Analysis", description: "Completion and schedule milestone position." },
    { type: "recommendations", title: "Recommendations", description: "Documented recommendations and actions." },
];

export const useReportsStore = create<ReportsState>()(
    persist(
        (set) => ({
            title: "PAIMANA Project Report",
            description: "",
            observation: "",
            scope: "project",
            projectCode: "",
            projectName: "",
            filters: { ...defaultReportFilters },
            sections: [],
            history: [],
            executiveSummary: "",
            setTitle: (title) => set({ title }),
            setDescription: (description) => set({ description }),
            setObservation: (observation) => set({ observation }),
            setScope: (scope) => set({ scope }),
            setProjectCode: (projectCode) => set({ projectCode }),
            setProjectName: (projectName) => set({ projectName }),
            setFilter: (key, value) => set((state) => ({ filters: { ...state.filters, [key]: value } })),
            addSection: (section) => set((state) => {
                if (state.sections.some((existing) => existing.id === section.id)) return state;
                const now = Date.now();
                return { sections: [...state.sections, { ...section, addedAt: now, capturedAt: now, selectedParts: section.selectedParts ?? [...defaultReportParts], observation: section.observation ?? "" }] };
            }),
            removeSection: (id) => set((state) => ({ sections: state.sections.filter((section) => section.id !== id) })),
            clearSections: () => set({ sections: [], executiveSummary: "" }),
            moveSection: (id, direction) => set((state) => {
                const index = state.sections.findIndex((section) => section.id === id);
                if (index < 0) return state;
                const targetIndex = direction === "up" ? index - 1 : index + 1;
                if (targetIndex < 0 || targetIndex >= state.sections.length) return state;
                const next = [...state.sections];
                [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
                return { sections: next };
            }),
            updateSection: (id, patch) => set((state) => ({ sections: state.sections.map((section) => section.id === id ? { ...section, ...patch } : section) })),
            setExecutiveSummary: (summary) => set({ executiveSummary: summary }),
            saveCurrentReport: () => set((state) => {
                const now = Date.now();
                const report: SavedReport = {
                    id: "report-" + now,
                    title: state.title || "PAIMANA Project Report",
                    description: state.description,
                    observation: state.observation,
                    scope: state.scope,
                    projectCode: state.projectCode,
                    projectName: state.projectName,
                    filters: { ...state.filters },
                    sections: state.sections.map((section) => ({ ...section, selectedParts: [...section.selectedParts] })),
                    executiveSummary: state.executiveSummary,
                    createdAt: now,
                    updatedAt: now,
                };
                return { history: [report, ...state.history] };
            }),
            loadReport: (id) => set((state) => {
                const report = state.history.find((item) => item.id === id);
                if (!report) return state;
                return {
                    title: report.title, description: report.description, observation: report.observation,
                    scope: report.scope, projectCode: report.projectCode, projectName: report.projectName,
                    filters: { ...defaultReportFilters, ...report.filters },
                    sections: report.sections.map((section) => ({ ...section, capturedAt: section.capturedAt ?? section.addedAt, selectedParts: section.selectedParts ?? [...defaultReportParts], observation: section.observation ?? "" })),
                    executiveSummary: report.executiveSummary ?? "",
                };
            }),
            duplicateReport: (id) => set((state) => {
                const report = state.history.find((item) => item.id === id);
                if (!report) return state;
                const now = Date.now();
                return { history: [{ ...report, id: "report-" + now, title: report.title + " - Copy", createdAt: now, updatedAt: now, filters: { ...report.filters }, sections: report.sections.map((section) => ({ ...section, selectedParts: [...section.selectedParts] })) }, ...state.history] };
            }),
            deleteReport: (id) => set((state) => ({ history: state.history.filter((report) => report.id !== id) })),
        }),
        { name: "paimana-report-workspace" },
    ),
);

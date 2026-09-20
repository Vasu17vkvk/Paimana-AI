import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ReportSectionType =
    | "overview"
    | "cost"
    | "schedule"
    | "progress"
    | "risk"
    | "prediction"
    | "warnings"
    | "analytics";

export interface ReportSection {
    id: string;
    type: ReportSectionType;
    title: string;
    description: string;
    addedAt: number;
}

interface ReportsState {
    title: string;
    description: string;
    observation: string;
    sections: ReportSection[];
    setTitle: (title: string) => void;
    setDescription: (description: string) => void;
    setObservation: (observation: string) => void;
    addSection: (section: Omit<ReportSection, "addedAt">) => void;
    removeSection: (id: string) => void;
    clearSections: () => void;
    moveSection: (id: string, direction: "up" | "down") => void;
}

export const reportSectionCatalog: Array<Omit<ReportSection, "id" | "addedAt">> = [
    { type: "overview", title: "Project Overview", description: "Project identity, scope and current status." },
    { type: "cost", title: "Cost Analysis", description: "Cost position and cost-related indicators." },
    { type: "schedule", title: "Schedule & Delay", description: "Schedule position, delay signals and timeline." },
    { type: "progress", title: "Physical & Financial Progress", description: "Progress indicators and portfolio movement." },
    { type: "risk", title: "Risk Assessment", description: "Overall risk and contributing risk signals." },
    { type: "prediction", title: "ML Predictions", description: "Model-based future risk and prediction outputs." },
    { type: "warnings", title: "Early Warnings", description: "Active warnings and priority signals." },
    { type: "analytics", title: "Analytics", description: "Selected analytical views and trends." },
];

export const useReportsStore = create<ReportsState>()(
    persist(
        (set) => ({
            title: "PAIMANA Project Report",
            description: "",
            observation: "",
            sections: [],
            setTitle: (title) => set({ title }),
            setDescription: (description) => set({ description }),
            setObservation: (observation) => set({ observation }),
            addSection: (section) =>
                set((state) => {
                    if (state.sections.some((existing) => existing.id === section.id)) return state;
                    return { sections: [...state.sections, { ...section, addedAt: Date.now() }] };
                }),
            removeSection: (id) =>
                set((state) => ({ sections: state.sections.filter((section) => section.id !== id) })),
            clearSections: () => set({ sections: [] }),
            moveSection: (id, direction) =>
                set((state) => {
                    const index = state.sections.findIndex((section) => section.id === id);
                    if (index < 0) return state;
                    const targetIndex = direction === "up" ? index - 1 : index + 1;
                    if (targetIndex < 0 || targetIndex >= state.sections.length) return state;
                    const nextSections = [...state.sections];
                    [nextSections[index], nextSections[targetIndex]] = [nextSections[targetIndex], nextSections[index]];
                    return { sections: nextSections };
                }),
        }),
        { name: "paimana-report-workspace" },
    ),
);

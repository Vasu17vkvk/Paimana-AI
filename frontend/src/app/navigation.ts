import type { LucideIcon } from "lucide-react";

import {
    AlertTriangle,
    BarChart3,
    Bell,
    FileText,
    Gauge,
    Map,
    MessageSquareText,
    Timer,
    TrendingUp,
} from "lucide-react";

export interface NavigationItem {
    label: string;
    path: string;
    icon: LucideIcon;
}

export interface NavigationSection {
    title?: string;
    items: NavigationItem[];
}

export const navigationSections: NavigationSection[] = [
    {
        items: [
            {
                label: "Dashboard",
                path: "/",
                icon: Gauge,
            },
        ],
    },

    {
        title: "MONITORING",
        items: [
            {
                label: "Risk Analysis",
                path: "/risk-analysis",
                icon: AlertTriangle,
            },
            {
                label: "Cost Prediction",
                path: "/cost-prediction",
                icon: TrendingUp,
            },
            {
                label: "Delay Prediction",
                path: "/delay-prediction",
                icon: Timer,
            },
            {
                label: "Early Warnings",
                path: "/early-warnings",
                icon: Bell,
            },
        ],
    },

    {
        title: "ANALYTICS",
        items: [
            {
                label: "Project Analytics",
                path: "/project-analytics",
                icon: BarChart3,
            },
            {
                label: "Geographic View",
                path: "/geographic-view",
                icon: Map,
            },
        ],
    },

    {
        title: "INTELLIGENCE",
        items: [
            {
                label: "AI Project Assistant",
                path: "/ai-assistant",
                icon: MessageSquareText,
            },
            {
                label: "Reports",
                path: "/reports",
                icon: FileText,
            },
        ],
    },
];
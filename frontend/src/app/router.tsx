import {
    createBrowserRouter,
} from "react-router-dom";

import AppLayout from "../components/layout/AppLayout";
import DashboardPage from "../features/dashboard/DashboardPage";

import NotificationsPage from "../features/early-warnings/NotificationsPage";

import RiskAnalysisPage from "../features/risk-analysis/RiskAnalysisPage";

import EarlyWarningsPage from "../features/early-warnings/EarlyWarningsPage";

import CostPredictionPage from "../features/cost-prediction/CostPredictionPage";
import DelayPredictionPage from "../features/delay-prediction/DelayPredictionPage";

function ModulePlaceholder({
    title,
}: {
    title: string;
}) {
    return (
        <div className="mx-auto max-w-[1500px]">
            <div className="rounded-2xl border border-slate-200 bg-white p-8">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    PAIMANA AI
                </div>

                <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                    {title}
                </h1>

                <p className="mt-2 text-sm text-slate-500">
                    This module will be connected to the Flask API in the next stage.
                </p>
            </div>
        </div>
    );
}

export const router = createBrowserRouter([
    {
        path: "/",
        element: <AppLayout />,

        children: [

            {
                path: "notifications",
                element: <NotificationsPage />,
            },

            {
                index: true,
                element: <DashboardPage />,
            },

            {
                path: "risk-analysis",
                element: <RiskAnalysisPage />,
            },

            {
                path: "cost-prediction",
                element: <CostPredictionPage />,
            },

            {
                path: "delay-prediction",
                element: <DelayPredictionPage />,
            },

            {
                path: "early-warnings",
                element: <EarlyWarningsPage />,
            },

            {
                path: "project-analytics",
                element: (
                    <ModulePlaceholder title="Project Analytics" />
                ),
            },

            {
                path: "ministry-analytics",
                element: (
                    <ModulePlaceholder title="Sector / Ministry Analytics" />
                ),
            },

            {
                path: "geographic-view",
                element: (
                    <ModulePlaceholder title="Geographic View" />
                ),
            },

            {
                path: "ai-assistant",
                element: (
                    <ModulePlaceholder title="AI Project Assistant" />
                ),
            },

            {
                path: "reports",
                element: (
                    <ModulePlaceholder title="Reports" />
                ),
            },
        ],
    },
]);
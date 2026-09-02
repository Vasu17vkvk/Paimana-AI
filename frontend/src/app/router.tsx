import { createBrowserRouter } from "react-router-dom";

import AppLayout from "../components/layout/AppLayout";
import DashboardPage from "../features/dashboard/DashboardPage";
import NotificationsPage from "../features/early-warnings/NotificationsPage";

import RiskAnalysisPage from "../features/risk-analysis/RiskAnalysisPage";
import CostPredictionPage from "../features/cost-prediction/CostPredictionPage";
import DelayPredictionPage from "../features/delay-prediction/DelayPredictionPage";

export const router = createBrowserRouter([
    {
        path: "/",
        element: <AppLayout />,

        children: [
            // Dashboard
            {
                index: true,
                element: <DashboardPage />,
            },

            // Notifications
            {
                path: "notifications",
                element: <NotificationsPage />,
            },

            // Risk Analysis
            {
                path: "risk-analysis",
                element: <RiskAnalysisPage />,
            },

            // Cost Overrun Prediction
            {
                path: "cost-prediction",
                element: <CostPredictionPage />,
            },

            // Delay Prediction
            {
                path: "delay-prediction",
                element: <DelayPredictionPage />,
            },

            // Early Warnings
            {
                path: "early-warnings",
                element: <NotificationsPage />,
            },

            // Project Analytics
            {
                path: "project-analytics",
                element: <div />,
            },

            // Geographic View
            {
                path: "geographic-view",
                element: <div />,
            },

            // AI Assistant
            {
                path: "ai-assistant",
                element: <div />,
            },

            // Reports
            {
                path: "reports",
                element: <div />,
            },
        ],
    },
]);
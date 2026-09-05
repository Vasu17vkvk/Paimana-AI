import {
    lazy,
    Suspense,
} from "react";

import {
    createBrowserRouter,
} from "react-router-dom";

import AppLayout from "../components/layout/AppLayout";


/* =========================================================
   LAZY FEATURE PAGES
========================================================= */

const DashboardPage = lazy(
    () =>
        import(
            "../features/dashboard/DashboardPage"
        ),
);

const NotificationsPage = lazy(
    () =>
        import(
            "../features/early-warnings/NotificationsPage"
        ),
);

const RiskAnalysisPage = lazy(
    () =>
        import(
            "../features/risk-analysis/RiskAnalysisPage"
        ),
);

const EarlyWarningsPage = lazy(
    () =>
        import(
            "../features/early-warnings/EarlyWarningsPage"
        ),
);

const CostPredictionPage = lazy(
    () =>
        import(
            "../features/cost-prediction/CostPredictionPage"
        ),
);

const DelayPredictionPage = lazy(
    () =>
        import(
            "../features/delay-prediction/DelayPredictionPage"
        ),
);

const SectorMinistryAnalyticsPage = lazy(
    () =>
        import(
            "../features/ministry-analytics/SectorMinistryAnalyticsPage"
        ),
);

const ProjectAnalyticsPage = lazy(
    () =>
        import(
            "../features/project-analytics/ProjectAnalyticsPage"
        ),
);

const GeographicViewPage = lazy(
    () =>
        import(
            "../features/geographic-view/GeographicViewPage"
        ),
);


/* =========================================================
   LAZY PAGE WRAPPER
========================================================= */

function LazyPage({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <Suspense
            fallback={
                <div className="mx-auto w-full max-w-[1500px] px-4 py-10">
                    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                            PAIMANA AI
                        </div>

                        <div className="mt-3 text-sm font-semibold text-slate-700">
                            Loading module...
                        </div>

                        <div className="mt-1 text-xs text-slate-400">
                            Preparing the selected workspace.
                        </div>
                    </div>
                </div>
            }
        >
            {children}
        </Suspense>
    );
}


/* =========================================================
   PLACEHOLDER
========================================================= */

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


/* =========================================================
   ROUTER
========================================================= */

export const router = createBrowserRouter([
    {
        path: "/",

        element: <AppLayout />,

        children: [

            {
                path: "notifications",

                element: (
                    <LazyPage>
                        <NotificationsPage />
                    </LazyPage>
                ),
            },

            {
                index: true,

                element: (
                    <LazyPage>
                        <DashboardPage />
                    </LazyPage>
                ),
            },

            {
                path: "risk-analysis",

                element: (
                    <LazyPage>
                        <RiskAnalysisPage />
                    </LazyPage>
                ),
            },

            {
                path: "cost-prediction",

                element: (
                    <LazyPage>
                        <CostPredictionPage />
                    </LazyPage>
                ),
            },

            {
                path: "delay-prediction",

                element: (
                    <LazyPage>
                        <DelayPredictionPage />
                    </LazyPage>
                ),
            },

            {
                path: "early-warnings",

                element: (
                    <LazyPage>
                        <EarlyWarningsPage />
                    </LazyPage>
                ),
            },

            {
                path: "project-analytics",

                element: (
                    <LazyPage>
                        <ProjectAnalyticsPage />
                    </LazyPage>
                ),
            },

            {
                path: "ministry-analytics",

                element: (
                    <LazyPage>
                        <SectorMinistryAnalyticsPage />
                    </LazyPage>
                ),
            },

            {
                path: "geographic-view",

                element: (
                    <LazyPage>
                        <GeographicViewPage />
                    </LazyPage>
                ),
            },

            {
                path: "ai-assistant",

                element: (
                    <ModulePlaceholder
                        title="AI Project Assistant"
                    />
                ),
            },

            {
                path: "reports",

                element: (
                    <ModulePlaceholder
                        title="Reports"
                    />
                ),
            },

        ],
    },
]);
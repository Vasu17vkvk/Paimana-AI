import {
    AlertTriangle,
    ArrowRight,
    Bell,
    CheckCheck,
    Info,
    Search,
    ShieldAlert,
    X,
} from "lucide-react";

import {
    useEffect,
    useMemo,
    useState,
} from "react";

import { useNavigate } from "react-router-dom";

import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Input from "../../components/ui/Input";

import {
    getActiveWarnings,
    type ActiveWarning,
} from "../../services/warningsApi";


type NotificationType =
    | "critical"
    | "warning"
    | "info"
    | "success";

type NotificationCategory =
    | "Risk"
    | "Cost"
    | "Delay"
    | "Progress"
    | "System";

interface Notification {
    id: string;
    title: string;
    message: string;
    project: string;
    projectId: string;
    type: NotificationType;
    category: NotificationCategory;
    timestamp: string;
    isRead: boolean;
    actionLabel?: string;
}


/* =========================================================
   EARLY WARNING -> NOTIFICATION MAPPER
========================================================= */

function formatWarningReason(
    reason: string,
): string {
    const labels: Record<string, string> = {
        future_delay:
            "Future delay risk",
        progress_stall:
            "Progress stall risk",
        cost_pressure:
            "Cost pressure",
        extreme_schedule_change:
            "Extreme schedule change",
        extreme_cost_overrun:
            "Extreme cost overrun",
        financial_physical_divergence:
            "Financial and physical progress divergence",
        low_physical_progress:
            "Low physical progress",
        data_quality:
            "Data quality issue",
    };

    return (
        labels[reason] ??
        reason
            .replace(/_/g, " ")
            .replace(/\b\w/g, (character) =>
                character.toUpperCase(),
            )
    );
}


function getWarningCategory(
    reasons: string[],
): NotificationCategory {
    const normalizedReasons =
        reasons.map((reason) =>
            reason.toLowerCase(),
        );

    if (
        normalizedReasons.some((reason) =>
            reason.includes("cost"),
        )
    ) {
        return "Cost";
    }

    if (
        normalizedReasons.some(
            (reason) =>
                reason.includes("delay") ||
                reason.includes("schedule"),
        )
    ) {
        return "Delay";
    }

    if (
        normalizedReasons.some(
            (reason) =>
                reason.includes("progress") ||
                reason.includes("stall") ||
                reason.includes("physical"),
        )
    ) {
        return "Progress";
    }

    return "Risk";
}


function getNotificationType(
    warning: ActiveWarning,
): NotificationType {
    if (
        warning.risk_level === "CRITICAL" ||
        warning.early_warning_priority ===
            "IMMEDIATE"
    ) {
        return "critical";
    }

    if (
        warning.risk_level === "HIGH" ||
        warning.risk_level === "MEDIUM" ||
        warning.early_warning_priority === "HIGH"
    ) {
        return "warning";
    }

    return "info";
}


function formatSnapshot(
    warning: ActiveWarning,
): string {
    if (
        warning.snapshot_year !== null &&
        warning.snapshot_month !== null
    ) {
        return `Snapshot ${warning.snapshot_year}-${String(
            warning.snapshot_month,
        ).padStart(2, "0")}`;
    }

    if (warning.snapshot_year !== null) {
        return `Snapshot ${warning.snapshot_year}`;
    }

    return "Latest monitoring snapshot";
}


function mapWarningToNotification(
    warning: ActiveWarning,
): Notification {
    const reasons =
        Array.isArray(
            warning.early_warning_reasons,
        )
            ? warning.early_warning_reasons
            : [];

    const notificationType =
        getNotificationType(warning);

    const category =
        getWarningCategory(reasons);

    const reasonText =
        reasons.length > 0
            ? reasons
                .map(formatWarningReason)
                .join(", ")
            : "Active early-warning conditions detected by the ML monitoring engine.";

    const isImmediate =
        warning.early_warning_priority ===
        "IMMEDIATE";

    const isHigh =
        warning.early_warning_priority ===
        "HIGH";

    let title =
        "Early warning detected";

    if (isImmediate) {
        title =
            "Immediate action required";
    } else if (isHigh) {
        title =
            "High-priority early warning";
    } else if (
        warning.risk_level ===
        "CRITICAL"
    ) {
        title =
            "Critical project risk detected";
    } else if (
        warning.risk_level ===
        "HIGH"
    ) {
        title =
            "High project risk detected";
    }

    const projectCode =
        String(warning.project_code);

    const score =
        Number.isFinite(
            Number(
                warning.overall_risk_score,
            ),
        )
            ? Number(
                warning.overall_risk_score,
            ).toFixed(2)
            : "N/A";

    const message =
        `${reasonText}. Current ML risk score: ${score}.`;

    return {
        id: `EW-${projectCode}-${warning.snapshot_year ?? "NA"}-${warning.snapshot_month ?? "NA"}`,

        title,

        message,

        project:
            `Project ${projectCode}`,

        projectId:
            projectCode,

        type:
            notificationType,

        category,

        timestamp:
            formatSnapshot(warning),

        isRead: false,

        actionLabel:
            "View project",
    };
}


/* =========================================================
   PAGE
========================================================= */

export default function NotificationsPage() {
    const navigate =
        useNavigate();

    const [
        notifications,
        setNotifications,
    ] = useState<Notification[]>([]);

    const [
        activeTab,
        setActiveTab,
    ] = useState<
        "All" |
        "Unread" |
        "Critical" |
        NotificationCategory
    >("All");

    const [
        search,
        setSearch,
    ] = useState("");

    const [
        selectedNotification,
        setSelectedNotification,
    ] = useState<Notification | null>(
        null,
    );

    const [
        isLoading,
        setIsLoading,
    ] = useState(true);

    const [
        error,
        setError,
    ] = useState<string | null>(
        null,
    );


    /* =====================================================
       LOAD REAL EARLY WARNINGS
    ===================================================== */

    useEffect(() => {
        let cancelled = false;

        const loadWarnings =
            async () => {
                setIsLoading(true);
                setError(null);

                try {
                    const warnings =
                        await getActiveWarnings();

                    if (cancelled) {
                        return;
                    }

                    const mappedNotifications =
                        warnings.map(
                            mapWarningToNotification,
                        );

                    setNotifications(
                        mappedNotifications,
                    );
                } catch (requestError) {
                    if (cancelled) {
                        return;
                    }

                    setError(
                        requestError instanceof
                            Error
                            ? requestError.message
                            : "Unable to load active early warnings.",
                    );

                    setNotifications([]);
                } finally {
                    if (!cancelled) {
                        setIsLoading(false);
                    }
                }
            };

        loadWarnings();

        return () => {
            cancelled = true;
        };
    }, []);


    /* =====================================================
       FILTERED NOTIFICATIONS
    ===================================================== */

    const filteredNotifications =
        useMemo(() => {
            const query =
                search
                    .trim()
                    .toLowerCase();

            return notifications.filter(
                (notification) => {
                    const matchesSearch =
                        !query ||
                        notification.title
                            .toLowerCase()
                            .includes(query) ||
                        notification.message
                            .toLowerCase()
                            .includes(query) ||
                        notification.project
                            .toLowerCase()
                            .includes(query);

                    let matchesTab =
                        true;

                    if (
                        activeTab ===
                        "Unread"
                    ) {
                        matchesTab =
                            !notification.isRead;
                    }

                    if (
                        activeTab ===
                        "Critical"
                    ) {
                        matchesTab =
                            notification.type ===
                            "critical";
                    }

                    if (
                        activeTab !== "All" &&
                        activeTab !== "Unread" &&
                        activeTab !== "Critical"
                    ) {
                        matchesTab =
                            notification.category ===
                            activeTab;
                    }

                    return (
                        matchesSearch &&
                        matchesTab
                    );
                },
            );
        }, [
            notifications,
            search,
            activeTab,
        ]);


    /* =====================================================
       COUNTS
    ===================================================== */

    const unreadCount =
        notifications.filter(
            (notification) =>
                !notification.isRead,
        ).length;

    const criticalCount =
        notifications.filter(
            (notification) =>
                notification.type ===
                "critical" &&
                !notification.isRead,
        ).length;

    const warningCount =
        notifications.filter(
            (notification) =>
                notification.type ===
                "warning" &&
                !notification.isRead,
        ).length;


    /* =====================================================
       ACTIONS
    ===================================================== */

    const markAsRead = (
        notificationId: string,
    ) => {
        setNotifications(
            (current) =>
                current.map(
                    (notification) =>
                        notification.id ===
                        notificationId
                            ? {
                                ...notification,
                                isRead: true,
                            }
                            : notification,
                ),
        );

        setSelectedNotification(
            (current) =>
                current &&
                current.id ===
                notificationId
                    ? {
                        ...current,
                        isRead: true,
                    }
                    : current,
        );
    };


    const markAllAsRead = () => {
        setNotifications(
            (current) =>
                current.map(
                    (notification) => ({
                        ...notification,
                        isRead: true,
                    }),
                ),
        );

        setSelectedNotification(
            (current) =>
                current
                    ? {
                        ...current,
                        isRead: true,
                    }
                    : current,
        );
    };


    const removeNotification = (
        notificationId: string,
    ) => {
        setNotifications(
            (current) =>
                current.filter(
                    (notification) =>
                        notification.id !==
                        notificationId,
                ),
        );

        if (
            selectedNotification?.id ===
            notificationId
        ) {
            setSelectedNotification(
                null,
            );
        }
    };


    /* =====================================================
       RENDER
    ===================================================== */

    return (
        <div className="mx-auto w-full max-w-[1400px]">

            {/* ==================================================
              PAGE HEADER
            =================================================== */}

            <div className="mb-6">

                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">

                    <div>
                        <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                            <Bell size={12} />
                            Notification Center
                        </div>

                        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                            Notifications
                        </h1>

                        <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500 sm:text-sm">
                            Review active AI-generated project
                            early warnings, risk signals,
                            and priority alerts.
                        </p>
                    </div>


                    <div className="flex gap-2">

                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={
                                markAllAsRead
                            }
                            disabled={
                                unreadCount ===
                                0
                            }
                        >
                            <CheckCheck size={14} />
                            Mark all as read
                        </Button>

                    </div>

                </div>

            </div>


            {/* ==================================================
              SUMMARY CARDS
            =================================================== */}

            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">

                <NotificationSummary
                    label="Total"
                    value={
                        notifications.length
                    }
                    icon={
                        <Bell size={17} />
                    }
                />

                <NotificationSummary
                    label="Unread"
                    value={
                        unreadCount
                    }
                    icon={
                        <Info size={17} />
                    }
                />

                <NotificationSummary
                    label="Critical"
                    value={
                        criticalCount
                    }
                    icon={
                        <ShieldAlert
                            size={17}
                        />
                    }
                />

                <NotificationSummary
                    label="Warnings"
                    value={
                        warningCount
                    }
                    icon={
                        <AlertTriangle
                            size={17}
                        />
                    }
                />

            </section>


            {/* ==================================================
              CONTENT
            =================================================== */}

            <section className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[1fr_380px]">

                {/* Notification list */}
                <Card
                    padding="none"
                    className="min-w-0 overflow-hidden"
                >

                    {/* Search / tabs */}
                    <div className="border-b border-slate-100 p-4 sm:p-5">

                        <div className="flex flex-col gap-4">

                            {/* Search */}
                            <div className="relative w-full sm:max-w-md">

                                <Search
                                    size={15}
                                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                                />

                                <Input
                                    value={search}
                                    onChange={(
                                        event,
                                    ) =>
                                        setSearch(
                                            event.target.value,
                                        )
                                    }
                                    placeholder="Search notifications..."
                                    className="pl-9"
                                />

                            </div>


                            {/* Tabs */}
                            <div className="flex min-w-0 gap-1 overflow-x-auto pb-1">

                                <NotificationTab
                                    label="All"
                                    count={
                                        notifications.length
                                    }
                                    active={
                                        activeTab ===
                                        "All"
                                    }
                                    onClick={() =>
                                        setActiveTab(
                                            "All",
                                        )
                                    }
                                />

                                <NotificationTab
                                    label="Unread"
                                    count={
                                        unreadCount
                                    }
                                    active={
                                        activeTab ===
                                        "Unread"
                                    }
                                    onClick={() =>
                                        setActiveTab(
                                            "Unread",
                                        )
                                    }
                                />

                                <NotificationTab
                                    label="Critical"
                                    count={
                                        notifications.filter(
                                            (item) =>
                                                item.type ===
                                                "critical",
                                        ).length
                                    }
                                    active={
                                        activeTab ===
                                        "Critical"
                                    }
                                    onClick={() =>
                                        setActiveTab(
                                            "Critical",
                                        )
                                    }
                                />

                                <NotificationTab
                                    label="Risk"
                                    count={
                                        notifications.filter(
                                            (item) =>
                                                item.category ===
                                                "Risk",
                                        ).length
                                    }
                                    active={
                                        activeTab ===
                                        "Risk"
                                    }
                                    onClick={() =>
                                        setActiveTab(
                                            "Risk",
                                        )
                                    }
                                />

                                <NotificationTab
                                    label="Cost"
                                    count={
                                        notifications.filter(
                                            (item) =>
                                                item.category ===
                                                "Cost",
                                        ).length
                                    }
                                    active={
                                        activeTab ===
                                        "Cost"
                                    }
                                    onClick={() =>
                                        setActiveTab(
                                            "Cost",
                                        )
                                    }
                                />

                                <NotificationTab
                                    label="Delay"
                                    count={
                                        notifications.filter(
                                            (item) =>
                                                item.category ===
                                                "Delay",
                                        ).length
                                    }
                                    active={
                                        activeTab ===
                                        "Delay"
                                    }
                                    onClick={() =>
                                        setActiveTab(
                                            "Delay",
                                        )
                                    }
                                />

                                <NotificationTab
                                    label="Progress"
                                    count={
                                        notifications.filter(
                                            (item) =>
                                                item.category ===
                                                "Progress",
                                        ).length
                                    }
                                    active={
                                        activeTab ===
                                        "Progress"
                                    }
                                    onClick={() =>
                                        setActiveTab(
                                            "Progress",
                                        )
                                    }
                                />

                                <NotificationTab
                                    label="System"
                                    active={
                                        activeTab ===
                                        "System"
                                    }
                                    onClick={() =>
                                        setActiveTab(
                                            "System",
                                        )
                                    }
                                />

                            </div>

                        </div>

                    </div>


                    {/* List */}
                    <div>

                        {isLoading ? (
                            <div className="px-5 py-16 text-center">

                                <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">
                                    <Bell
                                        size={20}
                                        className="animate-pulse"
                                    />
                                </div>

                                <h3 className="mt-4 text-sm font-bold text-slate-800">
                                    Loading early warnings
                                </h3>

                                <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-slate-400">
                                    Fetching the latest
                                    AI-generated project
                                    alerts.
                                </p>

                            </div>
                        ) : error ? (
                            <div className="px-5 py-16 text-center">

                                <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-red-50 text-red-500">
                                    <ShieldAlert
                                        size={20}
                                    />
                                </div>

                                <h3 className="mt-4 text-sm font-bold text-slate-800">
                                    Unable to load warnings
                                </h3>

                                <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-slate-400">
                                    {error}
                                </p>

                            </div>
                        ) : filteredNotifications.length === 0 ? (
                            <div className="px-5 py-16 text-center">

                                <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">
                                    <Bell size={20} />
                                </div>

                                <h3 className="mt-4 text-sm font-bold text-slate-800">
                                    No active notifications
                                </h3>

                                <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-slate-400">
                                    There are no active early
                                    warnings matching the
                                    selected category or
                                    search term.
                                </p>

                            </div>
                        ) : (
                            filteredNotifications.map(
                                (notification) => (
                                    <NotificationRow
                                        key={
                                            notification.id
                                        }
                                        notification={
                                            notification
                                        }
                                        onOpen={() => {
                                            markAsRead(
                                                notification.id,
                                            );

                                            setSelectedNotification(
                                                notification,
                                            );
                                        }}
                                        onDelete={() =>
                                            removeNotification(
                                                notification.id,
                                            )
                                        }
                                    />
                                ),
                            )
                        )}

                    </div>

                </Card>


                {/* Desktop detail panel */}
                <div className="hidden xl:sticky xl:top-[92px] xl:block xl:self-start">

                    {selectedNotification ? (
                        <NotificationDetails
                            notification={
                                selectedNotification
                            }
                            onClose={() =>
                                setSelectedNotification(
                                    null,
                                )
                            }
                            onProject={() => {
                                if (
                                    selectedNotification.projectId
                                ) {
                                    navigate(
                                        `/project-analytics?project=${selectedNotification.projectId}`,
                                    );
                                }
                            }}
                        />
                    ) : (
                        <NotificationDetailsEmpty />
                    )}

                </div>

            </section>


            {/* Mobile notification detail sheet */}
            {selectedNotification && (
                <div className="fixed inset-0 z-[100] flex items-end bg-slate-950/40 xl:hidden">

                    <button
                        type="button"
                        aria-label="Close notification details"
                        onClick={() =>
                            setSelectedNotification(
                                null,
                            )
                        }
                        className="absolute inset-0"
                    />

                    <div className="relative z-10 max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl sm:p-5">

                        <NotificationDetails
                            notification={
                                selectedNotification
                            }
                            onClose={() =>
                                setSelectedNotification(
                                    null,
                                )
                            }
                            onProject={() => {
                                if (
                                    selectedNotification.projectId
                                ) {
                                    setSelectedNotification(
                                        null,
                                    );

                                    navigate(
                                        `/project-analytics?project=${selectedNotification.projectId}`,
                                    );
                                }
                            }}
                        />

                    </div>

                </div>
            )}

        </div>
    );
}


/* =========================================================
   SUMMARY CARD
========================================================= */

function NotificationSummary({
    label,
    value,
    icon,
}: {
    label: string;
    value: number;
    icon: React.ReactNode;
}) {
    return (
        <Card padding="md">

            <div className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-500">
                {icon}
            </div>

            <div className="mt-4 text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">
                {label}
            </div>

            <div className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                {value}
            </div>

        </Card>
    );
}


/* =========================================================
   TAB
========================================================= */

function NotificationTab({
    label,
    count,
    active,
    onClick,
}: {
    label: string;
    count?: number;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={[
                "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold transition-colors",
                active
                    ? "bg-slate-900 text-white"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
            ].join(" ")}
        >
            {label}

            {count !== undefined && (
                <span
                    className={[
                        "rounded-full px-1.5 py-0.5 text-[9px]",
                        active
                            ? "bg-white/15 text-white"
                            : "bg-slate-100 text-slate-400",
                    ].join(" ")}
                >
                    {count}
                </span>
            )}
        </button>
    );
}


/* =========================================================
   NOTIFICATION ROW
========================================================= */

function NotificationRow({
    notification,
    onOpen,
    onDelete,
}: {
    notification: Notification;
    onOpen: () => void;
    onDelete: () => void;
}) {
    const config =
        notificationVisual(
            notification.type,
        );

    const Icon =
        config.icon;

    return (
        <div
            className={[
                "group flex gap-3 border-b border-slate-100 p-4 transition-colors sm:p-5",
                !notification.isRead
                    ? "bg-slate-50/60"
                    : "bg-white",
                "hover:bg-slate-50",
            ].join(" ")}
        >

            {/* Icon */}
            <div
                className={[
                    "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
                    config.iconBackground,
                    config.iconText,
                ].join(" ")}
            >
                <Icon size={17} />
            </div>


            {/* Content */}
            <button
                type="button"
                onClick={onOpen}
                className="min-w-0 flex-1 text-left"
            >

                <div className="flex flex-wrap items-center gap-2">

                    {!notification.isRead && (
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                    )}

                    <h3 className="text-xs font-bold text-slate-800 sm:text-sm">
                        {notification.title}
                    </h3>

                    <Badge
                        variant={
                            config.badgeVariant
                        }
                    >
                        {notification.category}
                    </Badge>

                </div>


                <p className="mt-1.5 line-clamp-2 text-[11px] leading-5 text-slate-500 sm:text-xs">
                    {notification.message}
                </p>


                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400">

                    {notification.project && (
                        <span className="font-semibold text-slate-500">
                            {notification.project}
                        </span>
                    )}

                    <span>
                        {notification.timestamp}
                    </span>

                </div>

            </button>


            {/* Actions */}
            <div className="flex shrink-0 items-start gap-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">

                <button
                    type="button"
                    title="Delete notification"
                    onClick={
                        onDelete
                    }
                    className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                >
                    <X size={14} />
                </button>

                <button
                    type="button"
                    title="Open notification"
                    onClick={onOpen}
                    className="hidden h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 sm:grid"
                >
                    <ArrowRight size={14} />
                </button>

            </div>

        </div>
    );
}


/* =========================================================
   DETAILS
========================================================= */

function NotificationDetails({
    notification,
    onClose,
    onProject,
}: {
    notification: Notification;
    onClose: () => void;
    onProject: () => void;
}) {
    const config =
        notificationVisual(
            notification.type,
        );

    const Icon =
        config.icon;

    return (
        <Card padding="lg">

            <div className="flex items-start justify-between gap-3">

                <div
                    className={[
                        "grid h-10 w-10 place-items-center rounded-xl",
                        config.iconBackground,
                        config.iconText,
                    ].join(" ")}
                >
                    <Icon size={19} />
                </div>

                <button
                    type="button"
                    onClick={onClose}
                    className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    aria-label="Close notification"
                >
                    <X size={16} />
                </button>

            </div>


            <div className="mt-5">

                <Badge
                    variant={
                        config.badgeVariant
                    }
                    dot
                >
                    {notification.category}
                </Badge>

                <h2 className="mt-3 text-lg font-bold leading-6 tracking-tight text-slate-900">
                    {notification.title}
                </h2>

                <p className="mt-2 text-xs leading-5 text-slate-500">
                    {notification.message}
                </p>

            </div>


            {notification.project && (
                <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50 p-4">

                    <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">
                        RELATED PROJECT
                    </div>

                    <div className="mt-1 text-sm font-bold text-slate-800">
                        {notification.project}
                    </div>

                    <div className="mt-1 text-[10px] text-slate-400">
                        {notification.projectId}
                    </div>

                </div>
            )}


            <div className="mt-6 grid grid-cols-2 gap-3">

                <DetailMetric
                    label="Severity"
                    value={
                        notification.type
                            .charAt(0)
                            .toUpperCase() +
                        notification.type.slice(1)
                    }
                />

                <DetailMetric
                    label="Time"
                    value={
                        notification.timestamp
                    }
                />

            </div>


            {notification.project && (
                <Button
                    fullWidth
                    className="mt-6"
                    onClick={
                        onProject
                    }
                >
                    Open project
                    <ArrowRight size={14} />
                </Button>
            )}

        </Card>
    );
}


/* =========================================================
   DETAIL METRIC
========================================================= */

function DetailMetric({
    label,
    value,
}: {
    label: string;
    value: string;
}) {
    return (
        <div className="rounded-xl border border-slate-100 p-3">

            <div className="text-[9px] font-bold uppercase tracking-[0.06em] text-slate-400">
                {label}
            </div>

            <div className="mt-1 text-xs font-semibold text-slate-700">
                {value}
            </div>

        </div>
    );
}


/* =========================================================
   EMPTY DETAILS
========================================================= */

function NotificationDetailsEmpty() {
    return (
        <Card
            padding="lg"
            className="min-h-[330px]"
        >

            <div className="flex h-full min-h-[290px] flex-col items-center justify-center text-center">

                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">
                    <Bell size={20} />
                </div>

                <h3 className="mt-4 text-sm font-bold text-slate-800">
                    Select a notification
                </h3>

                <p className="mt-2 max-w-xs text-xs leading-5 text-slate-400">
                    Select an alert from the list to
                    view details and take action.
                </p>

            </div>

        </Card>
    );
}


/* =========================================================
   VISUAL CONFIG
========================================================= */

function notificationVisual(
    type: NotificationType,
) {
    switch (type) {
        case "critical":
            return {
                icon: ShieldAlert,

                iconBackground:
                    "bg-red-50",

                iconText:
                    "text-red-600",

                badgeVariant:
                    "danger" as const,
            };

        case "warning":
            return {
                icon: AlertTriangle,

                iconBackground:
                    "bg-amber-50",

                iconText:
                    "text-amber-600",

                badgeVariant:
                    "warning" as const,
            };

        case "success":
            return {
                icon: CheckCheck,

                iconBackground:
                    "bg-emerald-50",

                iconText:
                    "text-emerald-600",

                badgeVariant:
                    "success" as const,
            };

        case "info":
        default:
            return {
                icon: Info,

                iconBackground:
                    "bg-blue-50",

                iconText:
                    "text-blue-600",

                badgeVariant:
                    "info" as const,
            };
    }
}
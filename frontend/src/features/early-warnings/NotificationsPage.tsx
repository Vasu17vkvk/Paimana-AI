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

import { useMemo, useState } from "react";

import { useNavigate } from "react-router-dom";

import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Input from "../../components/ui/Input";

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
   MOCK NOTIFICATION DATA
========================================================= */

const initialNotifications: Notification[] = [
    {
        id: "N-001",
        title: "Critical delay risk detected",
        message:
            "Schedule deterioration has increased the predicted delay risk for National Highway Development.",
        project: "National Highway Development",
        projectId: "PM-400005",
        type: "critical",
        category: "Delay",
        timestamp: "10 minutes ago",
        isRead: false,
        actionLabel: "View project",
    },

    {
        id: "N-002",
        title: "High cost escalation risk",
        message:
            "The predicted cost trajectory has moved above the monitoring threshold.",
        project: "Freight Logistics Corridor",
        projectId: "PM-400882",
        type: "critical",
        category: "Cost",
        timestamp: "32 minutes ago",
        isRead: false,
        actionLabel: "View prediction",
    },

    {
        id: "N-003",
        title: "Risk score increased",
        message:
            "Overall project risk increased from 68 to 82 following new schedule and progress signals.",
        project: "Regional Water Supply System",
        projectId: "PM-400117",
        type: "warning",
        category: "Risk",
        timestamp: "1 hour ago",
        isRead: false,
        actionLabel: "Review risk",
    },

    {
        id: "N-004",
        title: "Physical progress has stalled",
        message:
            "No meaningful physical progress has been recorded during the latest monitoring period.",
        project: "Regional Power Infrastructure",
        projectId: "PM-400993",
        type: "warning",
        category: "Progress",
        timestamp: "2 hours ago",
        isRead: false,
        actionLabel: "View project",
    },

    {
        id: "N-005",
        title: "Schedule revision detected",
        message:
            "The expected completion date has moved by more than six months.",
        project: "Integrated Railway Corridor",
        projectId: "PM-400331",
        type: "warning",
        category: "Delay",
        timestamp: "3 hours ago",
        isRead: true,
        actionLabel: "View project",
    },

    {
        id: "N-006",
        title: "Cost revision recorded",
        message:
            "The latest project estimate reflects an updated approved/revised cost.",
        project: "Power Transmission Expansion",
        projectId: "PM-400221",
        type: "info",
        category: "Cost",
        timestamp: "5 hours ago",
        isRead: true,
        actionLabel: "View project",
    },

    {
        id: "N-007",
        title: "Monitoring data updated",
        message:
            "The latest project monitoring dataset has been successfully processed.",
        project: "",
        projectId: "",
        type: "success",
        category: "System",
        timestamp: "Yesterday",
        isRead: true,
    },

    {
        id: "N-008",
        title: "Monthly monitoring cycle completed",
        message:
            "April 2026 monitoring records are now available for dashboard analysis.",
        project: "",
        projectId: "",
        type: "info",
        category: "System",
        timestamp: "Yesterday",
        isRead: true,
    },

    {
        id: "N-009",
        title: "Progress health warning",
        message:
            "The project is progressing below the expected trajectory.",
        project: "Metro Connectivity Programme",
        projectId: "PM-401104",
        type: "warning",
        category: "Progress",
        timestamp: "2 days ago",
        isRead: true,
        actionLabel: "View project",
    },
];


/* =========================================================
   PAGE
========================================================= */

export default function NotificationsPage() {
    const navigate = useNavigate();

    const [notifications, setNotifications] =
        useState<Notification[]>(
            initialNotifications,
        );

    const [activeTab, setActiveTab] =
        useState<
            "All" | "Unread" | "Critical" | NotificationCategory
        >("All");

    const [search, setSearch] =
        useState("");

    const [selectedNotification, setSelectedNotification] =
        useState<Notification | null>(null);

    const filteredNotifications =
        useMemo(() => {
            const query =
                search.trim().toLowerCase();

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

                    let matchesTab = true;

                    if (activeTab === "Unread") {
                        matchesTab =
                            !notification.isRead;
                    }

                    if (activeTab === "Critical") {
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
                            Review project alerts, risk changes,
                            cost and schedule warnings, and system
                            updates.
                        </p>
                    </div>


                    <div className="flex gap-2">

                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={markAllAsRead}
                            disabled={unreadCount === 0}
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
                    value={unreadCount}
                    icon={
                        <Info size={17} />
                    }
                />

                <NotificationSummary
                    label="Critical"
                    value={criticalCount}
                    icon={
                        <ShieldAlert size={17} />
                    }
                />

                <NotificationSummary
                    label="Warnings"
                    value={
                        notifications.filter(
                            (item) =>
                                item.type ===
                                "warning" &&
                                !item.isRead,
                        ).length
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
                                    onChange={(event) =>
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
                                        activeTab === "All"
                                    }
                                    onClick={() =>
                                        setActiveTab(
                                            "All",
                                        )
                                    }
                                />

                                <NotificationTab
                                    label="Unread"
                                    count={unreadCount}
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

                        {filteredNotifications.length ===
                            0 ? (
                            <div className="px-5 py-16 text-center">

                                <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">
                                    <Bell size={20} />
                                </div>

                                <h3 className="mt-4 text-sm font-bold text-slate-800">
                                    No notifications found
                                </h3>

                                <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-slate-400">
                                    Try changing the selected category
                                    or search term.
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
                            notification={selectedNotification}
                            onClose={() =>
                                setSelectedNotification(null)
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
                            setSelectedNotification(null)
                        }
                        className="absolute inset-0"
                    />

                    <div className="relative z-10 max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl sm:p-5">
                        <NotificationDetails
                            notification={selectedNotification}
                            onClose={() =>
                                setSelectedNotification(null)
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

    const Icon = config.icon;

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

    const Icon = config.icon;

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
                    Select an alert from the list to view
                    details and take action.
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
import {
    AlertTriangle,
    ArrowRight,
    Bell,
    CheckCheck,
    Info,
    Loader2,
    Search,
    ShieldAlert,
    X,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Input from "../../components/ui/Input";
import { apiRequest } from "../../services/api";

type NotificationType = "critical" | "warning" | "info" | "success";

type NotificationCategory =
    | "Risk"
    | "Cost"
    | "Delay"
    | "Progress"
    | "System";

interface EarlyWarningProject {
    project_code: number | string;
    project_name?: string | null;
    sector?: string | null;
    ministry?: string | null;
    state?: string | null;
    delay_days?: number | null;
    cost_overrun_pct?: number | null;
    physical_progress_pct?: number | null;
    schedule_status?: string | null;
    cost_status?: string | null;
    warning_count?: number;
    warnings?: string[];
}

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

const READ_STORAGE_KEY = "paimana-notification-read";
const HIDDEN_STORAGE_KEY = "paimana-notification-hidden";

function normaliseProjectCode(value: number | string | null | undefined) {
    return String(value ?? "").replace(/^PM-/i, "").trim();
}

function categoryForWarnings(warnings: string[]): NotificationCategory {
    const text = warnings.join(" ").toLowerCase();

    const hasCost = text.includes("cost") || text.includes("expenditure");
    const hasDelay = text.includes("delay") || text.includes("schedule");

    const hasProgress =
        text.includes("progress") || text.includes("stagnation");

    if (hasCost && !hasDelay && !hasProgress) return "Cost";
    if (hasDelay && !hasCost && !hasProgress) return "Delay";
    if (hasProgress && !hasCost && !hasDelay) return "Progress";

    return "Risk";
}

function severityForProject(
    project: EarlyWarningProject,
): NotificationType {
    const count = Number(project.warning_count ?? project.warnings?.length ?? 0);

    if (count >= 4) return "critical";
    return count >= 1 ? "warning" : "info";
}

function titleForProject(project: EarlyWarningProject) {
    const warnings = project.warnings ?? [];
    const count = Number(project.warning_count ?? warnings.length);

    if (count >= 4) return "Critical project warning";
    if (count >= 2) return "Multiple project warnings";
    return warnings[0] ? `${warnings[0]} detected` : "Project warning detected";
}

function messageForProject(project: EarlyWarningProject) {
    const warnings = project.warnings ?? [];
    const parts: string[] = [];

    if (warnings.length) {
        parts.push(warnings.join(", ") + ".");
    }

    if (project.delay_days != null && Number(project.delay_days) > 0) {
        parts.push(`Current delay: ${Number(project.delay_days).toFixed(0)} days.`);
    }

    if (project.cost_overrun_pct != null && Number(project.cost_overrun_pct) > 0) {
        parts.push(
            `Cost overrun: ${Number(project.cost_overrun_pct).toFixed(1)}%.`,
        );
    }

    if (project.physical_progress_pct != null) {
        parts.push(
            `Physical progress: ${Number(project.physical_progress_pct).toFixed(1)}%.`,
        );
    }

    return parts.join(" ") || "An active monitoring warning requires review.";
}

function buildNotifications(
    projects: EarlyWarningProject[],
    readIds: Set<string>,
    hiddenIds: Set<string>,
): Notification[] {
    return projects
        .map((project) => {
            const projectId = normaliseProjectCode(project.project_code);
            const id = `EW-${projectId}`;

            return {
                id,
                title: titleForProject(project),
                message: messageForProject(project),
                project: project.project_name?.trim() || `Project ${projectId}`,
                projectId,
                type: severityForProject(project),
                category: categoryForWarnings(project.warnings ?? []),
                timestamp: "Active now",
                isRead: readIds.has(id),
                actionLabel: "View project",
            };
        })
        .filter((notification) => !hiddenIds.has(notification.id));
}

export default function NotificationsPage() {
    const navigate = useNavigate();

    const [projects, setProjects] = useState<EarlyWarningProject[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [readIds, setReadIds] = useState<Set<string>>(() => {
        try {
            return new Set(
                JSON.parse(
                    localStorage.getItem(READ_STORAGE_KEY) || "[]",
                ),
            );
        } catch {
            return new Set();
        }
    });

    const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => {
        try {
            return new Set(
                JSON.parse(
                    localStorage.getItem(HIDDEN_STORAGE_KEY) || "[]",
                ),
            );
        } catch {
            return new Set();
        }
    });

    const [activeTab, setActiveTab] = useState<
        "All" | "Unread" | "Critical" | NotificationCategory
    >("All");

    const [search, setSearch] = useState("");
    const [selectedNotification, setSelectedNotification] =
        useState<Notification | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function loadWarnings() {
            setLoading(true);
            setError(null);

            try {
                const response = await apiRequest<EarlyWarningProject[]>(
                    "/early-warnings/projects",
                );

                if (!cancelled) {
                    setProjects(Array.isArray(response) ? response : []);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(
                        err instanceof Error
                            ? err.message
                            : "Failed to load notifications.",
                    );
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        loadWarnings();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        localStorage.setItem(
            READ_STORAGE_KEY,
            JSON.stringify([...readIds]),
        );
    }, [readIds]);

    useEffect(() => {
        localStorage.setItem(
            HIDDEN_STORAGE_KEY,
            JSON.stringify([...hiddenIds]),
        );
    }, [hiddenIds]);

    const notifications = useMemo(
        () => buildNotifications(projects, readIds, hiddenIds),
        [projects, readIds, hiddenIds],
    );

    const filteredNotifications = useMemo(() => {
        const query = search.trim().toLowerCase();

        return notifications.filter((notification) => {
            const matchesSearch =
                !query ||
                notification.title.toLowerCase().includes(query) ||
                notification.message.toLowerCase().includes(query) ||
                notification.project.toLowerCase().includes(query);

            let matchesTab = true;

            if (activeTab === "Unread") {
                matchesTab = !notification.isRead;
            } else if (activeTab === "Critical") {
                matchesTab = notification.type === "critical";
            } else if (activeTab === "All") {
                matchesTab = true;
            } else {
                matchesTab = notification.category === activeTab;
            }

            return matchesSearch && matchesTab;
        });
    }, [notifications, search, activeTab]);

    const unreadCount = notifications.filter(
        (notification) => !notification.isRead,
    ).length;

    const criticalCount = notifications.filter(
        (notification) => notification.type === "critical",
    ).length;

    const warningCount = notifications.filter(
        (notification) => notification.type === "warning",
    ).length;

    const markAsRead = (notificationId: string) => {
        setReadIds((current) => {
            const next = new Set(current);
            next.add(notificationId);
            return next;
        });
    };

    const markAllAsRead = () => {
        setReadIds((current) => {
            const next = new Set(current);
            notifications.forEach((notification) => next.add(notification.id));
            return next;
        });
    };

    const removeNotification = (notificationId: string) => {
        setHiddenIds((current) => {
            const next = new Set(current);
            next.add(notificationId);
            return next;
        });

        if (selectedNotification?.id === notificationId) {
            setSelectedNotification(null);
        }
    };

    const openProject = (projectId: string) => {
        if (!projectId) return;

        setSelectedNotification(null);
        navigate(`/project-analytics?project=${encodeURIComponent(projectId)}`);
    };

    return (
        <div className="mx-auto w-full max-w-[1400px]">
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
                            Live project warnings generated from the current
                            PAIMANA early-warning monitoring data.
                        </p>
                    </div>

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

            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <NotificationSummary
                    label="Active"
                    value={notifications.length}
                    icon={<Bell size={17} />}
                />

                <NotificationSummary
                    label="Unread"
                    value={unreadCount}
                    icon={<Info size={17} />}
                />

                <NotificationSummary
                    label="Critical"
                    value={criticalCount}
                    icon={<ShieldAlert size={17} />}
                />

                <NotificationSummary
                    label="Warnings"
                    value={warningCount}
                    icon={<AlertTriangle size={17} />}
                />
            </section>

            <section className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[1fr_380px]">
                <Card padding="none" className="min-w-0 overflow-hidden">
                    <div className="border-b border-slate-100 p-4 sm:p-5">
                        <div className="flex flex-col gap-4">
                            <div className="relative w-full sm:max-w-md">
                                <Search
                                    size={15}
                                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                                />

                                <Input
                                    value={search}
                                    onChange={(event) =>
                                        setSearch(event.target.value)
                                    }
                                    placeholder="Search notifications..."
                                    className="pl-9"
                                />
                            </div>

                            <div className="flex min-w-0 gap-1 overflow-x-auto pb-1">
                                <NotificationTab
                                    label="All"
                                    count={notifications.length}
                                    active={activeTab === "All"}
                                    onClick={() => setActiveTab("All")}
                                />

                                <NotificationTab
                                    label="Unread"
                                    count={unreadCount}
                                    active={activeTab === "Unread"}
                                    onClick={() => setActiveTab("Unread")}
                                />

                                <NotificationTab
                                    label="Critical"
                                    count={criticalCount}
                                    active={activeTab === "Critical"}
                                    onClick={() => setActiveTab("Critical")}
                                />

                                {(
                                    [
                                        "Risk",
                                        "Cost",
                                        "Delay",
                                        "Progress",
                                    ] as NotificationCategory[]
                                ).map((category) => (
                                    <NotificationTab
                                        key={category}
                                        label={category}
                                        active={activeTab === category}
                                        onClick={() => setActiveTab(category)}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex min-h-[320px] items-center justify-center">
                            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                                <Loader2
                                    size={16}
                                    className="animate-spin"
                                />
                                Loading live warnings...
                            </div>
                        </div>
                    ) : error ? (
                        <div className="px-5 py-16 text-center">
                            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-red-50 text-red-500">
                                <ShieldAlert size={20} />
                            </div>

                            <h3 className="mt-4 text-sm font-bold text-slate-800">
                                Could not load notifications
                            </h3>

                            <p className="mx-auto mt-2 max-w-lg text-xs leading-5 text-slate-400">
                                {error}
                            </p>
                        </div>
                    ) : filteredNotifications.length === 0 ? (
                        <div className="px-5 py-16 text-center">
                            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">
                                <Bell size={20} />
                            </div>

                            <h3 className="mt-4 text-sm font-bold text-slate-800">
                                No notifications found
                            </h3>

                            <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-slate-400">
                                No active warnings match the selected
                                category or search term.
                            </p>
                        </div>
                    ) : (
                        <div>
                            {filteredNotifications.map((notification) => (
                                <NotificationRow
                                    key={notification.id}
                                    notification={notification}
                                    onOpen={() => {
                                        markAsRead(notification.id);
                                        setSelectedNotification(notification);
                                    }}
                                    onDelete={() =>
                                        removeNotification(notification.id)
                                    }
                                />
                            ))}
                        </div>
                    )}
                </Card>

                <div className="hidden xl:sticky xl:top-[92px] xl:block xl:self-start">
                    {selectedNotification ? (
                        <NotificationDetails
                            notification={selectedNotification}
                            onClose={() => setSelectedNotification(null)}
                            onProject={() =>
                                openProject(selectedNotification.projectId)
                            }
                        />
                    ) : (
                        <NotificationDetailsEmpty />
                    )}
                </div>
            </section>

            {selectedNotification && (
                <div className="fixed inset-0 z-[100] flex items-end bg-slate-950/40 xl:hidden">
                    <button
                        type="button"
                        aria-label="Close notification details"
                        onClick={() => setSelectedNotification(null)}
                        className="absolute inset-0"
                    />

                    <div className="relative z-10 max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl sm:p-5">
                        <NotificationDetails
                            notification={selectedNotification}
                            onClose={() => setSelectedNotification(null)}
                            onProject={() =>
                                openProject(selectedNotification.projectId)
                            }
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

function NotificationSummary({
    label,
    value,
    icon,
}: {
    label: string;
    value: number;
    icon: ReactNode;
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

function NotificationRow({
    notification,
    onOpen,
    onDelete,
}: {
    notification: Notification;
    onOpen: () => void;
    onDelete: () => void;
}) {
    const config = notificationVisual(notification.type);
    const Icon = config.icon;

    return (
        <div
            className={[
                "group flex gap-3 border-b border-slate-100 p-4 transition-colors sm:p-5",
                !notification.isRead ? "bg-slate-50/60" : "bg-white",
                "hover:bg-slate-50",
            ].join(" ")}
        >
            <div
                className={[
                    "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
                    config.iconBackground,
                    config.iconText,
                ].join(" ")}
            >
                <Icon size={17} />
            </div>

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

                    <Badge variant={config.badgeVariant}>
                        {notification.category}
                    </Badge>
                </div>

                <p className="mt-1.5 line-clamp-2 text-[11px] leading-5 text-slate-500 sm:text-xs">
                    {notification.message}
                </p>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400">
                    <span className="font-semibold text-slate-500">
                        {notification.project}
                    </span>

                    <span>{notification.timestamp}</span>
                </div>
            </button>

            <div className="flex shrink-0 items-start gap-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
                <button
                    type="button"
                    title="Hide notification"
                    onClick={onDelete}
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

function NotificationDetails({
    notification,
    onClose,
    onProject,
}: {
    notification: Notification;
    onClose: () => void;
    onProject: () => void;
}) {
    const config = notificationVisual(notification.type);
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
                <Badge variant={config.badgeVariant} dot>
                    {notification.category}
                </Badge>

                <h2 className="mt-3 text-lg font-bold leading-6 tracking-tight text-slate-900">
                    {notification.title}
                </h2>

                <p className="mt-2 text-xs leading-5 text-slate-500">
                    {notification.message}
                </p>
            </div>

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

            <div className="mt-6 grid grid-cols-2 gap-3">
                <DetailMetric
                    label="Severity"
                    value={
                        notification.type.charAt(0).toUpperCase() +
                        notification.type.slice(1)
                    }
                />

                <DetailMetric
                    label="Status"
                    value={notification.timestamp}
                />
            </div>

            <Button fullWidth className="mt-6" onClick={onProject}>
                Open project
                <ArrowRight size={14} />
            </Button>
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
        <Card padding="lg" className="min-h-[330px]">
            <div className="flex h-full min-h-[290px] flex-col items-center justify-center text-center">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">
                    <Bell size={20} />
                </div>

                <h3 className="mt-4 text-sm font-bold text-slate-800">
                    Select a notification
                </h3>

                <p className="mt-2 max-w-xs text-xs leading-5 text-slate-400">
                    Select an alert from the list to view details and take
                    action.
                </p>
            </div>
        </Card>
    );
}

function notificationVisual(type: NotificationType) {
    switch (type) {
        case "critical":
            return {
                icon: ShieldAlert,
                iconBackground: "bg-red-50",
                iconText: "text-red-600",
                badgeVariant: "danger" as const,
            };

        case "warning":
            return {
                icon: AlertTriangle,
                iconBackground: "bg-amber-50",
                iconText: "text-amber-600",
                badgeVariant: "warning" as const,
            };

        case "success":
            return {
                icon: CheckCheck,
                iconBackground: "bg-emerald-50",
                iconText: "text-emerald-600",
                badgeVariant: "success" as const,
            };

        case "info":
        default:
            return {
                icon: Info,
                iconBackground: "bg-blue-50",
                iconText: "text-blue-600",
                badgeVariant: "info" as const,
            };
    }
}

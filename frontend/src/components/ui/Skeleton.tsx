interface SkeletonProps {
    className?: string;
}

export default function Skeleton({
    className = "",
}: SkeletonProps) {
    return (
        <div
            className={[
                "animate-pulse rounded-lg bg-slate-200",
                className,
            ]
                .filter(Boolean)
                .join(" ")}
        />
    );
}
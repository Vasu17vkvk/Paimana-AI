export type RiskLevel =
    | "Low"
    | "Moderate"
    | "Elevated"
    | "High"
    | "Critical";

export function getRiskLevel(
    score: number,
): RiskLevel {
    if (score >= 85) {
        return "Critical";
    }

    if (score >= 70) {
        return "High";
    }

    if (score >= 50) {
        return "Elevated";
    }

    if (score >= 30) {
        return "Moderate";
    }

    return "Low";
}

export function getRiskBadgeVariant(
    level: RiskLevel,
) {
    switch (level) {
        case "Critical":
            return "danger" as const;

        case "High":
            return "warning" as const;

        case "Elevated":
            return "warning" as const;

        case "Moderate":
            return "info" as const;

        case "Low":
            return "success" as const;

        default:
            return "neutral" as const;
    }
}

export function getRiskScoreLabel(
    score: number,
): string {
    return getRiskLevel(score);
}
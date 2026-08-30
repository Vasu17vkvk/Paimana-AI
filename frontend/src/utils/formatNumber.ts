export function formatNumber(
    value: number,
): string {
    return new Intl.NumberFormat(
        "en-IN",
    ).format(value);
}

export function formatPercent(
    value: number,
    decimals = 1,
): string {
    return `${value.toFixed(decimals)}%`;
}

export function formatCrore(
    value: number,
    decimals = 2,
): string {
    return new Intl.NumberFormat(
        "en-IN",
        {
            minimumFractionDigits: 0,
            maximumFractionDigits: decimals,
        },
    ).format(value);
}
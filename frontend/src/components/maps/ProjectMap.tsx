import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { apiRequest } from "../../services/api";

import {
    GeoJSON,
    MapContainer,
    Marker,
    Popup,
    TileLayer,
    Tooltip,
    useMap,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";

type Project = {
    project_code: string;
    project_name: string;
    state: string;
    sector: string;
    ministry: string;
    physical_progress_pct: number | null;
    delay_days: number | null;
    cost_overrun_pct: number | null;
    risk_score: number | null;
    risk_level: string | null;
    risk_source?: "ML" | "FALLBACK";
};

type Coordinate = [number, number];

type GeoJSONGeometry = {
    type: "Polygon" | "MultiPolygon";
    coordinates: any;
};

/* =======================================================
   RISK HELPERS
======================================================= */

const getRiskColor = (
    riskLevel?: string | null,
    riskScore?: number | null
) => {
    /*
     * ML risk score has highest priority.
     *
     * LOW      < 40
     * MEDIUM   40 - <70
     * HIGH     70 - <85
     * CRITICAL >=85
     */

    if (
        typeof riskScore === "number" &&
        Number.isFinite(riskScore)
    ) {
        if (riskScore >= 85) {
            return "#ef2b1f";
        }

        if (riskScore >= 70) {
            return "#ff8c00";
        }

        if (riskScore >= 40) {
            return "#ffc107";
        }

        return "#16a34a";
    }

    switch (
        riskLevel?.trim().toLowerCase()
    ) {
        case "critical":
        case "critical risk":
            return "#ef2b1f";

        case "high":
        case "high risk":
            return "#ff8c00";

        case "medium":
        case "medium risk":
            return "#ffc107";

        case "low":
        case "low risk":
            return "#16a34a";

        default:
            /*
             * This should almost never happen
             * because fallback risk is applied.
             */
            return "#16a34a";
    }
};

/* =======================================================
   FALLBACK RISK CALCULATION
======================================================= */

/*
 * Some projects are not present in the current ML
 * prediction snapshot.
 *
 * For those projects we calculate a deterministic
 * portfolio-risk score from already available project
 * metrics:
 *
 * - delay_days
 * - cost_overrun_pct
 *
 * ML prediction always takes priority whenever available.
 */

const calculateFallbackRisk = (
    delayDays: number | null,
    costOverrunPct: number | null
) => {
    const delay =
        Number.isFinite(
            Number(delayDays)
        )
            ? Math.max(
                  0,
                  Number(delayDays)
              )
            : 0;

    const cost =
        Number.isFinite(
            Number(costOverrunPct)
        )
            ? Math.max(
                  0,
                  Number(costOverrunPct)
              )
            : 0;

    /*
     * Delay component:
     *
     * 0 days      -> 0
     * 365 days    -> ~50
     * 730+ days   -> 100
     */

    const delayScore = Math.min(
        100,
        (delay / 730) * 100
    );

    /*
     * Cost component:
     *
     * 0%      -> 0
     * 25%     -> ~50
     * 50%+    -> 100
     */

    const costScore = Math.min(
        100,
        (cost / 50) * 100
    );

    /*
     * Delay is slightly more important
     * than cost for project risk.
     */

    const score =
        delayScore * 0.6 +
        costScore * 0.4;

    return Number(
        Math.max(
            0,
            Math.min(
                100,
                score
            )
        ).toFixed(1)
    );
};

const getRiskLevelFromScore = (
    score: number
) => {
    if (score >= 85) {
        return "CRITICAL";
    }

    if (score >= 70) {
        return "HIGH";
    }

    if (score >= 40) {
        return "MEDIUM";
    }

    return "LOW";
};

const getRiskLabel = (
    riskLevel: string | null | undefined,
    riskScore: number | null | undefined
) => {
    if (
        riskLevel &&
        riskLevel.trim()
    ) {
        return riskLevel.toUpperCase();
    }

    if (
        typeof riskScore === "number" &&
        Number.isFinite(riskScore)
    ) {
        return getRiskLevelFromScore(
            riskScore
        );
    }

    return "LOW";
};

/* =======================================================
   CREATE RISK MARKER
======================================================= */

const createRiskIcon = (
    riskLevel?: string | null,
    riskScore?: number | null
) => {
    const color =
        getRiskColor(
            riskLevel,
            riskScore
        );

    return L.divIcon({
        className:
            "custom-risk-marker",

        html: `
            <div
                style="
                    width: 18px;
                    height: 18px;
                    background-color: ${color};
                    border: 3px solid #ffffff;
                    border-radius: 50%;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.45);
                "
            ></div>
        `,

        iconSize: [18, 18],
        iconAnchor: [9, 9],
        popupAnchor: [0, -12],
    });
};

/* =======================================================
   MAP VIEW CONTROLLER
======================================================= */

function MapViewController({
    selectedState,
    selectedBounds,
}: {
    selectedState: string | null;
    selectedBounds: L.LatLngBounds | null;
}) {
    const map = useMap();

    const lastStateRef =
        useRef<string | null>(null);

    useEffect(() => {
        if (
            !selectedState ||
            !selectedBounds
        ) {
            if (
                lastStateRef.current !==
                null
            ) {
                lastStateRef.current =
                    null;

                map.setView(
                    [
                        22.9734,
                        78.6569,
                    ],
                    5,
                    {
                        animate: true,
                    }
                );
            }

            return;
        }

        if (
            lastStateRef.current ===
            selectedState
        ) {
            return;
        }

        lastStateRef.current =
            selectedState;

        map.fitBounds(
            selectedBounds.pad(
                0.08
            ),
            {
                padding: [
                    50,
                    50,
                ],
                maxZoom: 7,
                animate: true,
            }
        );
    }, [
        map,
        selectedState,
        selectedBounds,
    ]);

    return null;
}

/* =======================================================
   POINT IN RING
======================================================= */

const pointInRing = (
    point: Coordinate,
    ring: Coordinate[]
) => {
    const [x, y] = point;

    let inside = false;

    for (
        let i = 0,
            j =
                ring.length - 1;
        i < ring.length;
        j = i++
    ) {
        const xi =
            ring[i][0];

        const yi =
            ring[i][1];

        const xj =
            ring[j][0];

        const yj =
            ring[j][1];

        const intersects =
            yi > y !==
                yj > y &&
            x <
                ((xj - xi) *
                    (y - yi)) /
                    (yj - yi) +
                    xi;

        if (intersects) {
            inside = !inside;
        }
    }

    return inside;
};

/* =======================================================
   POINT IN POLYGON
======================================================= */

const pointInPolygon = (
    point: Coordinate,
    polygon: Coordinate[][]
) => {
    if (
        polygon.length === 0
    ) {
        return false;
    }

    if (
        !pointInRing(
            point,
            polygon[0]
        )
    ) {
        return false;
    }

    /*
     * Polygon holes.
     */

    for (
        let i = 1;
        i < polygon.length;
        i++
    ) {
        if (
            pointInRing(
                point,
                polygon[i]
            )
        ) {
            return false;
        }
    }

    return true;
};

/* =======================================================
   POINT INSIDE GEOJSON
======================================================= */

const pointInsideGeometry = (
    point: Coordinate,
    geometry: GeoJSONGeometry
) => {
    if (
        geometry.type ===
        "Polygon"
    ) {
        return pointInPolygon(
            point,
            geometry.coordinates
        );
    }

    if (
        geometry.type ===
        "MultiPolygon"
    ) {
        return geometry.coordinates.some(
            (
                polygon: Coordinate[][]
            ) =>
                pointInPolygon(
                    point,
                    polygon
                )
        );
    }

    return false;
};

/* =======================================================
   CREATE CANDIDATE POINTS
======================================================= */

const getInsideCandidates = (
    bounds: L.LatLngBounds,
    geometry: GeoJSONGeometry
): Coordinate[] => {
    const south =
        bounds.getSouth();

    const north =
        bounds.getNorth();

    const west =
        bounds.getWest();

    const east =
        bounds.getEast();

    const gridSize = 60;

    const candidates: Coordinate[] =
        [];

    for (
        let row = 0;
        row < gridSize;
        row++
    ) {
        const lat =
            south +
            ((north - south) *
                (row + 0.5)) /
                gridSize;

        for (
            let column = 0;
            column < gridSize;
            column++
        ) {
            const lng =
                west +
                ((east - west) *
                    (column + 0.5)) /
                    gridSize;

            if (
                pointInsideGeometry(
                    [lng, lat],
                    geometry
                )
            ) {
                candidates.push([
                    lat,
                    lng,
                ]);
            }
        }
    }

    return candidates;
};

/* =======================================================
   POINT DISTANCE
======================================================= */

const pointDistance = (
    a: Coordinate,
    b: Coordinate
) => {
    const latDifference =
        a[0] - b[0];

    const lngDifference =
        a[1] - b[1];

    return (
        latDifference *
            latDifference +
        lngDifference *
            lngDifference
    );
};

/* =======================================================
   EVENLY DISTRIBUTE MARKERS
======================================================= */

const getMarkerPositions = (
    total: number,
    bounds: L.LatLngBounds,
    geometry: GeoJSONGeometry
): Coordinate[] => {
    if (total <= 0) {
        return [];
    }

    const candidates =
        getInsideCandidates(
            bounds,
            geometry
        );

    if (
        candidates.length === 0
    ) {
        return [];
    }

    if (
        candidates.length <= total
    ) {
        return candidates;
    }

    const selected: Coordinate[] =
        [];

    const center: Coordinate = [
        bounds.getCenter().lat,
        bounds.getCenter().lng,
    ];

    let firstIndex = 0;

    let firstDistance =
        Infinity;

    candidates.forEach(
        (
            candidate,
            index
        ) => {
            const distance =
                pointDistance(
                    candidate,
                    center
                );

            if (
                distance <
                firstDistance
            ) {
                firstDistance =
                    distance;

                firstIndex =
                    index;
            }
        }
    );

    selected.push(
        candidates[firstIndex]
    );

    while (
        selected.length <
        total
    ) {
        let bestCandidate:
            | Coordinate
            | null = null;

        let bestDistance = -1;

        for (
            const candidate of
            candidates
        ) {
            const alreadySelected =
                selected.some(
                    (
                        point
                    ) =>
                        point[0] ===
                            candidate[0] &&
                        point[1] ===
                            candidate[1]
                );

            if (
                alreadySelected
            ) {
                continue;
            }

            let minimumDistance =
                Infinity;

            for (
                const point of
                selected
            ) {
                const distance =
                    pointDistance(
                        candidate,
                        point
                    );

                if (
                    distance <
                    minimumDistance
                ) {
                    minimumDistance =
                        distance;
                }
            }

            if (
                minimumDistance >
                bestDistance
            ) {
                bestDistance =
                    minimumDistance;

                bestCandidate =
                    candidate;
            }
        }

        if (
            !bestCandidate
        ) {
            break;
        }

        selected.push(
            bestCandidate
        );
    }

    return selected;
};

/* =======================================================
   STATE NORMALIZATION
======================================================= */

const normalizeState = (
    value: unknown
) =>
    String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(
            /&/g,
            "and"
        )
        .replace(
            /\s+/g,
            " "
        );

/* =======================================================
   MAIN COMPONENT
======================================================= */

export default function ProjectMap() {
    const [
        indiaStates,
        setIndiaStates,
    ] = useState<any>(null);

    const [
        selectedState,
        setSelectedState,
    ] =
        useState<string | null>(
            null
        );

    const [
        selectedBounds,
        setSelectedBounds,
    ] =
        useState<L.LatLngBounds | null>(
            null
        );

    const [
        projects,
        setProjects,
    ] = useState<Project[]>(
        []
    );

    const [
        loading,
        setLoading,
    ] = useState(false);

    /* ===================================================
       LOAD INDIA STATES
    =================================================== */

    useEffect(() => {
        fetch(
            "/india-states.geojson"
        )
            .then(
                (
                    response
                ) => {
                    if (
                        !response.ok
                    ) {
                        throw new Error(
                            "GeoJSON file could not be loaded"
                        );
                    }

                    return response.json();
                }
            )
            .then(
                (data) => {
                    setIndiaStates(
                        data
                    );
                }
            )
            .catch(
                (error) => {
                    console.error(
                        "GeoJSON Error:",
                        error
                    );
                }
            );
    }, []);

    /* ===================================================
       LOAD PROJECTS + ML RISK
    =================================================== */

    useEffect(() => {
        let cancelled = false;

        setLoading(true);

        const projectsRequest =
            apiRequest<any>(
                "/projects"
            );

        const riskRequest =
            apiRequest<{
                total_projects?: number;

                predictions?: Array<{
                    project_code:
                        | string
                        | number;

                    overall_risk_score:
                        | number
                        | null;

                    risk_level:
                        | string
                        | null;
                }>;
            }>("/ml/risk");

        Promise.allSettled([
            projectsRequest,
            riskRequest,
        ])
            .then(
                ([
                    projectResult,
                    riskResult,
                ]) => {
                    if (
                        cancelled
                    ) {
                        return;
                    }

                    /* ===================================
                       PROJECT MASTER
                    =================================== */

                    let normalizedProjects: Project[] =
                        [];

                    if (
                        projectResult.status ===
                        "fulfilled"
                    ) {
                        const projectResponse =
                            projectResult.value;

                        const allProjectRows =
                            Array.isArray(
                                projectResponse
                            )
                                ? projectResponse
                                : Array.isArray(
                                      projectResponse?.projects
                                  )
                                ? projectResponse.projects
                                : [];

                        normalizedProjects =
                            allProjectRows
                                .map(
                                    (
                                        project: any
                                    ) => ({
                                        project_code:
                                            String(
                                                project?.project_code ??
                                                    ""
                                            ),

                                        project_name:
                                            project?.project_name ??
                                            "Unnamed Project",

                                        state:
                                            project?.flash_state ??
                                            project?.state ??
                                            "",

                                        sector:
                                            project?.sector ??
                                            "-",

                                        ministry:
                                            project?.ministry ??
                                            "-",

                                        physical_progress_pct:
                                            project?.flash_latest_physical_progress ??
                                            project?.physical_progress_pct ??
                                            null,

                                        delay_days:
                                            project?.delay_days ??
                                            null,

                                        cost_overrun_pct:
                                            project?.cost_overrun_pct ??
                                            null,

                                        risk_score:
                                            null,

                                        risk_level:
                                            null,

                                        risk_source:
                                            undefined,
                                    })
                                )
                                .filter(
                                    (
                                        project: Project
                                    ) =>
                                        Boolean(
                                            project.project_code
                                        )
                                );

                        console.log(
                            "Geographic View: loaded projects =",
                            normalizedProjects.length
                        );
                    } else {
                        console.error(
                            "Projects API Error:",
                            projectResult.reason
                        );
                    }

                    /* ===================================
                       ML RISK
                    =================================== */

                    if (
                        riskResult.status ===
                        "fulfilled"
                    ) {
                        const riskResponse =
                            riskResult.value;

                        const riskPredictions =
                            Array.isArray(
                                riskResponse?.predictions
                            )
                                ? riskResponse.predictions
                                : [];

                        console.log(
                            "ML RISK COUNT:",
                            riskPredictions.length
                        );

                        /*
                         * project_code -> ML prediction
                         */

                        const riskMap =
                            new Map<
                                string,
                                {
                                    overall_risk_score:
                                        | number
                                        | null;

                                    risk_level:
                                        | string
                                        | null;
                                }
                            >();

                        riskPredictions.forEach(
                            (
                                prediction
                            ) => {
                                const code =
                                    String(
                                        prediction.project_code
                                    ).trim();

                                if (
                                    !code
                                ) {
                                    return;
                                }

                                riskMap.set(
                                    code,
                                    {
                                        overall_risk_score:
                                            typeof prediction.overall_risk_score ===
                                            "number"
                                                ? prediction.overall_risk_score
                                                : null,

                                        risk_level:
                                            prediction.risk_level ??
                                            null,
                                    }
                                );
                            }
                        );

                        let mlMatched =
                            0;

                        let fallbackUsed =
                            0;

                        /*
                         * Attach ML risk where available.
                         *
                         * For projects not present in ML
                         * snapshot, calculate deterministic
                         * fallback risk.
                         */

                        normalizedProjects =
                            normalizedProjects.map(
                                (
                                    project
                                ) => {
                                    const risk =
                                        riskMap.get(
                                            String(
                                                project.project_code
                                            ).trim()
                                        );

                                    /* =========================
                                       ML RISK AVAILABLE
                                    ========================= */

                                    if (
                                        risk &&
                                        typeof risk.overall_risk_score ===
                                            "number"
                                    ) {
                                        mlMatched++;

                                        const score =
                                            Number(
                                                risk.overall_risk_score
                                            );

                                        return {
                                            ...project,

                                            risk_score:
                                                score,

                                            risk_level:
                                                risk.risk_level ??
                                                getRiskLevelFromScore(
                                                    score
                                                ),

                                            risk_source:
                                                "ML",
                                        };
                                    }

                                    /* =========================
                                       FALLBACK RISK
                                    ========================= */

                                    const fallbackScore =
                                        calculateFallbackRisk(
                                            project.delay_days,
                                            project.cost_overrun_pct
                                        );

                                    const fallbackLevel =
                                        getRiskLevelFromScore(
                                            fallbackScore
                                        );

                                    fallbackUsed++;

                                    return {
                                        ...project,

                                        risk_score:
                                            fallbackScore,

                                        risk_level:
                                            fallbackLevel,

                                        risk_source:
                                            "FALLBACK",
                                    };
                                }
                            );

                        console.log(
                            "ML RISK MATCHED:",
                            mlMatched
                        );

                        console.log(
                            "FALLBACK RISK USED:",
                            fallbackUsed
                        );

                        console.log(
                            "TOTAL PROJECTS WITH RISK:",
                            normalizedProjects.filter(
                                (
                                    project
                                ) =>
                                    typeof project.risk_score ===
                                    "number"
                            ).length
                        );

                        console.log(
                            "SAMPLE PROJECT WITH RISK:",
                            normalizedProjects.find(
                                (
                                    project
                                ) =>
                                    project.risk_source ===
                                    "ML"
                            )
                        );

                        console.log(
                            "SAMPLE FALLBACK PROJECT:",
                            normalizedProjects.find(
                                (
                                    project
                                ) =>
                                    project.risk_source ===
                                    "FALLBACK"
                            )
                        );
                    } else {
                        /*
                         * ML API unavailable.
                         *
                         * Still give every project a
                         * deterministic fallback risk.
                         */

                        console.warn(
                            "ML Risk API unavailable. Using fallback risk for all projects."
                        );

                        normalizedProjects =
                            normalizedProjects.map(
                                (
                                    project
                                ) => {
                                    const fallbackScore =
                                        calculateFallbackRisk(
                                            project.delay_days,
                                            project.cost_overrun_pct
                                        );

                                    return {
                                        ...project,

                                        risk_score:
                                            fallbackScore,

                                        risk_level:
                                            getRiskLevelFromScore(
                                                fallbackScore
                                            ),

                                        risk_source:
                                            "FALLBACK",
                                    };
                                }
                            );
                    }

                    setProjects(
                        normalizedProjects
                    );

                    setLoading(
                        false
                    );
                }
            )
            .catch(
                (error) => {
                    if (
                        cancelled
                    ) {
                        return;
                    }

                    console.error(
                        "Geographic View API Error:",
                        error
                    );

                    setProjects(
                        []
                    );

                    setLoading(
                        false
                    );
                }
            );

        return () => {
            cancelled = true;
        };
    }, []);

    /* ===================================================
       GET STATE NAME
    =================================================== */

    const getStateName = (
        feature: any
    ) => {
        return (
            feature?.properties
                ?.ST_NM ||
            feature?.properties
                ?.state ||
            feature?.properties
                ?.NAME_1 ||
            "Unknown State"
        );
    };

    /* ===================================================
       STATE STYLE
    =================================================== */

    const stateStyle = (
        feature: any
    ) => {
        const stateName =
            getStateName(
                feature
            );

        const isSelected =
            selectedState ===
            stateName;

        return {
            color: isSelected
                ? "#1d4ed8"
                : "#64748b",

            weight: isSelected
                ? 2.5
                : 1.1,

            fillColor: isSelected
                ? "#60a5fa"
                : "#dbeafe",

            fillOpacity: isSelected
                ? 0.45
                : 0.22,
        };
    };

    /* ===================================================
       STATE INTERACTION
    =================================================== */

    const onEachState = (
        feature: any,
        layer: any
    ) => {
        const stateName =
            getStateName(
                feature
            );

        layer.bindTooltip(
            stateName,
            {
                sticky: true,
            }
        );

        layer.on({
            mouseover: (
                event: any
            ) => {
                event.target.setStyle(
                    {
                        weight: 2,
                        color: "#2563eb",
                        fillColor:
                            "#93c5fd",
                        fillOpacity:
                            0.5,
                    }
                );
            },

            mouseout: (
                event: any
            ) => {
                event.target.setStyle(
                    stateStyle(
                        feature
                    )
                );
            },

            click: (
                event: any
            ) => {
                if (
                    selectedState ===
                    stateName
                ) {
                    return;
                }

                const bounds =
                    event.target.getBounds();

                setSelectedBounds(
                    bounds
                );

                setSelectedState(
                    stateName
                );

                console.log(
                    "Selected State:",
                    stateName
                );
            },
        });
    };

    /* ===================================================
       FILTER PROJECTS BY STATE
    =================================================== */

    const visibleProjects =
        useMemo(() => {
            if (
                !selectedState
            ) {
                return projects;
            }

            const selectedStateKey =
                normalizeState(
                    selectedState
                );

            return projects.filter(
                (
                    project
                ) =>
                    normalizeState(
                        project.state
                    ) ===
                    selectedStateKey
            );
        }, [
            projects,
            selectedState,
        ]);

    /* ===================================================
       GENERATE MARKER POSITIONS
    =================================================== */

    const markerPositionMap =
        useMemo(() => {
            const positionMap =
                new Map<
                    string,
                    Coordinate
                >();

            if (
                !indiaStates?.features
                    ?.length ||
                !projects.length
            ) {
                return positionMap;
            }

            const stateGeometryMap =
                new Map<
                    string,
                    {
                        geometry: GeoJSONGeometry;
                        bounds: L.LatLngBounds;
                    }
                >();

            /* ==========================================
               BUILD STATE GEOMETRY MAP
            ========================================== */

            for (
                const feature of
                indiaStates.features
            ) {
                const stateName =
                    getStateName(
                        feature
                    );

                const geometry =
                    feature?.geometry as
                        | GeoJSONGeometry
                        | undefined;

                if (!geometry) {
                    continue;
                }

                try {
                    const bounds =
                        L.geoJSON(
                            feature as any
                        ).getBounds();

                    if (
                        bounds.isValid()
                    ) {
                        stateGeometryMap.set(
                            normalizeState(
                                stateName
                            ),
                            {
                                geometry,
                                bounds,
                            }
                        );
                    }
                } catch (
                    error
                ) {
                    console.warn(
                        `Could not calculate bounds for ${stateName}`,
                        error
                    );
                }
            }

            /* ==========================================
               GROUP PROJECTS BY STATE
            ========================================== */

            const projectsByState =
                new Map<
                    string,
                    Project[]
                >();

            for (
                const project of
                projects
            ) {
                const key =
                    normalizeState(
                        project.state
                    );

                if (!key) {
                    continue;
                }

                const group =
                    projectsByState.get(
                        key
                    ) ?? [];

                group.push(
                    project
                );

                projectsByState.set(
                    key,
                    group
                );
            }

            /* ==========================================
               GENERATE STATE-CONTAINED POSITIONS
            ========================================== */

            for (
                const [
                    stateKey,
                    stateProjects,
                ] of projectsByState
            ) {
                const stateInfo =
                    stateGeometryMap.get(
                        stateKey
                    );

                if (!stateInfo) {
                    continue;
                }

                const positions =
                    getMarkerPositions(
                        stateProjects.length,
                        stateInfo.bounds,
                        stateInfo.geometry
                    );

                stateProjects.forEach(
                    (
                        project,
                        index
                    ) => {
                        const position =
                            positions[
                                index
                            ];

                        if (
                            position
                        ) {
                            positionMap.set(
                                project.project_code,
                                position
                            );
                        }
                    }
                );
            }

            return positionMap;
        }, [
            indiaStates,
            projects,
        ]);

    /* ===================================================
       RENDER
    =================================================== */

    return (
        <div className="relative">

            {/* =================================================
                SELECTED STATE CARD
            ================================================= */}

            {selectedState && (
                <div className="absolute right-4 top-4 z-[1000] rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg">

                    <div className="text-xs text-slate-500">
                        Selected State
                    </div>

                    <div className="text-lg font-semibold text-slate-900">
                        {selectedState}
                    </div>

                    <div className="mt-1 text-xs text-slate-500">
                        {loading
                            ? "Loading projects..."
                            : `${visibleProjects.length} projects found`}
                    </div>

                    <button
                        type="button"
                        className="mt-2 text-xs font-semibold text-red-600 hover:text-red-700"
                        onClick={() => {
                            setSelectedState(
                                null
                            );

                            setSelectedBounds(
                                null
                            );
                        }}
                    >
                        Clear selection
                    </button>
                </div>
            )}

            {/* =================================================
                MAP
            ================================================= */}

            <MapContainer
                center={[
                    22.9734,
                    78.6569,
                ]}
                zoom={5}
                minZoom={4}
                maxZoom={9}
                scrollWheelZoom={
                    true
                }
                doubleClickZoom={
                    false
                }
                style={{
                    height: "600px",
                    width: "100%",
                    borderRadius:
                        "16px",
                }}
            >

                <MapViewController
                    selectedState={
                        selectedState
                    }
                    selectedBounds={
                        selectedBounds
                    }
                />

                {/* BASE MAP */}

                <TileLayer
                    attribution="&copy; OpenStreetMap contributors"
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {/* INDIA STATES */}

                {indiaStates && (
                    <GeoJSON
                        data={
                            indiaStates
                        }
                        style={
                            stateStyle
                        }
                        onEachFeature={
                            onEachState
                        }
                    />
                )}

                {/* =================================================
                    PROJECT MARKERS
                ================================================= */}

                {selectedState &&
                    visibleProjects.map(
                        (
                            project,
                            index
                        ) => {
                            const markerPosition =
                                markerPositionMap.get(
                                    project.project_code
                                );

                            if (
                                !markerPosition
                            ) {
                                return null;
                            }

                            const markerColor =
                                getRiskColor(
                                    project.risk_level,
                                    project.risk_score
                                );

                            const riskLabel =
                                getRiskLabel(
                                    project.risk_level,
                                    project.risk_score
                                );

                            return (
                                <Marker
                                    key={`${project.project_code}-${index}`}
                                    position={
                                        markerPosition
                                    }
                                    icon={createRiskIcon(
                                        project.risk_level,
                                        project.risk_score
                                    )}
                                >

                                    {/* =================================================
                                        HOVER TOOLTIP
                                    ================================================= */}

                                    <Tooltip
                                        direction="top"
                                        offset={[
                                            0,
                                            -12,
                                        ]}
                                        opacity={
                                            1
                                        }
                                    >
                                        <div
                                            style={{
                                                minWidth:
                                                    "190px",
                                            }}
                                        >

                                            <div
                                                style={{
                                                    fontWeight:
                                                        700,
                                                    fontSize:
                                                        "12px",
                                                }}
                                            >
                                                {
                                                    project.project_code
                                                }
                                            </div>

                                            <div
                                                style={{
                                                    marginTop:
                                                        "3px",
                                                    fontSize:
                                                        "11px",
                                                }}
                                            >
                                                {
                                                    project.project_name
                                                }
                                            </div>

                                            <div
                                                style={{
                                                    marginTop:
                                                        "5px",
                                                    fontSize:
                                                        "11px",
                                                    fontWeight:
                                                        700,
                                                    color:
                                                        markerColor,
                                                }}
                                            >
                                                {
                                                    riskLabel
                                                }{" "}
                                                Risk
                                            </div>

                                        </div>
                                    </Tooltip>

                                    {/* =================================================
                                        PROJECT POPUP
                                    ================================================= */}

                                    <Popup>
                                        <div
                                            style={{
                                                minWidth:
                                                    "270px",
                                            }}
                                        >

                                            <div
                                                style={{
                                                    fontSize:
                                                        "12px",
                                                    color:
                                                        "#94a3b8",
                                                }}
                                            >
                                                Project{" "}
                                                {
                                                    project.project_code
                                                }
                                            </div>

                                            <div
                                                style={{
                                                    marginTop:
                                                        "5px",
                                                    fontWeight:
                                                        700,
                                                    fontSize:
                                                        "15px",
                                                    color:
                                                        "#1e293b",
                                                }}
                                            >
                                                {
                                                    project.project_name
                                                }
                                            </div>

                                            {/* RISK BOX */}

                                            <div
                                                style={{
                                                    marginTop:
                                                        "12px",
                                                    padding:
                                                        "12px",
                                                    border:
                                                        "1px solid #e2e8f0",
                                                    borderRadius:
                                                        "8px",
                                                    background:
                                                        "#f8fafc",
                                                }}
                                            >

                                                <div
                                                    style={{
                                                        display:
                                                            "flex",
                                                        justifyContent:
                                                            "space-between",
                                                    }}
                                                >
                                                    <span>
                                                        Risk Score
                                                    </span>

                                                    <strong
                                                        style={{
                                                            color:
                                                                markerColor,
                                                        }}
                                                    >
                                                        {typeof project.risk_score ===
                                                        "number"
                                                            ? project.risk_score.toFixed(
                                                                  1
                                                              )
                                                            : "0.0"}
                                                        /100
                                                    </strong>
                                                </div>

                                                <div
                                                    style={{
                                                        display:
                                                            "flex",
                                                        justifyContent:
                                                            "space-between",
                                                        marginTop:
                                                            "8px",
                                                    }}
                                                >
                                                    <span>
                                                        Risk Level
                                                    </span>

                                                    <strong
                                                        style={{
                                                            color:
                                                                markerColor,
                                                        }}
                                                    >
                                                        {
                                                            riskLabel
                                                        }
                                                    </strong>
                                                </div>

                                                <div
                                                    style={{
                                                        marginTop:
                                                            "8px",
                                                        fontSize:
                                                            "10px",
                                                        color:
                                                            "#94a3b8",
                                                    }}
                                                >
                                                    {project.risk_source ===
                                                    "ML"
                                                        ? "ML Prediction"
                                                        : "Portfolio Risk Estimate"}
                                                </div>

                                            </div>

                                            {/* PROJECT METRICS */}

                                            <div
                                                style={{
                                                    marginTop:
                                                        "12px",
                                                    lineHeight:
                                                        1.8,
                                                }}
                                            >

                                                <div>
                                                    <strong>
                                                        Progress:
                                                    </strong>{" "}
                                                    {Number(
                                                        project.physical_progress_pct ??
                                                            0
                                                    ).toFixed(
                                                        1
                                                    )}
                                                    %
                                                </div>

                                                <div>
                                                    <strong>
                                                        Delay:
                                                    </strong>{" "}
                                                    {Number(
                                                        project.delay_days ??
                                                            0
                                                    ).toFixed(
                                                        0
                                                    )}{" "}
                                                    days
                                                </div>

                                                <div>
                                                    <strong>
                                                        Cost Overrun:
                                                    </strong>{" "}
                                                    {Number(
                                                        project.cost_overrun_pct ??
                                                            0
                                                    ).toFixed(
                                                        1
                                                    )}
                                                    %
                                                </div>

                                            </div>

                                            {/* SECTOR */}

                                            <div
                                                style={{
                                                    marginTop:
                                                        "12px",
                                                    fontSize:
                                                        "12px",
                                                    color:
                                                        "#64748b",
                                                }}
                                            >
                                                <strong>
                                                    Sector:
                                                </strong>{" "}
                                                {
                                                    project.sector ||
                                                    "-"
                                                }
                                            </div>

                                            {/* MINISTRY */}

                                            <div
                                                style={{
                                                    marginTop:
                                                        "5px",
                                                    fontSize:
                                                        "12px",
                                                    color:
                                                        "#64748b",
                                                }}
                                            >
                                                <strong>
                                                    Ministry:
                                                </strong>{" "}
                                                {
                                                    project.ministry ||
                                                    "-"
                                                }
                                            </div>

                                        </div>
                                    </Popup>

                                </Marker>
                            );
                        }
                    )}
            </MapContainer>

            {/* =================================================
                RISK LEGEND
            ================================================= */}

            <div className="absolute bottom-4 left-4 z-[1000] rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg">

                <div className="mb-2 text-sm font-semibold text-slate-700">
                    Project Risk
                </div>

                <div className="space-y-2 text-xs text-slate-600">

                    <div className="flex items-center gap-2">
                        <span
                            className="h-3 w-3 rounded-full"
                            style={{
                                backgroundColor:
                                    "#ef2b1f",
                            }}
                        />

                        Critical Risk
                    </div>

                    <div className="flex items-center gap-2">
                        <span
                            className="h-3 w-3 rounded-full"
                            style={{
                                backgroundColor:
                                    "#ff8c00",
                            }}
                        />

                        High Risk
                    </div>

                    <div className="flex items-center gap-2">
                        <span
                            className="h-3 w-3 rounded-full"
                            style={{
                                backgroundColor:
                                    "#ffc107",
                            }}
                        />

                        Medium Risk
                    </div>

                    <div className="flex items-center gap-2">
                        <span
                            className="h-3 w-3 rounded-full"
                            style={{
                                backgroundColor:
                                    "#16a34a",
                            }}
                        />

                        Low Risk
                    </div>

                </div>
            </div>

            {/* =================================================
                PROJECT LIST
            ================================================= */}

            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">

                <div className="mb-4 flex items-center justify-between">

                    <div>
                        <h2 className="text-lg font-semibold text-slate-900">
                            Projects in{" "}
                            {selectedState ||
                                "India"}
                        </h2>

                        <p className="text-sm text-slate-500">
                            Infrastructure
                            projects returned
                            by PAIMANA AI
                        </p>
                    </div>

                    <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold">
                        {loading
                            ? "..."
                            : visibleProjects.length}
                    </div>

                </div>

                {loading ? (
                    <div className="py-8 text-center text-sm text-slate-500">
                        Loading projects...
                    </div>
                ) : visibleProjects.length ===
                  0 ? (
                    <div className="py-8 text-center text-sm text-slate-500">
                        No projects found.
                    </div>
                ) : (
                    <div className="max-h-[400px] space-y-2 overflow-y-auto">

                        {visibleProjects.map(
                            (
                                project,
                                index
                            ) => {
                                const projectColor =
                                    getRiskColor(
                                        project.risk_level,
                                        project.risk_score
                                    );

                                const projectRisk =
                                    getRiskLabel(
                                        project.risk_level,
                                        project.risk_score
                                    );

                                return (
                                    <div
                                        key={`${project.project_code}-${index}`}
                                        className="rounded-lg border border-slate-200 p-4 hover:bg-slate-50"
                                    >

                                        <div className="flex items-start justify-between gap-4">

                                            <div>
                                                <div className="text-xs text-slate-400">
                                                    Project{" "}
                                                    {
                                                        project.project_code
                                                    }
                                                </div>

                                                <div className="mt-1 font-medium text-slate-900">
                                                    {
                                                        project.project_name
                                                    }
                                                </div>
                                            </div>

                                            <div
                                                className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-white"
                                                style={{
                                                    backgroundColor:
                                                        projectColor,
                                                }}
                                            >
                                                {
                                                    projectRisk
                                                }
                                            </div>

                                        </div>

                                        <div className="mt-4 grid grid-cols-4 gap-3 text-xs">

                                            {/* RISK */}

                                            <div>
                                                <div className="text-slate-400">
                                                    Risk Score
                                                </div>

                                                <div
                                                    className="mt-1 font-semibold"
                                                    style={{
                                                        color:
                                                            projectColor,
                                                    }}
                                                >
                                                    {typeof project.risk_score ===
                                                    "number"
                                                        ? project.risk_score.toFixed(
                                                              1
                                                          )
                                                        : "0.0"}
                                                    /100
                                                </div>
                                            </div>

                                            {/* PROGRESS */}

                                            <div>
                                                <div className="text-slate-400">
                                                    Progress
                                                </div>

                                                <div className="mt-1 font-semibold">
                                                    {Number(
                                                        project.physical_progress_pct ??
                                                            0
                                                    ).toFixed(
                                                        1
                                                    )}
                                                    %
                                                </div>
                                            </div>

                                            {/* DELAY */}

                                            <div>
                                                <div className="text-slate-400">
                                                    Delay
                                                </div>

                                                <div className="mt-1 font-semibold">
                                                    {Number(
                                                        project.delay_days ??
                                                            0
                                                    ).toFixed(
                                                        0
                                                    )}{" "}
                                                    days
                                                </div>
                                            </div>

                                            {/* COST */}

                                            <div>
                                                <div className="text-slate-400">
                                                    Cost
                                                    Overrun
                                                </div>

                                                <div className="mt-1 font-semibold">
                                                    {Number(
                                                        project.cost_overrun_pct ??
                                                            0
                                                    ).toFixed(
                                                        1
                                                    )}
                                                    %
                                                </div>
                                            </div>

                                        </div>

                                    </div>
                                );
                            }
                        )}

                    </div>
                )}

            </div>

        </div>
    );
}
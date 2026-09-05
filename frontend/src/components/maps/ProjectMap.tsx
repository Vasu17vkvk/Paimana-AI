import {
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useNavigate } from "react-router-dom";
import L from "leaflet";

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

import indiaStatesUrl from "../../assets/india-states.geojson?url";

import {
    getGeographicProjects,
    type GeographicProject,
} from "../../services/api";

/* =========================================================
   TYPES
========================================================= */

type Coordinate = [number, number];

type GeoJSONGeometry = {
    type:
    | "Polygon"
    | "MultiPolygon";
    coordinates:
    | Coordinate[][]
    | Coordinate[][][];
};

type GeoJSONFeature = {
    type: "Feature";
    properties?: Record<string, unknown>;
    geometry:
    | GeoJSONGeometry
    | null;
};

type GeoJSONFeatureCollection = {
    type: "FeatureCollection";
    features: GeoJSONFeature[];
};

/* =========================================================
   INDIA MAP CONFIG
========================================================= */

const INDIA_CENTER: Coordinate = [
    22.9734,
    78.6569,
];

/* =========================================================
   STATE HELPERS
========================================================= */

function getStateName(
    feature: GeoJSONFeature,
): string {
    const properties =
        feature.properties ?? {};

    const possibleKeys = [
        "ST_NM",
        "state",
        "State",
        "STATE",
        "NAME_1",
        "name",
        "NAME",
    ];

    for (const key of possibleKeys) {
        const value =
            properties[key];

        if (
            typeof value ===
            "string" &&
            value.trim()
        ) {
            return value.trim();
        }
    }

    return "Unknown State";
}

function normalizeStateName(
    value: string,
): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/&/g, "and");
}

function statesMatch(
    left: string,
    right: string,
): boolean {
    return (
        normalizeStateName(left) ===
        normalizeStateName(right)
    );
}

/* =========================================================
   RISK
========================================================= */

function getRiskColor(
    riskLevel: string | null,
): string {
    switch (
    riskLevel?.toUpperCase()
    ) {
        case "CRITICAL":
            return "#991b1b";

        case "HIGH":
            return "#ef4444";

        case "MEDIUM":
            return "#f59e0b";

        case "LOW":
            return "#22c55e";

        default:
            return "#64748b";
    }
}

function createRiskIcon(
    riskLevel: string | null,
): L.DivIcon {
    const color =
        getRiskColor(riskLevel);

    return L.divIcon({
        className:
            "paimana-risk-marker",

        html: `
            <div
                style="
                    width: 18px;
                    height: 18px;
                    background: ${color};
                    border: 3px solid white;
                    border-radius: 50%;
                    box-sizing: border-box;
                    cursor: pointer;
                    box-shadow:
                        0 2px 8px rgba(0,0,0,0.45);
                "
            ></div>
        `,

        iconSize: [18, 18],
        iconAnchor: [9, 9],
        popupAnchor: [0, -12],
    });
}

/* =========================================================
   MAP VIEW CONTROLLER
========================================================= */

function MapViewController({
    selectedState,
    selectedBounds,
}: {
    selectedState: string | null;
    selectedBounds: L.LatLngBounds | null;
}) {
    const map = useMap();

    const lastStateRef =
        useRef<string | null>(
            null,
        );

    useEffect(() => {
        /*
         * India view.
         */
        if (!selectedState) {
            lastStateRef.current =
                null;

            map.setView(
                INDIA_CENTER,
                5,
                {
                    animate: true,
                },
            );

            return;
        }

        /*
         * We need the actual state bounds.
         */
        if (!selectedBounds) {
            return;
        }

        /*
         * Don't repeatedly zoom into
         * the same state.
         */
        if (
            lastStateRef.current ===
            selectedState
        ) {
            return;
        }

        lastStateRef.current =
            selectedState;

        /*
         * Reference behavior:
         * fit the real GeoJSON state bounds.
         */
        map.fitBounds(
            selectedBounds.pad(
                0.08,
            ),
            {
                padding: [
                    50,
                    50,
                ],
                maxZoom: 7,
                animate: true,
            },
        );
    }, [
        map,
        selectedState,
        selectedBounds,
    ]);

    return null;
}

/* =========================================================
   POINT IN RING
========================================================= */

function pointInRing(
    point: Coordinate,
    ring: Coordinate[],
): boolean {
    const [x, y] =
        point;

    let inside = false;

    for (
        let i = 0,
        j = ring.length - 1;
        i < ring.length;
        j = i++
    ) {
        const xi =
            ring[i]?.[0];

        const yi =
            ring[i]?.[1];

        const xj =
            ring[j]?.[0];

        const yj =
            ring[j]?.[1];

        if (
            typeof xi !==
            "number" ||
            typeof yi !==
            "number" ||
            typeof xj !==
            "number" ||
            typeof yj !==
            "number"
        ) {
            continue;
        }

        const intersects =
            yi > y !==
            yj > y &&
            x <
            ((xj - xi) *
                (y - yi)) /
            (yj - yi) +
            xi;

        if (
            intersects
        ) {
            inside =
                !inside;
        }
    }

    return inside;
}

/* =========================================================
   POINT IN POLYGON
   Supports holes
========================================================= */

function pointInPolygon(
    point: Coordinate,
    polygon: Coordinate[][],
): boolean {
    if (
        polygon.length ===
        0
    ) {
        return false;
    }

    /*
     * Outer ring.
     */
    if (
        !pointInRing(
            point,
            polygon[0],
        )
    ) {
        return false;
    }

    /*
     * Remaining rings = holes.
     */
    for (
        let index = 1;
        index <
        polygon.length;
        index++
    ) {
        if (
            pointInRing(
                point,
                polygon[index],
            )
        ) {
            return false;
        }
    }

    return true;
}

/* =========================================================
   POINT INSIDE POLYGON / MULTIPOLYGON
========================================================= */

function pointInsideGeometry(
    point: Coordinate,
    geometry: GeoJSONGeometry,
): boolean {
    if (
        geometry.type ===
        "Polygon"
    ) {
        return pointInPolygon(
            point,
            geometry.coordinates as Coordinate[][],
        );
    }

    if (
        geometry.type ===
        "MultiPolygon"
    ) {
        const polygons =
            geometry.coordinates as Coordinate[][][];

        return polygons.some(
            (
                polygon,
            ) =>
                pointInPolygon(
                    point,
                    polygon,
                ),
        );
    }

    return false;
}

/* =========================================================
   CANDIDATE POINTS INSIDE ACTUAL STATE
========================================================= */

function getInsideCandidates(
    bounds: L.LatLngBounds,
    geometry: GeoJSONGeometry,
): Coordinate[] {
    const south =
        bounds.getSouth();

    const north =
        bounds.getNorth();

    const west =
        bounds.getWest();

    const east =
        bounds.getEast();

    /*
     * Reference logic:
     * dense 60 x 60 candidate grid.
     */
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

            /*
             * GeoJSON expects [lng, lat].
             */
            const inside =
                pointInsideGeometry(
                    [lng, lat],
                    geometry,
                );

            if (
                inside
            ) {
                /*
                 * Leaflet marker expects [lat, lng].
                 */
                candidates.push(
                    [
                        lat,
                        lng,
                    ],
                );
            }
        }
    }

    return candidates;
}

/* =========================================================
   DISTANCE BETWEEN MAP POINTS
========================================================= */

function pointDistance(
    a: Coordinate,
    b: Coordinate,
): number {
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
}

/* =========================================================
   FARTHEST-POINT SAMPLING
========================================================= */

function getMarkerPositions(
    total: number,
    bounds: L.LatLngBounds,
    geometry: GeoJSONGeometry,
): Coordinate[] {
    if (
        total <= 0
    ) {
        return [];
    }

    const candidates =
        getInsideCandidates(
            bounds,
            geometry,
        );

    if (
        candidates.length ===
        0
    ) {
        return [];
    }

    /*
     * If there are fewer candidate points
     * than projects, use all candidates.
     */
    if (
        candidates.length <=
        total
    ) {
        return candidates;
    }

    const selected: Coordinate[] =
        [];

    /*
     * Start from the candidate
     * closest to state center.
     */
    const center: Coordinate =
        [
            bounds.getCenter().lat,
            bounds.getCenter().lng,
        ];

    let firstIndex = 0;
    let firstDistance =
        Infinity;

    candidates.forEach(
        (
            candidate,
            index,
        ) => {
            const distance =
                pointDistance(
                    candidate,
                    center,
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
        },
    );

    selected.push(
        candidates[
        firstIndex
        ],
    );

    /*
     * Farthest-point sampling:
     * each next point is chosen as
     * far away as possible from the
     * markers already selected.
     */
    while (
        selected.length <
        total
    ) {
        let bestCandidate:
            | Coordinate
            | null = null;

        let bestDistance =
            -1;

        for (
            const candidate of candidates
        ) {
            const alreadySelected =
                selected.some(
                    (
                        point,
                    ) =>
                        point[0] ===
                        candidate[0] &&
                        point[1] ===
                        candidate[1],
                );

            if (
                alreadySelected
            ) {
                continue;
            }

            let minimumDistance =
                Infinity;

            for (
                const point of selected
            ) {
                const distance =
                    pointDistance(
                        candidate,
                        point,
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
            bestCandidate,
        );
    }

    return selected;
}

/* =========================================================
   POPUP CONTENT
========================================================= */

function ProjectPopup({
    project,
}: {
    project: GeographicProject;
}) {
    const navigate = useNavigate();

    const openProjectAnalysis =
        () => {
            navigate(
                `/project-analytics?project=${encodeURIComponent(
                    project.project_code,
                )}`,
            );
        };

    return (
        <div
            style={{
                minWidth:
                    "270px",
                maxWidth:
                    "320px",
            }}
        >
            {/* Project Code */}
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

            {/* Project Name */}
            <div
                style={{
                    marginTop:
                        "5px",
                    fontWeight:
                        700,
                    fontSize:
                        "15px",
                    lineHeight:
                        1.4,
                    color:
                        "#1e293b",
                }}
            >
                {
                    project.project_name
                }
            </div>

            {/* Risk */}
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

                    <strong>
                        {
                            project.risk_score !==
                                null
                                ? project.risk_score.toFixed(
                                    1,
                                )
                                : "N/A"
                        }

                        {project.risk_score !==
                            null &&
                            "/100"}
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
                            color: getRiskColor(
                                project.risk_level,
                            ),
                        }}
                    >
                        {
                            project.risk_level ??
                            "N/A"
                        }
                    </strong>
                </div>
            </div>

            {/* Progress / Delay / Cost */}
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
                    {project.physical_progress_pct !==
                        null
                        ? `${project.physical_progress_pct.toFixed(
                            1,
                        )}%`
                        : "N/A"}
                </div>

                <div>
                    <strong>
                        Delay:
                    </strong>{" "}
                    {project.delay_days !==
                        null
                        ? `${Math.round(
                            project.delay_days,
                        )} days`
                        : "N/A"}
                </div>

                <div>
                    <strong>
                        Cost Overrun:
                    </strong>{" "}
                    {project.cost_overrun_pct !==
                        null
                        ? `${Number(
                            project.cost_overrun_pct,
                        ).toFixed(
                            1,
                        )}%`
                        : "N/A"}
                </div>
            </div>

            {/* Metadata */}
            <div
                style={{
                    marginTop:
                        "12px",
                    paddingTop:
                        "10px",
                    borderTop:
                        "1px solid #e2e8f0",
                    fontSize:
                        "12px",
                    color:
                        "#64748b",
                    lineHeight:
                        1.7,
                }}
            >
                <div>
                    <strong>
                        State:
                    </strong>{" "}
                    {
                        project.state
                    }
                </div>

                <div>
                    <strong>
                        Sector:
                    </strong>{" "}
                    {project.sector ??
                        "-"}
                </div>

                <div>
                    <strong>
                        Ministry:
                    </strong>{" "}
                    {project.ministry ??
                        "-"}
                </div>
            </div>

            {/* Analyse Project */}
            <button
                type="button"
                onClick={
                    openProjectAnalysis
                }
                style={{
                    width: "100%",
                    marginTop:
                        "14px",
                    border: "none",
                    borderRadius:
                        "8px",
                    background:
                        "#0f172a",
                    color:
                        "#ffffff",
                    padding:
                        "9px 12px",
                    fontSize:
                        "12px",
                    fontWeight:
                        600,
                    cursor:
                        "pointer",
                    transition:
                        "background 0.2s ease",
                }}
                onMouseEnter={(
                    event,
                ) => {
                    event.currentTarget.style.background =
                        "#1e293b";
                }}
                onMouseLeave={(
                    event,
                ) => {
                    event.currentTarget.style.background =
                        "#0f172a";
                }}
            >
                Analyse Project
            </button>
        </div>
    );
}

/* =========================================================
   MAIN COMPONENT
========================================================= */

export default function ProjectMap() {
    const [
        indiaStates,
        setIndiaStates,
    ] =
        useState<GeoJSONFeatureCollection | null>(
            null,
        );

    const [
        selectedState,
        setSelectedState,
    ] = useState<string | null>(
        null,
    );

    const [
        selectedBounds,
        setSelectedBounds,
    ] =
        useState<L.LatLngBounds | null>(
            null,
        );

    const [
        selectedGeometry,
        setSelectedGeometry,
    ] =
        useState<GeoJSONGeometry | null>(
            null,
        );

    const [
        projects,
        setProjects,
    ] =
        useState<
            GeographicProject[]
        >([]);

    const [
        loading,
        setLoading,
    ] = useState(false);

    const [
        mapLoading,
        setMapLoading,
    ] = useState(true);

    const [
        error,
        setError,
    ] = useState<string | null>(
        null,
    );

    /* =====================================================
       LOAD INDIA STATES
    ===================================================== */

    useEffect(() => {
        let cancelled =
            false;

        async function loadIndiaStates() {
            try {
                setMapLoading(
                    true,
                );

                setError(
                    null,
                );

                const response =
                    await fetch(
                        indiaStatesUrl,
                    );

                if (
                    !response.ok
                ) {
                    throw new Error(
                        `GeoJSON file could not be loaded (${response.status}).`,
                    );
                }

                const data =
                    (await response.json()) as GeoJSONFeatureCollection;

                if (
                    !cancelled
                ) {
                    setIndiaStates(
                        data,
                    );
                }
            } catch (err) {
                if (
                    !cancelled
                ) {
                    setError(
                        err instanceof Error
                            ? err.message
                            : "GeoJSON file could not be loaded.",
                    );
                }
            } finally {
                if (
                    !cancelled
                ) {
                    setMapLoading(
                        false,
                    );
                }
            }
        }

        void loadIndiaStates();

        return () => {
            cancelled = true;
        };
    }, []);

    /* =====================================================
       LOAD REAL PROJECTS ONLY AFTER STATE SELECTION
    ===================================================== */

    useEffect(() => {
        let cancelled =
            false;

        /*
         * IMPORTANT:
         * India view = no API call + no markers.
         */
        if (!selectedState) {
            setProjects(
                [],
            );

            setLoading(
                false,
            );

            return () => {
                cancelled = true;
            };
        }

        /*
         * Narrowed string value.
         */
        const state =
            selectedState;

        async function loadProjects() {
            try {
                setLoading(
                    true,
                );

                setError(
                    null,
                );

                /*
                 * REAL PRODUCTION PROJECT DATA
                 * from Flask/PostgreSQL.
                 */
                const response =
                    await getGeographicProjects(
                        state,
                    );

                if (
                    !cancelled
                ) {
                    setProjects(
                        response.projects ??
                        [],
                    );
                }
            } catch (err) {
                if (
                    !cancelled
                ) {
                    setProjects(
                        [],
                    );

                    setError(
                        err instanceof Error
                            ? err.message
                            : "Projects API failed.",
                    );
                }
            } finally {
                if (
                    !cancelled
                ) {
                    setLoading(
                        false,
                    );
                }
            }
        }

        void loadProjects();

        return () => {
            cancelled = true;
        };
    }, [
        selectedState,
    ]);

    /* =====================================================
       STATE STYLE
    ===================================================== */

    const stateStyle = (
        feature:
            | GeoJSONFeature
            | undefined,
    ) => {
        const stateName =
            feature
                ? getStateName(
                    feature,
                )
                : "";

        const selected =
            Boolean(
                selectedState,
            ) &&
            statesMatch(
                stateName,
                selectedState as string,
            );

        return {
            color: selected
                ? "#1d4ed8"
                : "#64748b",

            weight: selected
                ? 2.5
                : 1.1,

            fillColor: selected
                ? "#60a5fa"
                : "#dbeafe",

            fillOpacity: selected
                ? 0.45
                : 0.22,
        };
    };

    /* =====================================================
       STATE INTERACTION
    ===================================================== */

    const onEachState = (
        feature: GeoJSONFeature,
        layer: L.Layer,
    ) => {
        const stateName =
            getStateName(
                feature,
            );

        layer.bindTooltip(
            stateName,
            {
                sticky: true,
                direction:
                    "top",
            },
        );

        layer.on({
            mouseover: (
                event,
            ) => {
                const target =
                    event.target as L.Path;

                target.setStyle({
                    weight: 2,
                    color: "#2563eb",
                    fillColor:
                        "#93c5fd",
                    fillOpacity: 0.5,
                });
            },

            mouseout: (
                event,
            ) => {
                const target =
                    event.target as L.Path;

                target.setStyle(
                    stateStyle(
                        feature,
                    ),
                );
            },

            click: (
                event,
            ) => {
                /*
                 * Clicking the same state again:
                 * don't refetch.
                 */
                if (
                    selectedState &&
                    statesMatch(
                        selectedState,
                        stateName,
                    )
                ) {
                    return;
                }

                const target =
                    event.target as L.Polygon;

                /*
                 * Actual state geometry bounds.
                 */
                const bounds =
                    target.getBounds();

                /*
                 * Actual GeoJSON geometry.
                 */
                const geometry =
                    feature.geometry;

                if (!geometry) {
                    setError(
                        `Geometry unavailable for ${stateName}.`,
                    );

                    return;
                }

                /*
                 * Save actual state data.
                 */
                setSelectedBounds(
                    bounds,
                );

                setSelectedGeometry(
                    geometry,
                );

                setSelectedState(
                    stateName,
                );

                setProjects(
                    [],
                );

                setError(
                    null,
                );
            },
        });
    };

    /* =====================================================
       MARKER POSITIONS
    ===================================================== */

    const markerPositions =
        useMemo(() => {
            /*
             * India view = ZERO markers.
             */
            if (
                !selectedState ||
                !selectedBounds ||
                !selectedGeometry ||
                projects.length ===
                0
            ) {
                return [];
            }

            return getMarkerPositions(
                projects.length,
                selectedBounds,
                selectedGeometry,
            );
        }, [
            selectedState,
            selectedBounds,
            selectedGeometry,
            projects,
        ]);

    /* =====================================================
       RESET
    ===================================================== */

    function resetToIndia() {
        setSelectedState(
            null,
        );

        setSelectedBounds(
            null,
        );

        setSelectedGeometry(
            null,
        );

        setProjects(
            [],
        );

        setLoading(
            false,
        );

        setError(
            null,
        );
    }

    /* =====================================================
       LOADING
    ===================================================== */

    if (
        mapLoading ||
        !indiaStates
    ) {
        return (
            <div className="flex h-[600px] items-center justify-center rounded-2xl bg-slate-50">
                <div className="text-sm text-slate-500">
                    Loading India map...
                </div>
            </div>
        );
    }

    /* =====================================================
       RENDER
    ===================================================== */

    return (
        <div className="relative">
            {/* =================================================
                SELECTED STATE CARD
            ================================================= */}

            <div className="absolute right-4 top-4 z-[1000] rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
                <div className="text-xs text-slate-500">
                    Geographic View
                </div>

                <div className="text-lg font-semibold text-slate-900">
                    {selectedState ??
                        "All India"}
                </div>

                <div className="mt-1 text-xs text-slate-500">
                    {!selectedState
                        ? "Click a state to view projects"
                        : loading
                            ? "Loading projects..."
                            : `${projects.length.toLocaleString()} projects found`}
                </div>

                {selectedState && (
                    <button
                        type="button"
                        onClick={
                            resetToIndia
                        }
                        className="mt-3 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                        Back to India
                    </button>
                )}

                {error && (
                    <div className="mt-2 max-w-[250px] rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-600">
                        {error}
                    </div>
                )}
            </div>

            {/* =================================================
                MAP
            ================================================= */}

            <MapContainer
                center={
                    INDIA_CENTER
                }
                zoom={5}
                minZoom={4}
                maxZoom={9}
                scrollWheelZoom
                doubleClickZoom={
                    false
                }
                style={{
                    height:
                        "600px",
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

                <GeoJSON
                    data={
                        indiaStates as never
                    }
                    style={(
                        feature,
                    ) =>
                        stateStyle(
                            feature as GeoJSONFeature,
                        )
                    }
                    onEachFeature={(
                        feature,
                        layer,
                    ) =>
                        onEachState(
                            feature as GeoJSONFeature,
                            layer,
                        )
                    }
                />

                {/* =================================================
                    REAL PROJECT MARKERS
                ================================================= */}

                {selectedState &&
                    projects.map(
                        (
                            project,
                            index,
                        ) => {
                            const markerPosition =
                                markerPositions[
                                index
                                ];

                            if (
                                !markerPosition
                            ) {
                                return null;
                            }

                            return (
                                <Marker
                                    key={`${project.project_code}-${index}`}
                                    position={
                                        markerPosition
                                    }
                                    icon={createRiskIcon(
                                        project.risk_level,
                                    )}
                                >
                                    {/* =================================================
                                        HOVER TOOLTIP
                                        
                                        ONLY:
                                        Project ID
                                        Project Name
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
                                        sticky
                                    >
                                        <div
                                            style={{
                                                minWidth:
                                                    "180px",
                                                maxWidth:
                                                    "280px",
                                            }}
                                        >
                                            <div
                                                style={{
                                                    fontWeight:
                                                        700,
                                                    fontSize:
                                                        "12px",
                                                    color:
                                                        "#0f172a",
                                                }}
                                            >
                                                {
                                                    project.project_code
                                                }
                                            </div>

                                            <div
                                                style={{
                                                    marginTop:
                                                        "4px",
                                                    fontSize:
                                                        "11px",
                                                    lineHeight:
                                                        1.4,
                                                    color:
                                                        "#334155",
                                                }}
                                            >
                                                {
                                                    project.project_name
                                                }
                                            </div>
                                        </div>
                                    </Tooltip>

                                    {/* =================================================
                                        CLICK POPUP

                                        REAL API PROJECT DATA.
                                        Full project information.
                                    ================================================= */}

                                    <Popup
                                        maxWidth={
                                            350
                                        }
                                        autoPan
                                        autoPanPadding={[
                                            40,
                                            40,
                                        ]}
                                    >
                                        <ProjectPopup
                                            project={
                                                project
                                            }
                                        />
                                    </Popup>
                                </Marker>
                            );
                        },
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
                                    "#991b1b",
                            }}
                        />

                        Critical Risk
                    </div>

                    <div className="flex items-center gap-2">
                        <span
                            className="h-3 w-3 rounded-full"
                            style={{
                                backgroundColor:
                                    "#ef4444",
                            }}
                        />

                        High Risk
                    </div>

                    <div className="flex items-center gap-2">
                        <span
                            className="h-3 w-3 rounded-full"
                            style={{
                                backgroundColor:
                                    "#f59e0b",
                            }}
                        />

                        Medium Risk
                    </div>

                    <div className="flex items-center gap-2">
                        <span
                            className="h-3 w-3 rounded-full"
                            style={{
                                backgroundColor:
                                    "#22c55e",
                            }}
                        />

                        Low Risk
                    </div>
                </div>
            </div>

            {/* =================================================
                PROJECT LIST
            ================================================= */}

            {selectedState && (
                <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                    <div className="mb-4 flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-semibold text-slate-900">
                                Projects in{" "}
                                {
                                    selectedState
                                }
                            </h2>

                            <p className="text-sm text-slate-500">
                                Infrastructure
                                projects
                                returned by
                                PAIMANA AI
                            </p>
                        </div>

                        <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">
                            {loading
                                ? "..."
                                : projects.length}
                        </div>
                    </div>

                    {loading ? (
                        <div className="py-8 text-center text-sm text-slate-500">
                            Loading
                            projects...
                        </div>
                    ) : projects.length ===
                        0 ? (
                        <div className="py-8 text-center text-sm text-slate-500">
                            No projects
                            found.
                        </div>
                    ) : (
                        <div className="max-h-[400px] space-y-2 overflow-y-auto pr-1">
                            {projects.map(
                                (
                                    project,
                                    index,
                                ) => (
                                    <div
                                        key={`${project.project_code}-${index}`}
                                        className="rounded-lg border border-slate-200 p-4 transition hover:bg-slate-50"
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="min-w-0">
                                                <div className="text-xs text-slate-400">
                                                    Project{" "}
                                                    {
                                                        project.project_code
                                                    }
                                                </div>

                                                <div className="mt-1 font-medium leading-5 text-slate-900">
                                                    {
                                                        project.project_name
                                                    }
                                                </div>
                                            </div>

                                            <div
                                                className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-white"
                                                style={{
                                                    backgroundColor:
                                                        getRiskColor(
                                                            project.risk_level,
                                                        ),
                                                }}
                                            >
                                                {
                                                    project.risk_level ??
                                                    "N/A"
                                                }
                                            </div>
                                        </div>

                                        <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                                            <div>
                                                <div className="text-slate-400">
                                                    Risk
                                                    Score
                                                </div>

                                                <div className="mt-1 font-semibold text-slate-800">
                                                    {project.risk_score !==
                                                        null
                                                        ? `${project.risk_score.toFixed(
                                                            1,
                                                        )}/100`
                                                        : "N/A"}
                                                </div>
                                            </div>

                                            <div>
                                                <div className="text-slate-400">
                                                    Progress
                                                </div>

                                                <div className="mt-1 font-semibold text-slate-800">
                                                    {project.physical_progress_pct !==
                                                        null
                                                        ? `${project.physical_progress_pct.toFixed(
                                                            1,
                                                        )}%`
                                                        : "N/A"}
                                                </div>
                                            </div>

                                            <div>
                                                <div className="text-slate-400">
                                                    Delay
                                                </div>

                                                <div className="mt-1 font-semibold text-slate-800">
                                                    {project.delay_days !==
                                                        null
                                                        ? `${Math.round(
                                                            project.delay_days,
                                                        )} days`
                                                        : "N/A"}
                                                </div>
                                            </div>

                                            <div>
                                                <div className="text-slate-400">
                                                    Cost
                                                    Overrun
                                                </div>

                                                <div className="mt-1 font-semibold text-slate-800">
                                                    {project.cost_overrun_pct !==
                                                        null
                                                        ? `${Number(
                                                            project.cost_overrun_pct,
                                                        ).toFixed(
                                                            1,
                                                        )}%`
                                                        : "N/A"}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ),
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
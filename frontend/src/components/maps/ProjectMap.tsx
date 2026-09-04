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
    risk_score?: number | null;
    risk_level?: string | null;
};

type Coordinate = [number, number];

type GeoJSONGeometry = {
    type: "Polygon" | "MultiPolygon";
    coordinates: any;
};

const getRiskColor = (riskLevel?: string | null) => {
    switch (riskLevel?.toLowerCase()) {
        case "critical":
            return "#dc2626";

        case "high":
            return "#ef4444";

        case "medium":
            return "#f59e0b";

        case "low":
            return "#22c55e";

        default:
            return "#3b82f6";
    }
};

const createRiskIcon = (riskLevel?: string | null) => {
    const color = getRiskColor(riskLevel);

    return L.divIcon({
        className: "custom-risk-marker",
        html: `
            <div
                style="
                    width: 18px;
                    height: 18px;
                    background: ${color};
                    border: 3px solid white;
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

/* -------------------------------------------------------
   MAP VIEW CONTROLLER
------------------------------------------------------- */

function MapViewController({
    selectedState,
    selectedBounds,
}: {
    selectedState: string | null;
    selectedBounds: L.LatLngBounds | null;
}) {
    const map = useMap();

    const lastStateRef = useRef<string | null>(null);

    useEffect(() => {
        if (!selectedState || !selectedBounds) {
            return;
        }

        if (lastStateRef.current === selectedState) {
            return;
        }

        lastStateRef.current = selectedState;

        map.fitBounds(selectedBounds.pad(0.08), {
            padding: [50, 50],
            maxZoom: 7,
            animate: true,
        });
    }, [map, selectedState, selectedBounds]);

    return null;
}

/* -------------------------------------------------------
   POINT IN RING
------------------------------------------------------- */

const pointInRing = (
    point: Coordinate,
    ring: Coordinate[]
) => {
    const [x, y] = point;

    let inside = false;

    for (
        let i = 0, j = ring.length - 1;
        i < ring.length;
        j = i++
    ) {
        const xi = ring[i][0];
        const yi = ring[i][1];

        const xj = ring[j][0];
        const yj = ring[j][1];

        const intersects =
            yi > y !== yj > y &&
            x <
                ((xj - xi) * (y - yi)) /
                    (yj - yi) +
                    xi;

        if (intersects) {
            inside = !inside;
        }
    }

    return inside;
};

/* -------------------------------------------------------
   POINT IN POLYGON
   Handles polygon holes.
------------------------------------------------------- */

const pointInPolygon = (
    point: Coordinate,
    polygon: Coordinate[][]
) => {
    if (polygon.length === 0) {
        return false;
    }

    const insideOuterRing = pointInRing(
        point,
        polygon[0]
    );

    if (!insideOuterRing) {
        return false;
    }

    for (let i = 1; i < polygon.length; i++) {
        if (pointInRing(point, polygon[i])) {
            return false;
        }
    }

    return true;
};

/* -------------------------------------------------------
   POINT IN MULTIPOLYGON
------------------------------------------------------- */

const pointInsideGeometry = (
    point: Coordinate,
    geometry: GeoJSONGeometry
) => {
    if (geometry.type === "Polygon") {
        return pointInPolygon(
            point,
            geometry.coordinates
        );
    }

    if (geometry.type === "MultiPolygon") {
        return geometry.coordinates.some(
            (polygon: Coordinate[][]) =>
                pointInPolygon(
                    point,
                    polygon
                )
        );
    }

    return false;
};

/* -------------------------------------------------------
   CREATE CANDIDATE POINTS INSIDE ACTUAL STATE
------------------------------------------------------- */

const getInsideCandidates = (
    bounds: L.LatLngBounds,
    geometry: GeoJSONGeometry
): Coordinate[] => {
    const south = bounds.getSouth();
    const north = bounds.getNorth();

    const west = bounds.getWest();
    const east = bounds.getEast();

    const gridSize = 60;

    const candidates: Coordinate[] = [];

    for (let row = 0; row < gridSize; row++) {
        const lat =
            south +
            ((north - south) * (row + 0.5)) /
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

            const inside =
                pointInsideGeometry(
                    [lng, lat],
                    geometry
                );

            if (inside) {
                candidates.push([
                    lat,
                    lng,
                ]);
            }
        }
    }

    return candidates;
};

/* -------------------------------------------------------
   DISTANCE BETWEEN TWO MAP POINTS
------------------------------------------------------- */

const pointDistance = (
    a: Coordinate,
    b: Coordinate
) => {
    const latDifference = a[0] - b[0];
    const lngDifference = a[1] - b[1];

    return (
        latDifference * latDifference +
        lngDifference * lngDifference
    );
};

/* -------------------------------------------------------
   EVENLY DISTRIBUTE MARKERS INSIDE STATE
------------------------------------------------------- */

const getMarkerPositions = (
    total: number,
    bounds: L.LatLngBounds,
    geometry: GeoJSONGeometry
): Coordinate[] => {
    if (total <= 0) {
        return [];
    }

    const candidates = getInsideCandidates(
        bounds,
        geometry
    );

    if (candidates.length === 0) {
        return [];
    }

    if (candidates.length <= total) {
        return candidates;
    }

    const selected: Coordinate[] = [];

    const center: Coordinate = [
        bounds.getCenter().lat,
        bounds.getCenter().lng,
    ];

    let firstIndex = 0;
    let firstDistance = Infinity;

    candidates.forEach(
        (candidate, index) => {
            const distance =
                pointDistance(
                    candidate,
                    center
                );

            if (distance < firstDistance) {
                firstDistance = distance;
                firstIndex = index;
            }
        }
    );

    selected.push(
        candidates[firstIndex]
    );

    while (
        selected.length < total
    ) {
        let bestCandidate:
            | Coordinate
            | null = null;

        let bestDistance = -1;

        for (const candidate of candidates) {
            const alreadySelected =
                selected.some(
                    (point) =>
                        point[0] ===
                            candidate[0] &&
                        point[1] ===
                            candidate[1]
                );

            if (alreadySelected) {
                continue;
            }

            let minimumDistance =
                Infinity;

            for (const point of selected) {
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

        if (!bestCandidate) {
            break;
        }

        selected.push(
            bestCandidate
        );
    }

    return selected;
};

/* -------------------------------------------------------
   MAIN COMPONENT
------------------------------------------------------- */

export default function ProjectMap() {
    const [
        indiaStates,
        setIndiaStates,
    ] = useState<any>(null);

    const [
        selectedState,
        setSelectedState,
    ] = useState<string | null>(
        null
    );

    const [
        selectedBounds,
        setSelectedBounds,
    ] = useState<L.LatLngBounds | null>(
        null
    );

    const [
        ,
        setSelectedGeometry,
    ] = useState<GeoJSONGeometry | null>(
        null
    );

    const [
        projects,
        setProjects,
    ] = useState<Project[]>([]);

    const [
        loading,
        setLoading,
    ] = useState(false);

    /* ---------------------------------------------------
       LOAD INDIA STATES
    --------------------------------------------------- */

    useEffect(() => {
        fetch("/india-states.geojson")
            .then((response) => {
                if (!response.ok) {
                    throw new Error(
                        "GeoJSON file could not be loaded"
                    );
                }

                return response.json();
            })
            .then((data) => {
                setIndiaStates(data);
            })
            .catch((error) => {
                console.error(
                    "GeoJSON Error:",
                    error
                );
            });
    }, []);

    /* ---------------------------------------------------
       LOAD ALL PROJECTS + RISK SCORES
    --------------------------------------------------- */

    useEffect(() => {
        let cancelled = false;

        setLoading(true);

        apiRequest<any>("/projects")
            .then((projectResponse) => {
                if (cancelled) {
                    return;
                }

                const allProjectRows =
                    Array.isArray(projectResponse)
                        ? projectResponse
                        : Array.isArray(
                              projectResponse?.projects
                          )
                        ? projectResponse.projects
                        : [];

                const normalizedProjects: Project[] =
                    allProjectRows
                        .map((project: any) => ({
                            project_code: String(
                                project?.project_code ?? ""
                            ),

                            project_name:
                                project?.project_name ??
                                "Unnamed Project",

                            state:
                                project?.flash_state ??
                                project?.state ??
                                "",

                            sector:
                                project?.sector ?? "-",

                            ministry:
                                project?.ministry ?? "-",

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

                            risk_score: null,
                            risk_level: null,
                        }))
                        .filter(
                            (project: Project) =>
                                project.project_code
                        );

                setProjects(
                    normalizedProjects
                );

                setLoading(false);

                console.log(
                    `Geographic View: loaded ${normalizedProjects.length} projects across India`
                );
            })
            .catch((error) => {
                if (cancelled) {
                    return;
                }

                console.error(
                    "Geographic View Projects API Error:",
                    error
                );

                setProjects([]);
                setLoading(false);
            });

        /* ------------------------------------------------
           LOAD ML RISK
        ------------------------------------------------ */

        apiRequest<{
            total_projects: number;
            predictions: Array<{
                project_code:
                    | string
                    | number;
                overall_risk_score: number;
                risk_level: string;
            }>;
        }>("/ml/risk")
            .then((riskResponse) => {
                if (cancelled) {
                    return;
                }

                const riskPredictions =
                    Array.isArray(
                        riskResponse?.predictions
                    )
                        ? riskResponse.predictions
                        : [];

                const riskMap = new Map(
                    riskPredictions.map(
                        (prediction) => [
                            String(
                                prediction.project_code
                            ),
                            prediction,
                        ]
                    )
                );

                setProjects(
                    (currentProjects) =>
                        currentProjects.map(
                            (project) => {
                                const risk =
                                    riskMap.get(
                                        project.project_code
                                    );

                                return risk
                                    ? {
                                          ...project,
                                          risk_score:
                                              risk.overall_risk_score,
                                          risk_level:
                                              risk.risk_level,
                                      }
                                    : project;
                            }
                        )
                );
            })
            .catch((error) => {
                console.warn(
                    "Geographic View Risk API unavailable; showing projects without risk scores.",
                    error
                );
            });

        return () => {
            cancelled = true;
        };
    }, []);

    /* ---------------------------------------------------
       GET STATE NAME
    --------------------------------------------------- */

    const getStateName = (
        feature: any
    ) => {
        return (
            feature?.properties?.ST_NM ||
            feature?.properties?.state ||
            feature?.properties?.NAME_1 ||
            "Unknown State"
        );
    };

    /* ---------------------------------------------------
       STATE STYLE
    --------------------------------------------------- */

    const stateStyle = (
        feature: any
    ) => {
        const stateName =
            getStateName(feature);

        return {
            color:
                selectedState === stateName
                    ? "#1d4ed8"
                    : "#64748b",

            weight:
                selectedState === stateName
                    ? 2.5
                    : 1.1,

            fillColor:
                selectedState === stateName
                    ? "#60a5fa"
                    : "#dbeafe",

            fillOpacity:
                selectedState === stateName
                    ? 0.45
                    : 0.22,
        };
    };

    /* ---------------------------------------------------
       STATE INTERACTION
    --------------------------------------------------- */

    const onEachState = (
        feature: any,
        layer: any
    ) => {
        const stateName =
            getStateName(feature);

        layer.bindTooltip(stateName, {
            sticky: true,
        });

        layer.on({
            mouseover: (
                event: any
            ) => {
                event.target.setStyle({
                    weight: 2,
                    color: "#2563eb",
                    fillColor: "#93c5fd",
                    fillOpacity: 0.5,
                });
            },

            mouseout: (
                event: any
            ) => {
                event.target.setStyle(
                    stateStyle(feature)
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

                const geometry =
                    feature?.geometry;

                setSelectedBounds(
                    bounds
                );

                setSelectedGeometry(
                    geometry
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

    /* ---------------------------------------------------
       NORMALIZE STATE
    --------------------------------------------------- */

    const normalizeState = (
        value: unknown
    ) =>
        String(value ?? "")
            .trim()
            .toLowerCase()
            .replace(/&/g, "and")
            .replace(/\s+/g, " ");

    /* ---------------------------------------------------
       FILTER PROJECTS BY SELECTED STATE
    --------------------------------------------------- */

    const visibleProjects = useMemo(() => {
        if (!selectedState) {
            return projects;
        }

        const selectedStateKey =
            normalizeState(
                selectedState
            );

        return projects.filter(
            (project) =>
                normalizeState(
                    project.state
                ) === selectedStateKey
        );
    }, [
        projects,
        selectedState,
    ]);

    /* ---------------------------------------------------
       GENERATE STABLE MARKER POSITIONS
    --------------------------------------------------- */

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

            for (const feature of
                indiaStates.features) {
                const stateName =
                    getStateName(feature);

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
                } catch (error) {
                    console.warn(
                        `Could not calculate bounds for ${stateName}`,
                        error
                    );
                }
            }

            const projectsByState =
                new Map<
                    string,
                    Project[]
                >();

            for (const project of projects) {
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

                group.push(project);

                projectsByState.set(
                    key,
                    group
                );
            }

            for (const [
                stateKey,
                stateProjects,
            ] of projectsByState) {
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
                            positions[index];

                        if (position) {
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

    return (
        <div className="relative">

            {/* -------------------------------------------
                SELECTED STATE CARD
            -------------------------------------------- */}

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
                </div>
            )}

            {/* -------------------------------------------
                MAP
            -------------------------------------------- */}

            <MapContainer
                center={[
                    22.9734,
                    78.6569,
                ]}
                zoom={5}
                minZoom={4}
                maxZoom={9}
                scrollWheelZoom={true}
                doubleClickZoom={false}
                style={{
                    height: "600px",
                    width: "100%",
                    borderRadius: "16px",
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
                        data={indiaStates}
                        style={stateStyle}
                        onEachFeature={
                            onEachState
                        }
                    />
                )}

                {/* ---------------------------------------
                    PROJECT MARKERS
                ---------------------------------------- */}

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

                            return (
                                <Marker
                                    key={`${project.project_code}-${index}`}
                                    position={
                                        markerPosition
                                    }
                                    icon={createRiskIcon(
                                        project.risk_level
                                    )}
                                >

                                    {/* HOVER TOOLTIP */}

                                    <Tooltip
                                        direction="top"
                                        offset={[
                                            0,
                                            -12,
                                        ]}
                                        opacity={1}
                                    >
                                        <div
                                            style={{
                                                minWidth:
                                                    "180px",
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
                                        </div>
                                    </Tooltip>

                                    {/* PROJECT POPUP */}

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
                                                            project.risk_score ??
                                                            0
                                                        }
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
                                                                getRiskColor(
                                                                    project.risk_level
                                                                ),
                                                        }}
                                                    >
                                                        {
                                                            project.risk_level ||
                                                            "Unknown"
                                                        }
                                                    </strong>
                                                </div>
                                            </div>

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

            {/* -------------------------------------------
                RISK LEGEND
            -------------------------------------------- */}

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
                                    "#dc2626",
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

            {/* -------------------------------------------
                PROJECT LIST
            -------------------------------------------- */}

            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">

                <div className="mb-4 flex items-center justify-between">

                    <div>
                        <h2 className="text-lg font-semibold text-slate-900">
                            Projects in{" "}
                            {selectedState || "India"}
                        </h2>

                        <p className="text-sm text-slate-500">
                            Infrastructure
                            projects
                            returned by
                            PAIMANA AI
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
                            ) => (
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
                                                    getRiskColor(
                                                        project.risk_level
                                                    ),
                                            }}
                                        >
                                            {
                                                project.risk_level ||
                                                "Unknown"
                                            }
                                        </div>

                                    </div>

                                    <div className="mt-4 grid grid-cols-4 gap-3 text-xs">

                                        <div>
                                            <div className="text-slate-400">
                                                Risk Score
                                            </div>

                                            <div className="mt-1 font-semibold">
                                                {
                                                    project.risk_score ??
                                                    0
                                                }
                                                /100
                                            </div>
                                        </div>

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
                            )
                        )}

                    </div>
                )}

            </div>

        </div>
    );
}
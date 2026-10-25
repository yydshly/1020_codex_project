// Isolated SPACE05 extension of roam-navigation.js. Existing zones, obstacles,
// bridge profiles and continuous capsule-sweep movement remain unchanged.
const GROUND_HEIGHT = 0.85;
const EPSILON = 1e-10;
export const COURTYARD_SURFACE = Object.freeze({
  height:.855, rampStartZ:15.6853, rampEndZ:16.05,
  note:'Linear five-millimetre rise matching SPACE05 paving; original quays and bridges retain their previous heights.',
});

function rectangle(id, minX, maxX, blenderMinY, blenderMaxY, rise = 0) {
  return Object.freeze({ id, minX, maxX, minZ: -blenderMaxY, maxZ: -blenderMinY, rise });
}

const ZONES = Object.freeze([
  rectangle("near-bank", -20.5, 12.5, -1.52, 1.1),
  rectangle("far-bank", -20.5, 12.5, -15.35, -10.85),
  rectangle("original-bridge-and-landings", 7.9, 10.1, -10.85, -1.52, 1.45),
  rectangle("return-bridge-and-landings", -18.8, -17.2, -10.85, -1.5, 0.55),
  rectangle("west-rear-alley", -13.6, -12.0, 1.0, 8.8),
  rectangle("east-rear-alley", 10.7, 12.3, 1.0, 8.8),
  rectangle("rear-lane", -13.6, 12.3, 7.2, 8.8),
  // These are physical clear-floor boundaries, not pre-shrunk centre lines.
  // The union-boundary test below applies the chosen capsule radius once.
  rectangle("courtyard-street-connector", -7.95, -6.15, -16.7, -15.15),
  rectangle("courtyard-alley", -7.95, -6.25, -23.45, -16.3),
  rectangle("courtyard-interior", -11.95, -6.35, -25.6, -22.8),
]);

function circle(id, x, blenderY, radius) {
  return Object.freeze({ id, type: "circle", x, z: -blenderY, radius });
}

const OBSTACLES = Object.freeze([
  circle("near-lamp-west", -9.2, -1.2, 0.24),
  circle("near-lamp-east", 7.8, -1.2, 0.24),
  circle("far-lamp", 8.5, -11.756, 0.28),
  circle("tree-trunk-and-roots", 7.997, -11.715, 0.64),
  circle("planter-west", -11.4, 0.752, 0.31),
  circle("planter-cafe-gap", -4, 0.655, 0.36),
  circle("planter-bookshop-gap", 2, 0.683, 0.31),
  circle("planter-east", 8.05, 0.634, 0.36),
  circle("planter-far-bank", 7.2, -11.756, 0.34),
  Object.freeze({ ...rectangle("cafe-table-and-chairs", -9.165, -6.835, -0.225, 0.454), type: "rectangle" }),
  Object.freeze({ ...rectangle("bicycle", -11.12, -8.88, 0.284, 0.604), type: "rectangle" }),
]);

function contains(bounds, x, z) {
  return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
}

function rectangleEdges(bounds) {
  return [
    [bounds.minX, bounds.minZ, bounds.maxX, bounds.minZ],
    [bounds.maxX, bounds.minZ, bounds.maxX, bounds.maxZ],
    [bounds.maxX, bounds.maxZ, bounds.minX, bounds.maxZ],
    [bounds.minX, bounds.maxZ, bounds.minX, bounds.minZ],
  ];
}

function unionBoundary(zones) {
  const coordinatesX = [...new Set(zones.flatMap((zone) => [zone.minX, zone.maxX]))].sort((first, second) => first - second);
  const coordinatesZ = [...new Set(zones.flatMap((zone) => [zone.minZ, zone.maxZ]))].sort((first, second) => first - second);
  const occupied = coordinatesX.slice(1).map((right, column) => coordinatesZ.slice(1).map((bottom, row) => zones.some((zone) => contains(zone, (coordinatesX[column] + right) / 2, (coordinatesZ[row] + bottom) / 2))));
  const edges = [];
  for (let column = 0; column < occupied.length; column += 1) {
    for (let row = 0; row < occupied[column].length; row += 1) {
      if (!occupied[column][row]) continue;
      const left = coordinatesX[column];
      const right = coordinatesX[column + 1];
      const top = coordinatesZ[row];
      const bottom = coordinatesZ[row + 1];
      if (!occupied[column - 1]?.[row]) edges.push([left, top, left, bottom]);
      if (!occupied[column + 1]?.[row]) edges.push([right, top, right, bottom]);
      if (!occupied[column][row - 1]) edges.push([left, top, right, top]);
      if (!occupied[column][row + 1]) edges.push([left, bottom, right, bottom]);
    }
  }
  return edges;
}

function pointSegmentDistanceSquared(pointX, pointZ, segment) {
  const deltaX = segment[2] - segment[0];
  const deltaZ = segment[3] - segment[1];
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
  const fraction = lengthSquared ? Math.max(0, Math.min(1, ((pointX - segment[0]) * deltaX + (pointZ - segment[1]) * deltaZ) / lengthSquared)) : 0;
  return (pointX - segment[0] - fraction * deltaX) ** 2 + (pointZ - segment[1] - fraction * deltaZ) ** 2;
}

function segmentDistanceSquared(first, second) {
  const firstX = first[2] - first[0];
  const firstZ = first[3] - first[1];
  const secondX = second[2] - second[0];
  const secondZ = second[3] - second[1];
  const denominator = firstX * secondZ - firstZ * secondX;
  if (Math.abs(denominator) > Number.EPSILON) {
    const offsetX = second[0] - first[0];
    const offsetZ = second[1] - first[1];
    const firstFraction = (offsetX * secondZ - offsetZ * secondX) / denominator;
    const secondFraction = (offsetX * firstZ - offsetZ * firstX) / denominator;
    if (firstFraction >= 0 && firstFraction <= 1 && secondFraction >= 0 && secondFraction <= 1) return 0;
  }
  return Math.min(
    pointSegmentDistanceSquared(first[0], first[1], second),
    pointSegmentDistanceSquared(first[2], first[3], second),
    pointSegmentDistanceSquared(second[0], second[1], first),
    pointSegmentDistanceSquared(second[2], second[3], first),
  );
}

function floorHeight(x, z) {
  const bridge = ZONES.find((zone) => zone.rise && contains(zone, x, z));
  if (bridge) {
    const progress = Math.max(0, Math.min(1, (10.55 - z) / 8.795));
    return GROUND_HEIGHT + bridge.rise * Math.sin(Math.PI * progress);
  }
  if (ZONES.slice(7).some(zone=>contains(zone,x,z))) {
    const progress=Math.max(0,Math.min(1,(z-COURTYARD_SURFACE.rampStartZ)/(COURTYARD_SURFACE.rampEndZ-COURTYARD_SURFACE.rampStartZ)));
    return GROUND_HEIGHT+(COURTYARD_SURFACE.height-GROUND_HEIGHT)*progress;
  }
  return GROUND_HEIGHT;
}

function worldRoute(points) {
  return Object.freeze(points.map(([x, blenderY]) => Object.freeze({ x, y: floorHeight(x, -blenderY), z: -blenderY })));
}

const ROUTES = Object.freeze({
  both_banks_loop: worldRoute([[-18, -0.55], [9.4, -0.55], [9.4, -12.65], [-18, -12.65], [-18, -0.55]]),
  rear_lane_loop: worldRoute([[-12.8, -0.55], [-12.8, 8], [11.5, 8], [11.5, -0.55], [-12.8, -0.55]]),
  courtyard_return: worldRoute([
    [-7.05,-12.65],[-7.05,-15.05],[-7.05,-17.2],[-7.05,-21.75],[-7.05,-23.35],
    [-10.95,-23.35],[-10.95,-24.95],[-7.05,-24.95],[-7.05,-23.35],[-7.05,-12.65],
  ]),
});

const SPAWNS = Object.freeze({
  original: Object.freeze({x:-12.8,y:GROUND_HEIGHT,z:.55}),
  courtyardEntrance: Object.freeze({x:-7.05,y:GROUND_HEIGHT,z:12.65}),
  courtyardCenter: Object.freeze({x:-9.35,y:COURTYARD_SURFACE.height,z:24.15}),
});

export function createNavigation({ radius = 0.24 } = {}) {
  if (!Number.isFinite(radius) || radius < 0.18 || radius > 0.3) throw new RangeError("Navigation radius must be between 0.18 and 0.30 metres.");
  const boundary = unionBoundary(ZONES);
  const solidEdges = OBSTACLES.filter((obstacle) => obstacle.type === "rectangle").flatMap(rectangleEdges);
  const radiusSquared = radius * radius;
  const maxStep = Math.min(0.06, radius / 3);
  const maxMoveDistance = 4;
  const spawn = SPAWNS.courtyardEntrance;

  function isWalkable(x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z) || !ZONES.some((zone) => contains(zone, x, z))) return false;
    if (boundary.some((edge) => pointSegmentDistanceSquared(x, z, edge) < radiusSquared - EPSILON)) return false;
    return !OBSTACLES.some((obstacle) => {
      if (obstacle.type === "circle") return (x - obstacle.x) ** 2 + (z - obstacle.z) ** 2 < (radius + obstacle.radius) ** 2 - EPSILON;
      const closestX = Math.max(obstacle.minX, Math.min(obstacle.maxX, x));
      const closestZ = Math.max(obstacle.minZ, Math.min(obstacle.maxZ, z));
      return (x - closestX) ** 2 + (z - closestZ) ** 2 < radiusSquared - EPSILON;
    });
  }

  function sampleHeight(x, z) {
    return isWalkable(x, z) ? floorHeight(x, z) : null;
  }

  function reset(position = spawn) {
    return position && isWalkable(position.x, position.z) ? { x: position.x, y: floorHeight(position.x, position.z), z: position.z } : { ...spawn };
  }

  function canSweep(start, end) {
    if (!start || !end || !isWalkable(start.x,start.z) || !isWalkable(end.x, end.z)) return false;
    const segment = [start.x, start.z, end.x, end.z];
    if (boundary.some((edge) => segmentDistanceSquared(segment, edge) < radiusSquared - EPSILON)) return false;
    if (solidEdges.some((edge) => segmentDistanceSquared(segment, edge) < radiusSquared - EPSILON)) return false;
    return !OBSTACLES.some((obstacle) => obstacle.type === "circle" && pointSegmentDistanceSquared(obstacle.x, obstacle.z, segment) < (radius + obstacle.radius) ** 2 - EPSILON);
  }

  function move(position, displacement) {
    const current = reset(position);
    if (!position || !isWalkable(position.x, position.z)) return current;
    if (!displacement || !Number.isFinite(displacement.x) || !Number.isFinite(displacement.z)) return current;
    const distance = Math.hypot(displacement.x, displacement.z);
    if (!Number.isFinite(distance) || distance <= Number.EPSILON) return current;
    const travel = Math.min(distance, maxMoveDistance);
    const steps = Math.ceil(travel / maxStep);
    const deltaX = displacement.x / distance * travel / steps;
    const deltaZ = displacement.z / distance * travel / steps;
    for (let step = 0; step < steps; step += 1) {
      const next = { x: current.x + deltaX, z: current.z + deltaZ };
      if (canSweep(current, next)) {
        current.x = next.x;
        current.z = next.z;
      } else {
        const axes = Math.abs(deltaX) >= Math.abs(deltaZ) ? [[deltaX, 0], [0, deltaZ]] : [[0, deltaZ], [deltaX, 0]];
        for (const [offsetX, offsetZ] of axes) {
          if (!offsetX && !offsetZ) continue;
          const slide = { x: current.x + offsetX, z: current.z + offsetZ };
          if (canSweep(current, slide)) {
            current.x = slide.x;
            current.z = slide.z;
          }
        }
      }
    }
    current.y = floorHeight(current.x, current.z);
    return current;
  }

  return Object.freeze({
    spawn, spawns: SPAWNS, reset, move, canSweep, sampleHeight, isWalkable, radius, maxStep, maxMoveDistance,
    zones: ZONES, obstacles: OBSTACLES, routes: ROUTES,
    mapBounds: Object.freeze({ minX: -20.5, maxX: 12.5, minZ: -8.8, maxZ: 25.6 }),
    metadata: Object.freeze({
      coordinateSystem: "Three Y-up: Blender (x,y,z) maps to (x,z,-y).",
      source: "rainy-canal-space-05.blend",
      preservedNavigationSource: "roam-navigation.js",
      obstacleMethod: "Conservative low-height world bounds inspected read-only; circles and rectangles are navigation proxies, not full mesh collision.",
      scope: "Existing exterior banks, bridges and rear lane plus one opposite-bank alley and closed courtyard. House interiors, water and other gardens remain inaccessible.",
      courtyardRoute: "Street entrance, passage between houses 1/2, courtyard circuit and return through the same entrance; no shortcut across building corners.",
      courtyardSurface: COURTYARD_SURFACE,
      bridgeHeight: "0.85 + rise*sin(pi*t), t=clamp((10.55-worldZ)/8.795,0,1); flat landing connectors join both banks.",
    }),
  });
}

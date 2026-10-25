// SPACE06 finite neighbourhood navigation. SPACE05 zones, routes and collisions
// are preserved; new roads follow the actual riverbank geometry plan.
const GROUND_HEIGHT = 0.85;
const EPSILON = 1e-10;
export const COURTYARD_SURFACE = Object.freeze({
  height:.855, rampStartZ:15.6853, rampEndZ:16.05,
  note:'Linear five-millimetre rise matching SPACE05 paving; original quays and bridges retain their previous heights.',
});

function rectangle(id, minX, maxX, blenderMinY, blenderMaxY, rise = 0) {
  return Object.freeze({ id, minX, maxX, minZ: -blenderMaxY, maxZ: -blenderMinY, rise });
}


const ROAD_PLAN = {"coordinate_system":"Blender XY metres","source":"rainy-canal-space-05.blend","road_rectangles":[{"id":"north-backstreet-west","bounds":[-34.5,6.9,-13.4,9.1],"height":0.855},{"id":"north-backstreet-east","bounds":[12.1,6.9,34.5,9.1],"height":0.855},{"id":"north-west-cross","bounds":[-34.5,0.5,-31.5,26.35],"height":0.855},{"id":"north-east-cross","bounds":[31.5,-2.3,34.5,26.35],"height":0.855},{"id":"north-top-street","bounds":[-34.5,24.05,34.5,26.35],"height":0.855},{"id":"far-west-cross","bounds":[-34.5,-36.75,-31.5,-12.0],"height":0.855},{"id":"far-east-cross","bounds":[31.5,-36.75,34.5,-14.0],"height":0.855},{"id":"south-street","bounds":[-34.5,-36.75,34.5,-34.25],"height":0.855}],"curved_quays":[{"id":"near-quay-west","bank_side":1,"x_range":[-35.0,-25.457500457763672],"centerline":[[-35.0,0.9989818847954407],[-34.0,0.7178249786281296],[-33.0,0.45729082841441093],[-32.0,0.22562853653572168],[-31.0,0.031087205373499516],[-30.0,-0.11808406269081961],[-29.0,-0.21363616527579887],[-28.0,-0.24731999999999965],[-27.0,-0.24731999999999965],[-26.0,-0.24731999999999965],[-25.457500457763672,-0.24731999999999965]],"section_ranges":[[-35.0,-0.31101811520455924,2.3089818847954406],[-34.0,-0.5921750213718704,2.0278249786281295],[-33.0,-0.852709171585589,1.7672908284144109],[-32.0,-1.0843714634642783,1.5356285365357216],[-31.0,-1.2789127946265004,1.3410872053734995],[-30.0,-1.4280840626908196,1.1919159373091803],[-29.0,-1.5236361652757988,1.096363834724201],[-28.0,-1.5573199999999996,1.0626800000000003],[-27.0,-1.5573199999999996,1.0626800000000003],[-26.0,-1.5573199999999996,1.0626800000000003],[-25.457500457763672,-1.5573199999999996,1.0626800000000003]],"navigation_rectangles":[{"id":"near-quay-west-00","bounds":[-35.0,-0.2860181152045592,-33.6,1.8956746380948517]},{"id":"near-quay-west-01","bounds":[-34.4,-0.45672503988601687,-32.6,1.6456993389293717]},{"id":"near-quay-west-02","bounds":[-33.4,-0.7264981847669453,-31.6,1.4278955390514967]},{"id":"near-quay-west-03","bounds":[-32.4,-0.9706991122654182,-30.6,1.2505123408426626]},{"id":"near-quay-west-04","bounds":[-31.4,-1.1810787200000006,-29.6,1.121798846684308]},{"id":"near-quay-west-05","bounds":[-30.4,-1.3493879055892528,-28.6,1.0500041589578673]},{"id":"near-quay-west-06","bounds":[-29.4,-1.4673775666517408,-27.6,1.0376800000000004]},{"id":"near-quay-west-07","bounds":[-28.4,-1.5267986008060241,-26.6,1.0376800000000004]},{"id":"near-quay-west-08","bounds":[-27.4,-1.5323199999999997,-25.6,1.0376800000000004]},{"id":"near-quay-west-09","bounds":[-26.4,-1.5323199999999997,-25.457500457763672,1.0376800000000004]}],"height":{"old_edge_x":-25.457500457763672,"direction":-1,"start_z":0.85,"end_z":0.855,"ramp_length":2.0}},{"id":"near-quay-east","bank_side":1,"x_range":[24.0,35.0],"centerline":[[24.0,-0.24731999999999965],[25.0,-0.2778377229080936],[26.0,-0.36469585733882004],[27.0,-0.5008518518518515],[28.0,-0.679263155006859],[29.0,-0.8928872153635112],[30.0,-1.1346814814814812],[31.0,-1.3976034019204386],[32.0,-1.6746104252400544],[33.0,-1.9586599999999994],[34.0,-2.242709574759946],[35.0,-2.519716598079561]],"section_ranges":[[24.0,-1.5573199999999996,1.0626800000000003],[25.0,-1.5878377229080936,1.0321622770919063],[26.0,-1.67469585733882,0.9453041426611799],[27.0,-1.8108518518518515,0.8091481481481484],[28.0,-1.989263155006859,0.630736844993141],[29.0,-2.202887215363511,0.4171127846364886],[30.0,-2.444681481481481,0.17531851851851865],[31.0,-2.7076034019204385,-0.0876034019204388],[32.0,-2.9846104252400543,-0.3646104252400546],[33.0,-3.2686599999999992,-0.6486599999999996],[34.0,-3.552709574759946,-0.9327095747599463],[35.0,-3.829716598079561,-1.2097165980795612]],"navigation_rectangles":[{"id":"near-quay-east-00","bounds":[24.0,-1.5323199999999997,25.4,0.9787854898216736]},{"id":"near-quay-east-01","bounds":[24.6,-1.543475401481482,26.4,0.871363105185185]},{"id":"near-quay-east-02","bounds":[25.6,-1.6086424774759938,27.4,0.7174598810425244]},{"id":"near-quay-east-03","bounds":[26.6,-1.7259244341289437,28.4,0.5241183688340193]},{"id":"near-quay-east-04","bounds":[27.6,-1.88827872,29.4,0.2983811200000005]},{"id":"near-quay-east-05","bounds":[28.6,-2.088662783648834,30.4,0.04729068598079635]},{"id":"near-quay-east-06","bounds":[29.6,-2.3200340736351164,31.4,-0.222110381783264]},{"id":"near-quay-east-07","bounds":[30.6,-2.5753500385185193,32.4,-0.5027795318518514]},{"id":"near-quay-east-08","bounds":[31.6,-2.847568126858711,33.4,-0.7876742127846358]},{"id":"near-quay-east-09","bounds":[32.6,-3.129645787215363,34.4,-1.0697518731412887]},{"id":"near-quay-east-10","bounds":[33.6,-3.4145404681481475,35.0,-1.2347165980795611]}],"height":{"old_edge_x":24.0,"direction":1,"start_z":0.85,"end_z":0.855,"ramp_length":2.0}},{"id":"far-quay-west","bank_side":-1,"x_range":[-35.0,-25.457500457763672],"centerline":[[-35.0,-11.245891308772645],[-34.0,-11.489429871768778],[-33.0,-11.715104970486465],[-32.0,-11.915771219214328],[-31.0,-12.084283232240992],[-30.0,-12.213495623855078],[-29.0,-12.296263008345207],[-28.0,-12.32544],[-27.0,-12.32544],[-26.0,-12.32544],[-25.457500457763672,-12.32544]],"section_ranges":[[-35.0,-12.795891308772644,-9.695891308772644],[-34.0,-13.039429871768776,-9.939429871768777],[-33.0,-13.265104970486464,-10.165104970486464],[-32.0,-13.465771219214329,-10.365771219214329],[-31.0,-13.634283232240993,-10.534283232240993],[-30.0,-13.763495623855077,-10.663495623855077],[-29.0,-13.846263008345206,-10.746263008345206],[-28.0,-13.87544,-10.77544],[-27.0,-13.87544,-10.77544],[-26.0,-13.87544,-10.77544],[-25.457500457763672,-13.87544,-10.77544]],"navigation_rectangles":[{"id":"far-quay-west-00","bounds":[-35.0,-12.770891308772644,-33.6,-10.057243668569102]},{"id":"far-quay-west-01","bounds":[-34.4,-12.918757920683898,-32.6,-10.273772673576227]},{"id":"far-quay-west-02","bounds":[-33.4,-13.15243585139833,-31.6,-10.462434674308977]},{"id":"far-quay-west-03","bounds":[-32.4,-13.363963086407491,-30.6,-10.616084285055974]},{"id":"far-quay-west-04","bounds":[-31.4,-13.546194239999998,-29.6,-10.727576120105843]},{"id":"far-quay-west-05","bounds":[-30.4,-13.69198392646448,-28.6,-10.789764793747201]},{"id":"far-quay-west-06","bounds":[-29.4,-13.794186760089557,-27.6,-10.80044]},{"id":"far-quay-west-07","bounds":[-28.4,-13.84565735516385,-26.6,-10.80044]},{"id":"far-quay-west-08","bounds":[-27.4,-13.850439999999999,-25.6,-10.80044]},{"id":"far-quay-west-09","bounds":[-26.4,-13.850439999999999,-25.457500457763672,-10.80044]}],"height":{"old_edge_x":-25.457500457763672,"direction":-1,"start_z":0.85,"end_z":0.855,"ramp_length":2.0}},{"id":"far-quay-east","bank_side":-1,"x_range":[24.0,35.0],"centerline":[[24.0,-12.32544],[25.0,-12.363553360768176],[26.0,-12.472029849108367],[27.0,-12.642074074074074],[28.0,-12.864890644718791],[29.0,-13.131684170096023],[30.0,-13.433659259259258],[31.0,-13.762020521262002],[32.0,-14.107972565157752],[33.0,-14.462720000000001],[34.0,-14.81746743484225],[35.0,-15.163419478737996]],"section_ranges":[[24.0,-13.87544,-10.77544],[25.0,-13.913553360768175,-10.813553360768175],[26.0,-14.022029849108366,-10.922029849108366],[27.0,-14.192074074074073,-11.092074074074073],[28.0,-14.414890644718792,-11.314890644718792],[29.0,-14.681684170096021,-11.581684170096022],[30.0,-14.983659259259257,-11.883659259259257],[31.0,-15.312020521262001,-12.212020521262001],[32.0,-15.65797256515775,-12.557972565157751],[33.0,-16.01272,-12.91272],[34.0,-16.36746743484225,-13.26746743484225],[35.0,-16.713419478737997,-13.613419478737997]],"navigation_rectangles":[{"id":"far-quay-east-00","bounds":[24.0,-13.850439999999999,25.4,-10.873992922688615]},{"id":"far-quay-east-01","bounds":[24.6,-13.864371899259258,26.4,-11.008151952592593]},{"id":"far-quay-east-02","bounds":[25.6,-13.945758583484224,27.4,-11.200360562743484]},{"id":"far-quay-east-03","bounds":[26.6,-14.092231160713304,28.4,-11.441823362194787]},{"id":"far-quay-east-04","bounds":[27.6,-14.29499424,29.4,-11.72374496]},{"id":"far-quay-east-05","bounds":[28.6,-14.545252430397806,30.4,-12.037329965212619]},{"id":"far-quay-east-06","bounds":[29.6,-14.834210340960219,31.4,-12.373782986886146]},{"id":"far-quay-east-07","bounds":[30.6,-15.15307258074074,32.4,-12.724308634074074]},{"id":"far-quay-east-08","bounds":[31.6,-15.493043758792865,33.4,-13.080111515829904]},{"id":"far-quay-east-09","bounds":[32.6,-15.845328484170096,34.4,-13.432396241207133]},{"id":"far-quay-east-10","bounds":[33.6,-16.201131365925928,35.0,-13.638419478737998]}],"height":{"old_edge_x":24.0,"direction":1,"start_z":0.85,"end_z":0.855,"ramp_length":2.0}}],"trees":[{"id":"space06-tree-01","x":-28,"blender_y":4.3,"height":5.5,"trunk_radius":0.21,"collider_radius":0.28,"lowest_branch_above_ground":2.35},{"id":"space06-tree-02","x":-28,"blender_y":21.1,"height":5.0,"trunk_radius":0.16,"collider_radius":0.24,"lowest_branch_above_ground":2.35},{"id":"space06-tree-03","x":-22.4,"blender_y":21.2,"height":4.8,"trunk_radius":0.16,"collider_radius":0.24,"lowest_branch_above_ground":2.35},{"id":"space06-tree-04","x":17.8,"blender_y":21.2,"height":5.2,"trunk_radius":0.16,"collider_radius":0.24,"lowest_branch_above_ground":2.35},{"id":"space06-tree-05","x":26.8,"blender_y":21.1,"height":5.0,"trunk_radius":0.16,"collider_radius":0.24,"lowest_branch_above_ground":2.35},{"id":"space06-tree-06","x":-27.1,"blender_y":-26,"height":5.2,"trunk_radius":0.16,"collider_radius":0.24,"lowest_branch_above_ground":2.35},{"id":"space06-tree-07","x":-26.1,"blender_y":-30,"height":4.7,"trunk_radius":0.16,"collider_radius":0.24,"lowest_branch_above_ground":2.35},{"id":"space06-tree-08","x":26.2,"blender_y":-26,"height":5.1,"trunk_radius":0.16,"collider_radius":0.24,"lowest_branch_above_ground":2.35},{"id":"space06-tree-09","x":26.9,"blender_y":-30.1,"height":4.6,"trunk_radius":0.16,"collider_radius":0.24,"lowest_branch_above_ground":2.35},{"id":"space06-tree-10","x":-41,"blender_y":5,"height":6.2,"trunk_radius":0.21,"collider_radius":0.28,"lowest_branch_above_ground":2.35},{"id":"space06-tree-11","x":-43,"blender_y":-19,"height":5.8,"trunk_radius":0.21,"collider_radius":0.28,"lowest_branch_above_ground":2.35},{"id":"space06-tree-12","x":-41,"blender_y":-37,"height":6.5,"trunk_radius":0.21,"collider_radius":0.28,"lowest_branch_above_ground":2.35},{"id":"space06-tree-13","x":41,"blender_y":4,"height":6.1,"trunk_radius":0.21,"collider_radius":0.28,"lowest_branch_above_ground":2.35},{"id":"space06-tree-14","x":43,"blender_y":-23,"height":6.4,"trunk_radius":0.21,"collider_radius":0.28,"lowest_branch_above_ground":2.35},{"id":"space06-tree-15","x":41,"blender_y":-40,"height":5.7,"trunk_radius":0.21,"collider_radius":0.28,"lowest_branch_above_ground":2.35},{"id":"space06-tree-16","x":-29,"blender_y":33,"height":5.8,"trunk_radius":0.21,"collider_radius":0.28,"lowest_branch_above_ground":2.35},{"id":"space06-tree-17","x":-12,"blender_y":33,"height":6.4,"trunk_radius":0.21,"collider_radius":0.28,"lowest_branch_above_ground":2.35},{"id":"space06-tree-18","x":13,"blender_y":33,"height":6.0,"trunk_radius":0.21,"collider_radius":0.28,"lowest_branch_above_ground":2.35},{"id":"space06-tree-19","x":30,"blender_y":33,"height":6.1,"trunk_radius":0.21,"collider_radius":0.28,"lowest_branch_above_ground":2.35},{"id":"space06-tree-20","x":-28,"blender_y":-49,"height":6.2,"trunk_radius":0.21,"collider_radius":0.28,"lowest_branch_above_ground":2.35},{"id":"space06-tree-21","x":-12,"blender_y":-49,"height":5.9,"trunk_radius":0.21,"collider_radius":0.28,"lowest_branch_above_ground":2.35},{"id":"space06-tree-22","x":12,"blender_y":-49,"height":6.4,"trunk_radius":0.21,"collider_radius":0.28,"lowest_branch_above_ground":2.35},{"id":"space06-tree-23","x":29,"blender_y":-49,"height":5.8,"trunk_radius":0.21,"collider_radius":0.28,"lowest_branch_above_ground":2.35}],"retained_gate_posts":[{"id":"old-gate-post-01","x":-21,"blender_y":-1.45,"radius":0.12},{"id":"old-gate-post-02","x":-21,"blender_y":0.45,"radius":0.12},{"id":"old-gate-post-03","x":-21,"blender_y":-14.55,"radius":0.12},{"id":"old-gate-post-04","x":-21,"blender_y":-10.75,"radius":0.12},{"id":"old-gate-post-05","x":13,"blender_y":-1.45,"radius":0.12},{"id":"old-gate-post-06","x":13,"blender_y":0.45,"radius":0.12},{"id":"old-gate-post-07","x":13,"blender_y":-14.55,"radius":0.12},{"id":"old-gate-post-08","x":13,"blender_y":-10.75,"radius":0.12}],"road_top":0.855,"old_quay_core_bounds":{"near":[-25.457500457763672,-1.52,24.0,1.1],"far":[-25.457500457763672,-15.35,24.0,-10.85]},"notes":["Curve navigation rectangles are conservative .025m inside the physical river-following ribbon; adjacent rectangles overlap .8m.","Source gates rail/bar open, columns remain.","Near central route should retain y=-.55 to avoid cafe furniture.","Cross north-east begins at y=-2.3; far-east ends at y=-14.0."]};

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
  ...Object.entries(ROAD_PLAN.old_quay_core_bounds).map(([side,b])=>rectangle(`${side}-existing-quay-extension`,b[0],b[2],b[1],b[3])),
  ...ROAD_PLAN.road_rectangles.map(({id,bounds:b})=>rectangle(id,b[0],b[2],b[1],b[3])),
  ...ROAD_PLAN.curved_quays.flatMap(curve=>curve.navigation_rectangles.map(({id,bounds:b})=>rectangle(id,b[0],b[2],b[1],b[3]))),
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
  ...ROAD_PLAN.retained_gate_posts.map(post=>circle(post.id,post.x,post.blender_y,post.radius)),
  ...ROAD_PLAN.trees.map(tree=>circle(tree.id,tree.x,tree.blender_y,tree.collider_radius)),
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
  if (ZONES.slice(7,10).some(zone=>contains(zone,x,z))) {
    const progress=Math.max(0,Math.min(1,(z-COURTYARD_SURFACE.rampStartZ)/(COURTYARD_SURFACE.rampEndZ-COURTYARD_SURFACE.rampStartZ)));
    return GROUND_HEIGHT+(COURTYARD_SURFACE.height-GROUND_HEIGHT)*progress;
  }
  // Old walkable surfaces and old finite quay extensions keep their .85 m datum.
  if (ZONES.slice(0,7).some(zone=>contains(zone,x,z)) || ZONES.slice(10,12).some(zone=>contains(zone,x,z))) return GROUND_HEIGHT;
  for(const curve of ROAD_PLAN.curved_quays){
    if(!curve.navigation_rectangles.some(({bounds:b})=>x>=b[0]&&x<=b[2]&&-z>=b[1]&&-z<=b[3]))continue;
    const h=curve.height, t=Math.max(0,Math.min(1,(x-h.old_edge_x)*h.direction/h.ramp_length));
    return h.start_z+(h.end_z-h.start_z)*t;
  }
  if(ROAD_PLAN.road_rectangles.some(({bounds:b})=>x>=b[0]&&x<=b[2]&&-z>=b[1]&&-z<=b[3]))return ROAD_PLAN.road_top;
  return GROUND_HEIGHT;
}

function worldRoute(points) {
  return Object.freeze(points.map(([x, blenderY]) => Object.freeze({ x, y: floorHeight(x, -blenderY), z: -blenderY })));
}

const quayLine=(id,reverse=false)=>{
  const line=ROAD_PLAN.curved_quays.find(curve=>curve.id===id).centerline.filter(([x])=>x>=-33&&x<=33);
  return reverse?[...line].reverse():line;
};
const ROUTES = Object.freeze({
  both_banks_loop: worldRoute([[-18, -0.55], [9.4, -0.55], [9.4, -12.65], [-18, -12.65], [-18, -0.55]]),
  rear_lane_loop: worldRoute([[-12.8, -0.55], [-12.8, 8], [11.5, 8], [11.5, -0.55], [-12.8, -0.55]]),
  north_ring: worldRoute([
    [-1,-.55],[23,-.55],...quayLine('near-quay-east'),[33,25.2],[-33,25.2],
    ...quayLine('near-quay-west'),[-24,-.55],[-1,-.55],
  ]),
  south_ring: worldRoute([
    [-1,-12.8],[-24,-12.8],...quayLine('far-quay-west',true),[-33,-35.5],[33,-35.5],
    ...quayLine('far-quay-east',true),[23,-12.8],[-1,-12.8],
  ]),
  north_backstreet: worldRoute([[-12.8,8],[-33,8],[-33,25.2],[33,25.2],[33,8],[11.5,8],[-12.8,8]]),
  courtyard_return: worldRoute([
    [-7.05,-12.65],[-7.05,-15.05],[-7.05,-17.2],[-7.05,-21.75],[-7.05,-23.35],
    [-10.95,-23.35],[-10.95,-24.95],[-7.05,-24.95],[-7.05,-23.35],[-7.05,-12.65],
  ]),
});

const SPAWNS = Object.freeze({
  neighbourhoodStart: Object.freeze({x:-1,y:GROUND_HEIGHT,z:.55}),
  northBackstreet: Object.freeze({x:-12.8,y:GROUND_HEIGHT,z:-8}),
  southStreet: Object.freeze({x:0,y:ROAD_PLAN.road_top,z:35.5}),
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
    mapBounds: Object.freeze({ minX: -36, maxX: 36, minZ: -26.5, maxZ: 44 }),
    metadata: Object.freeze({
      coordinateSystem: "Three Y-up: Blender (x,y,z) maps to (x,z,-y).",
      source: "rainy-canal-space-06.blend",
      preservedNavigationSource: "scene-space-05-navigation.js",
      obstacleMethod: "Conservative low-height world bounds inspected read-only; circles and rectangles are navigation proxies, not full mesh collision.",
      scope: "Finite neighbourhood roads: preserved canal core and courtyard, extended river-following quays, north backstreet and two perimeter circuits. House interiors, water and gardens remain inaccessible.",
      roadPlan: "artifacts/scene-space-06/road-navigation-plan.json",
      newRoadHeight: ROAD_PLAN.road_top,
      courtyardRoute: "Street entrance, passage between houses 1/2, courtyard circuit and return through the same entrance; no shortcut across building corners.",
      courtyardSurface: COURTYARD_SURFACE,
      bridgeHeight: "0.85 + rise*sin(pi*t), t=clamp((10.55-worldZ)/8.795,0,1); flat landing connectors join both banks.",
    }),
  });
}

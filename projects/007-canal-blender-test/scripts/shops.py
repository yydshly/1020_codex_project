import math
import random

from scene_utils import box, curve, cylinder, light, mesh, sphere


def _frame(name, center, width, height, material, group, depth=0.15):
    center_x, center_y, center_z = center
    for offset in (-width / 2, width / 2):
        box(name + ' stile', (center_x + offset, center_y, center_z), (0.105, depth, height + 0.12), material, group, 0.012)
    for offset in (-height / 2, height / 2):
        box(name + ' rail', (center_x, center_y, center_z + offset), (width + 0.12, depth, 0.105), material, group, 0.012)


def _panel(name, center, width, height, material, group):
    box(name + ' recessed panel', center, (width, 0.11, height), material, group, 0.012)
    _frame(name + ' molding', (center[0], center[1] - 0.065, center[2]), width - 0.12, height - 0.12, material, group, 0.055)


def _roof(center_x, materials, group, rng):
    front_y, ridge_y, back_y = 0.74, 3.9, 7.03
    eaves_z, ridge_z = 7.86, 9.42
    left_x, right_x = center_x - 3.13, center_x + 3.13
    mesh('Solid pitched roof underlay', [(left_x, front_y, eaves_z), (right_x, front_y, eaves_z), (right_x, ridge_y, ridge_z), (left_x, ridge_y, ridge_z), (left_x, back_y, eaves_z), (right_x, back_y, eaves_z)], [(0,1,2,3), (3,2,5,4)], materials['roof'], group)
    vertices, faces, indices = [], [], []
    tile_width = (right_x - left_x) / 23
    rows = 10
    for side, end_y in ((-1, front_y), (1, back_y)):
        slope_length = abs(end_y - ridge_y)
        for row in range(rows):
            near_distance = row * slope_length / rows
            far_distance = min(slope_length + 0.06, near_distance + slope_length / rows + 0.07)
            for column in range(23):
                tile_x = left_x + column * tile_width
                base_index = len(vertices)
                lift = rng.uniform(0.013, 0.03)
                for distance in (near_distance, far_distance):
                    tile_y = ridge_y + side * distance
                    base_z = ridge_z - distance / slope_length * (ridge_z - eaves_z)
                    for sample in range(5):
                        fraction = sample / 4
                        tile_z = base_z + lift + 0.045 * math.sin(fraction * math.pi)
                        vertices.append((tile_x + fraction * (tile_width - 0.012), tile_y, tile_z))
                material_index = 1 if rng.random() < 0.17 else 0
                for sample in range(4):
                    tile_face = (base_index + sample, base_index + sample + 1, base_index + sample + 6, base_index + sample + 5)
                    faces.append(tile_face if side > 0 else tuple(reversed(tile_face)))
                    indices.append(material_index)
                lip_start = len(vertices)
                for sample in range(5):
                    source = vertices[base_index + 5 + sample]
                    vertices.append((source[0], source[1], source[2] - 0.045))
                for sample in range(4):
                    faces.append((base_index + 5 + sample, base_index + 6 + sample, lip_start + sample + 1, lip_start + sample))
                    indices.append(material_index)
    mesh('Individual overlapping curved roof tiles', vertices, faces, [materials['roof'], materials['roof_alt']], group, indices)
    for ridge_index in range(20):
        start_x = left_x + ridge_index * (right_x - left_x) / 20
        cylinder('Ridge cap tile', (start_x, ridge_y, ridge_z + 0.025), (start_x + 0.3, ridge_y, ridge_z + 0.025), 0.105, materials['roof_alt'] if ridge_index % 5 == 0 else materials['roof'], group, 10)
    for side_x in (center_x - 2.9, center_x + 2.9):
        mesh('Plastered end gable', [(side_x, 1.2, 7.79), (side_x, 6.6, 7.79), (side_x, ridge_y, 9.3)], [(0,1,2)], materials['plaster'], group)
        curve('Gable edge flashing', [(side_x, front_y, eaves_z - 0.04), (side_x, ridge_y, ridge_z - 0.04), (side_x, back_y, eaves_z - 0.04)], 0.075, materials['wood'], group)
    box('Layered eaves cornice', (center_x, 1.0, 7.67), (6.08, 0.44, 0.14), materials['stone_light'], group)
    box('Eaves supporting beam', (center_x, 1.1, 7.53), (6.02, 0.36, 0.13), materials['wood'], group)
    cylinder('Rain gutter', (left_x, 0.77, 7.75), (right_x, 0.77, 7.75), 0.095, materials['iron'], group, 12)
    downpipe_x = right_x - 0.18
    curve('Bent rain downpipe', [(downpipe_x, .77, 7.75), (downpipe_x, .77, 7.36), (downpipe_x, 1.0, 7.10), (downpipe_x, 1.0, 1.12), (downpipe_x, .7, 1.00)], .052, materials['iron'], group)
    for clamp_z in (1.8, 3.6, 5.2, 6.8):
        box('Rainpipe bracket', (downpipe_x, 1.04, clamp_z), (.18, .12, .065), materials['iron'], group, .008)


def _upper_window(window_x, materials, shutter_material, group, rng):
    bottom_z, top_z = 5.14, 7.14
    middle_z = (bottom_z + top_z) / 2
    box('Upper inset glass', (window_x, 1.27, middle_z), (1.08, .025, 1.96), materials['glass'], group, 0)
    _frame('Upper wooden window', (window_x, 1.16, middle_z), 1.13, 2.06, materials['wood'], group)
    box('Window center mullion', (window_x, 1.10, middle_z), (.055, .14, 1.95), materials['wood'], group, .008)
    box('Window crossbar', (window_x, 1.09, 6.34), (1.08, .14, .055), materials['wood'], group, .006)
    box('Carved stone window sill', (window_x, .97, 5.06), (1.49, .48, .13), materials['stone_light'], group)
    box('Stone window lintel', (window_x, 1.09, 7.23), (1.44, .32, .17), materials['stone_light'], group)
    for side in (-1, 1):
        shutter_x = window_x + side * .94
        box('Wooden shutter', (shutter_x, 1.03, middle_z), (.59, .12, 2.08), shutter_material, group, .018)
        for plank in range(4):
            box('Shutter plank seam', (shutter_x - .23 + plank * .153, .957, middle_z), (.012, .01, 2.02), materials['wood'], group, 0)
        for rail_z in (5.45, 6.86):
            box('Shutter horizontal batten', (shutter_x, .935, rail_z), (.6, .07, .095), shutter_material, group, .008)
            sphere('Shutter hinge stud', (window_x + side * .67, .889, rail_z), .032, materials['iron'], group)
    for rail_z in (5.21, 5.54):
        cylinder('Window safety rail', (window_x - .59, .78, rail_z), (window_x + .59, .78, rail_z), .025, materials['iron'], group, 8)
    for rail_index in range(7):
        rail_x = window_x - .55 + rail_index * .183
        cylinder('Window iron baluster', (rail_x, .78, 5.18), (rail_x, .78, 5.57), .016, materials['iron'], group, 8)
    box('Upper room rear wall', (window_x, 3.12, 6.1), (2.10, .13, 2.55), materials['plaster_alt'], group)
    box('Upper room floor', (window_x, 2.14, 4.96), (2.10, 2.05, .12), materials['wood'], group)
    box('Upper room timber wainscot', (window_x, 3.03, 5.42), (2.08, .07, .83), materials['wood'], group)
    picture_x = window_x + rng.uniform(-.28, .28)
    box('Upper room small picture frame', (picture_x, 3.015, 6.39), (.53, .055, .71), materials['wood'], group, .02)
    box('Upper room muted wall art', (picture_x, 2.98, 6.39), (.39, .025, .55), materials['book_blue'], group, .008)
    for curtain_offset in (-.49, .49):
        box('Folded linen curtain', (window_x + curtain_offset, 1.5, 6.14), (.16, .06, 1.94), materials['book_tan'], group, .025)
    light('Warm upstairs room', (window_x + .34, 2.25, 6.85), (1.0, .49, .17), rng.uniform(16, 25), .045, kind='POINT', group=group)


def _shopfront(center_x, materials, frame_material, group):
    for post_x in (center_x - 2.53, center_x + 2.53):
        box('Shop outer pilaster', (post_x, 1.01, 2.57), (.25, .32, 3.43), frame_material, group)
        box('Pilaster foot', (post_x, .96, 1.01), (.35, .4, .27), frame_material, group)
        box('Pilaster capital', (post_x, .94, 4.08), (.36, .39, .19), frame_material, group)
    box('Shop entablature', (center_x, 1.0, 4.35), (5.36, .35, .52), frame_material, group)
    _panel('Blank heritage sign fascia', (center_x, .78, 4.36), 4.76, .32, frame_material, group)
    box('Shop top cornice', (center_x, .92, 4.65), (5.54, .48, .13), frame_material, group)
    box('Shop cornice molding', (center_x, .87, 4.55), (5.42, .44, .08), materials['wood_light'], group, .012)
    for relative_x in (-.70, .70):
        box('Storefront mullion', (center_x + relative_x, 1.01, 2.51), (.13, .22, 3.25), frame_material, group, .015)
    for side in (-1, 1):
        display_x = center_x + side * 1.59
        _panel('Shop lower paneled stallriser', (display_x, 1.06, 1.27), 1.68, .69, frame_material, group)
        box('Display window glass', (display_x, 1.11, 2.65), (1.62, .025, 1.99), materials['glass'], group, 0)
        _frame('Display window bead', (display_x, 1.025, 2.65), 1.65, 2.03, frame_material, group, .1)
        box('Display transom glass', (display_x, 1.1, 3.89), (1.63, .025, .38), materials['glass'], group, 0)
        _frame('Display transom', (display_x, 1.0, 3.89), 1.68, .43, frame_material, group, .1)
        box('Display transom subdivision', (display_x, .99, 3.89), (.06, .1, .4), frame_material, group, .008)
        box('Window projecting sill', (display_x, .93, 1.62), (1.81, .4, .11), frame_material, group)
    _panel('Door lower panel', (center_x, 1.05, 1.35), 1.24, .77, frame_material, group)
    box('Door upper glass', (center_x, 1.10, 2.69), (1.22, .025, 1.85), materials['glass'], group, 0)
    _frame('Entry door frame', (center_x, .99, 2.34), 1.25, 2.87, frame_material, group, .14)
    box('Entry transom glass', (center_x, 1.09, 3.89), (1.22, .025, .38), materials['glass'], group, 0)
    _frame('Entry transom frame', (center_x, .99, 3.89), 1.25, .43, frame_material, group, .13)
    cylinder('Brass door pull', (center_x + .44, .85, 2.04), (center_x + .44, .85, 2.36), .025, materials['brass'], group, 12)
    for handle_z in (2.04, 2.36):
        cylinder('Door pull mounting', (center_x + .44, .85, handle_z), (center_x + .44, .99, handle_z), .022, materials['brass'], group, 10)
    box('Worn doorstep', (center_x, .78, .92), (1.62, .74, .17), materials['stone_light'], group)


def _shelving(center_x, y_position, materials, group, rng, shop_index):
    shelf_width = 4.35
    box('Cabinet rear panel', (center_x, y_position + .14, 2.40), (shelf_width, .15, 2.65), materials['wood'], group)
    for shelf_x in (-shelf_width / 2, 0, shelf_width / 2):
        box('Interior shelf upright', (center_x + shelf_x, y_position - .08, 2.40), (.11, .53, 2.69), materials['wood_light'], group)
    for shelf_index, shelf_z in enumerate((1.11, 1.74, 2.37, 3.0, 3.66)):
        box('Interior shelf board', (center_x, y_position - .08, shelf_z), (shelf_width + .1, .58, .075), materials['wood_light'], group, .015)
        if shelf_index == 4:
            continue
        for section in (-1, 1):
            section_x = center_x + section * 1.09
            if shop_index == 1:
                for book_index in range(10):
                    book_height = rng.uniform(.31, .52)
                    book_x = section_x - .88 + book_index * .185
                    book_material = materials[rng.choice(('book_red', 'book_blue', 'book_tan'))]
                    book = box('Individual book volume', (book_x, y_position - .20, shelf_z + .045 + book_height / 2), (rng.uniform(.10, .17), .24, book_height), book_material, group, .007)
                    if book_index == 1 and shelf_index % 2:
                        book.rotation_euler[1] = .10
                    if book_index % 3 == 0:
                        box('Book spine gilt band', (book_x, y_position - .326, shelf_z + book_height * .7), (.11, .013, .016), materials['brass'], group, .003)
            elif shop_index == 0:
                for jar_index in range(5):
                    jar_x = section_x - .72 + jar_index * .36
                    radius = rng.uniform(.08, .12)
                    height = rng.uniform(.22, .43)
                    cylinder('Cafe pantry vessel', (jar_x, y_position - .20, shelf_z + .04), (jar_x, y_position - .20, shelf_z + height), radius, materials['book_tan'] if jar_index % 2 else materials['terracotta'], group, 12)
                    cylinder('Pantry vessel lid', (jar_x, y_position - .20, shelf_z + height), (jar_x, y_position - .20, shelf_z + height + .025), radius * 1.1, materials['wood'], group, 12)
            else:
                for pot_index in range(4):
                    pot_x = section_x - .65 + pot_index * .43
                    pot_height = rng.uniform(.19, .36)
                    sphere('Pottery shop rounded vessel', (pot_x, y_position - .20, shelf_z + .04 + pot_height / 2), .16, materials['terracotta'] if pot_index % 2 else materials['book_tan'], group, scale=(.8, .8, pot_height / .28))
                    cylinder('Pottery vessel narrow neck', (pot_x, y_position - .2, shelf_z + pot_height - .01), (pot_x, y_position - .2, shelf_z + pot_height + .08), .052, materials['terracotta'] if pot_index % 2 else materials['book_tan'], group, 12)


def _interior(center_x, materials, group, rng, shop_index):
    box('Timber shop floor', (center_x, 3.85, .92), (5.54, 5.36, .13), materials['wood'], group)
    for plank_index in range(14):
        box('Floorboard seam', (center_x - 2.58 + plank_index * .40, 3.85, .99), (.011, 5.2, .005), materials['iron'], group, 0)
    box('Shop ceiling', (center_x, 3.9, 4.36), (5.55, 5.4, .14), materials['plaster_alt'], group)
    for beam_y in (2.4, 4.2, 5.9):
        box('Interior ceiling timber', (center_x, beam_y, 4.20), (5.50, .16, .18), materials['wood'], group)
    for interior_side in (-1, 1):
        wall_x = center_x + interior_side * 2.64
        box('Shop interior timber wainscoting', (wall_x, 2.85, 1.57), (.07, 3.0, 1.18), materials['wood'], group, .012)
        box('Shop interior wainscot cap', (wall_x - interior_side * .04, 2.85, 2.18), (.12, 3.0, .07), materials['wood_light'], group, .01)
        for panel_y in (2.05, 3.37):
            box('Interior framed print', (wall_x - interior_side * .055, panel_y, 2.91), (.075, .68, .86), materials['wood'], group, .018)
            box('Muted interior print', (wall_x - interior_side * .097, panel_y, 2.91), (.015, .54, .71), materials['book_blue'] if shop_index == 1 else materials['book_tan'], group, .006)
    _shelving(center_x, 4.5, materials, group, rng, shop_index)
    for pendant_x in (center_x - 1.40, center_x + 1.40):
        cylinder('Pendant light cord', (pendant_x, 2.55, 4.2), (pendant_x, 2.55, 3.46), .015, materials['iron'], group, 8)
        cylinder('Brass pendant shade', (pendant_x, 2.55, 3.21), (pendant_x, 2.55, 3.47), .25, materials['brass'], group, 24, radius_end=.06)
        sphere('Pendant glowing bulb', (pendant_x, 2.55, 3.22), .055, materials['warm_glow'], group, scale=(1, 1, .72))
        light('Shop pendant illumination', (pendant_x, 2.55, 3.13), (1.0, .53, .20), 48, .045, kind='POINT', group=group)
    light('Interior warm fill', (center_x, 3.95, 3.72), (1.0, .58, .28), 145, 2.2, target=(center_x, .65, 1.15), group=group)
    for display_x in (center_x - 1.58, center_x + 1.58):
        box('Window display ledge', (display_x, 1.75, 1.52), (1.63, .78, .15), materials['wood_light'], group)
        if shop_index == 1:
            for stack_index in range(4):
                box('Display book stack', (display_x - .35, 1.73, 1.66 + .105 * stack_index), (.52, .37, .09), materials['book_red'] if stack_index % 2 else materials['book_tan'], group, .015)
            cylinder('Small display pot', (display_x + .45, 1.73, 1.60), (display_x + .45, 1.73, 1.87), .12, materials['terracotta'], group, 12, radius_end=.16)
        elif shop_index == 0:
            cylinder('Cafe display cake stand', (display_x, 1.73, 1.60), (display_x, 1.73, 1.74), .06, materials['brass'], group, 12)
            cylinder('Cafe cake platter', (display_x, 1.73, 1.74), (display_x, 1.73, 1.78), .33, materials['book_tan'], group, 20)
            cylinder('Display cake', (display_x, 1.73, 1.79), (display_x, 1.73, 2.01), .24, materials['terracotta'], group, 20)
        else:
            for pot_offset in (-.40, .22):
                sphere('Window display pottery', (display_x + pot_offset, 1.77, 1.88), .23, materials['book_tan'], group, scale=(.80, .80, 1.2))
                cylinder('Display pottery neck', (display_x + pot_offset, 1.77, 2.02), (display_x + pot_offset, 1.77, 2.21), .075, materials['book_tan'], group, 12)


def _canopy(center_x, materials, group):
    left_x, right_x = center_x - 2.91, center_x + 2.91
    vertices = [(left_x, .88, 4.61), (right_x, .88, 4.61), (right_x, -.80, 3.97), (left_x, -.80, 3.97), (left_x, -.80, 3.69), (right_x, -.80, 3.69)]
    mesh('Burgundy fabric cafe canopy', vertices, [(0,1,2,3), (3,2,5,4)], materials['fabric'], group)
    for seam_index in range(9):
        seam_x = left_x + seam_index * (right_x - left_x) / 8
        curve('Canopy stitched seam', [(seam_x, .88, 4.62), (seam_x, -.80, 3.98), (seam_x, -.80, 3.71)], .008, materials['book_red'], group)
    cylinder('Canopy leading hem', (left_x, -.80, 3.69), (right_x, -.80, 3.69), .025, materials['fabric'], group)
    for arm_x in (left_x + .1, right_x - .1):
        curve('Canopy iron support', [(arm_x, 1.0, 3.33), (arm_x, -.70, 3.92), (arm_x, 1.0, 4.54)], .032, materials['iron'], group)


def build(materials):
    rng = random.Random(482)
    for shop_index, center_x in enumerate((-7.0, -1.0, 5.0)):
        group = ('01 Cafe', '02 Bookshop', '03 Pottery shop')[shop_index]
        frame_material = materials[('wood', 'teal', 'olive')[shop_index]]
        wall_material = materials['plaster_alt'] if shop_index == 1 else materials['plaster']
        box('Rear masonry wall', (center_x, 6.48, 4.32), (5.8, .24, 6.94), wall_material, group)
        for side in (-1, 1):
            box('Solid party wall', (center_x + side * 2.78, 3.9, 4.31), (.24, 5.4, 6.92), wall_material, group)
        for pier_x in (center_x - 2.71, center_x + 2.71):
            box('Ground floor masonry pier', (pier_x, 1.22, 2.62), (.38, .38, 3.54), wall_material, group)
            box('Masonry stone plinth', (pier_x, 1.10, 1.08), (.42, .45, .46), materials['stone'], group)
        box('Upper facade lower wall', (center_x, 1.29, 4.83), (5.80, .35, .61), wall_material, group)
        box('Upper facade top wall', (center_x, 1.29, 7.48), (5.80, .35, .65), wall_material, group)
        window_centers = (center_x - 1.28, center_x + 1.28)
        for segment_center, segment_width in ((center_x - 2.37, 1.06), (center_x, 1.42), (center_x + 2.37, 1.06)):
            box('Upper wall between real window openings', (segment_center, 1.29, 6.14), (segment_width, .35, 2.04), wall_material, group)
        for course_index in range(8):
            for corner_side in (-1, 1):
                corner_width = .36 if course_index % 2 else .48
                box('Corner masonry quoin', (center_x + corner_side * 2.72, 1.075, 4.87 + course_index * .345), (corner_width, .09, .31), materials['stone_light'], group, .015)
        _shopfront(center_x, materials, frame_material, group)
        _interior(center_x, materials, group, rng, shop_index)
        for window_x in window_centers:
            _upper_window(window_x, materials, frame_material, group, rng)
        _roof(center_x, materials, group, rng)
        if shop_index == 0:
            _canopy(center_x, materials, group)
        if shop_index != 1:
            chimney_x = center_x + (1.55 if shop_index == 0 else -1.55)
            box('Rendered chimney stack', (chimney_x, 5.15, 9.08), (.68, .65, 2.03), wall_material, group)
            for course_z in (8.35, 8.65, 8.95, 9.25, 9.55):
                box('Chimney subtle masonry course', (chimney_x, 4.818, course_z), (.67, .018, .018), materials['mortar'], group, 0)
            box('Chimney cap', (chimney_x, 5.15, 10.11), (.86, .82, .16), materials['stone_light'], group)
            for pot_offset in (-.19, .19):
                cylinder('Chimney clay pot', (chimney_x + pot_offset, 5.15, 10.19), (chimney_x + pot_offset, 5.15, 10.55), .115, materials['terracotta'], group, 12)

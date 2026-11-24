import bpy
import math
import os
import json
from mathutils import Vector


ROOT = os.path.abspath(os.path.join(os.path.dirname(bpy.data.filepath or os.getcwd()), "..", ".."))
if not bpy.data.filepath:
    ROOT = os.getcwd()
OUTPUT_BLEND = os.path.join(ROOT, "assets", "blender", "referencia_cartoon.blend")
OUTPUT_RENDER = os.path.join(ROOT, "renders", "referencia_cartoon_1920x1080.png")
OUTPUT_MODELS = os.path.join(ROOT, "assets", "models", "referencia")
OUTPUT_PALETTE = os.path.join(ROOT, "assets", "models", "palette.json")

os.makedirs(os.path.dirname(OUTPUT_BLEND), exist_ok=True)
os.makedirs(OUTPUT_MODELS, exist_ok=True)
os.makedirs(os.path.dirname(OUTPUT_RENDER), exist_ok=True)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for datablock in (bpy.data.meshes, bpy.data.curves, bpy.data.cameras, bpy.data.lights, bpy.data.materials):
    pass


def color(hex_value):
    value = hex_value.lstrip("#")
    return tuple(int(value[i:i+2], 16) / 255 for i in (0, 2, 4)) + (1,)


PALETTE = {
    "verde_limao": "#7ED957",
    "verde_folha": "#4FBF68",
    "terra_chocolate": "#8B5E3C",
    "ciano": "#4FE3C1",
    "amarelo": "#FFD166",
    "azul_agua": "#4FC3F7",
    "violeta": "#B26BFF",
    "rosa": "#FF9AE0",
    "violeta_escuro": "#5B4FC4",
    "ceu_pastel": "#BFE9FF",
    "contorno": "#3A2C3A"
}


def make_collection(name):
    collection = bpy.data.collections.get(name)
    if collection:
        return collection
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def material(name, base, roughness=0.58, metallic=0.0, emission=None, emission_strength=0.0):
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    principled = next((node for node in nodes if node.bl_idname == "ShaderNodeBsdfPrincipled"), None)
    if not principled:
        principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.inputs["Base Color"].default_value = color(base)
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Metallic"].default_value = metallic
    if emission:
        if "Emission Color" in principled.inputs:
            principled.inputs["Emission Color"].default_value = color(emission)
            principled.inputs["Emission Strength"].default_value = emission_strength
    mat.diffuse_color = color(base)
    return mat


def assign_material(obj, mat):
    if hasattr(obj.data, "materials"):
        obj.data.materials.append(mat)


def move_to_collection(obj, collection):
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    collection.objects.link(obj)


def apply_modifiers(obj, bevel=0.08, segments=3):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        mod = obj.modifiers.new("Bordas arredondadas", "BEVEL")
        mod.width = bevel
        mod.segments = segments
        mod.affect = 'EDGES'
    obj.select_set(False)


def add_outline(obj, thickness=0.035):
    bpy.context.view_layer.objects.active = obj
    mod = obj.modifiers.new("Contorno toon", "SOLIDIFY")
    mod.thickness = thickness
    mod.offset = -1
    mod.use_rim = True
    mat_outline = material("contorno_toon", PALETTE["contorno"], roughness=0.9)
    if len(obj.data.materials) == 0:
        assign_material(obj, mat_outline)
    obj.data.materials.append(mat_outline)
    mod.material_offset = len(obj.data.materials) - 1


def mesh_cube(name, location, scale, mat, collection, bevel=0.12):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    move_to_collection(obj, collection)
    assign_material(obj, mat)
    apply_modifiers(obj, bevel)
    return obj


def mesh_cylinder(name, location, radius, depth, mat, collection, vertices=32, bevel=0.08):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    move_to_collection(obj, collection)
    assign_material(obj, mat)
    apply_modifiers(obj, bevel)
    return obj


def mesh_uv(name, location, scale, mat, collection, segments=32, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    move_to_collection(obj, collection)
    assign_material(obj, mat)
    apply_modifiers(obj, 0.04)
    return obj


def mesh_cone(name, location, radius1, radius2, depth, mat, collection, vertices=32, bevel=0.08):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius1, radius2=radius2, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    move_to_collection(obj, collection)
    assign_material(obj, mat)
    apply_modifiers(obj, bevel)
    return obj


def mesh_torus(name, location, major_radius, minor_radius, mat, collection, major_segments=32, minor_segments=10):
    bpy.ops.mesh.primitive_torus_add(
        major_segments=major_segments,
        minor_segments=minor_segments,
        location=location,
        major_radius=major_radius,
        minor_radius=minor_radius
    )
    obj = bpy.context.object
    obj.name = name
    move_to_collection(obj, collection)
    assign_material(obj, mat)
    apply_modifiers(obj, 0.03)
    return obj


def parent_empty(name, location, collection):
    empty = bpy.data.objects.new(name, None)
    empty.location = location
    collection.objects.link(empty)
    return empty


def clone_no_outline(source, name, collection):
    copy_obj = source.copy()
    copy_obj.data = source.data.copy()
    copy_obj.name = name
    copy_obj.modifiers.clear()
    move_to_collection(copy_obj, collection)
    return copy_obj


def create_plot(kind, location, wet):
    collection = collections["Canteiros"]
    root = parent_empty("plot_%s_%s" % (kind, "wet" if wet else "dry"), location, collection)
    border_color = "#C19A68" if kind == "farm" else ("#7E6BD0" if kind == "island" else "#4FE3C1")
    soil_color = "#8B5E3C" if not wet and kind != "island" else ("#4A3A78" if kind == "island" else "#6E4A32")
    if wet:
        soil_color = "#5A3A28"
    border = material("cantero_borda_%s" % kind, border_color, 0.72)
    soil = material("solo_%s_%s" % (kind, "wet" if wet else "dry"), soil_color, 0.95)
    base = mesh_cube("plot_%s_%s_base" % (kind, "wet" if wet else "dry"), (location[0], location[1] + 0.25, location[2]), (1.9, 0.275, 1.9), border, collection, 0.18)
    earth = mesh_cube("plot_%s_%s_solo" % (kind, "wet" if wet else "dry"), (location[0], location[1] + 0.43, location[2]), (1.72, 0.20, 1.72), soil, collection, 0.14)
    base.parent = root
    earth.parent = root
    add_outline(base, 0.032)
    add_outline(earth, 0.025)
    if kind == "tower":
        post_mat = material("metal_cartoon", "#C9D8E4", 0.35, 0.25)
        cyan = material("glow_cyan", PALETTE["ciano"], 0.25, 0.0, PALETTE["ciano"], 0.9)
        for dx in (-1.7, 1.7):
            for dz in (-1.7, 1.7):
                post = mesh_cylinder("cantero_torre_poste", (location[0] + dx, location[1] + 1.1, location[2] + dz), 0.09, 2.2, post_mat, collection, 12, 0.04)
                post.parent = root
                add_outline(post, 0.025)
        frame = mesh_cube("cantero_torre_energia", (location[0], location[1] + 2.2, location[2]), (1.75, 0.04, 1.75), cyan, collection, 0.05)
        frame.parent = root
    return root


def create_lettuce(location):
    collection = collections["Culturas"]
    root = parent_empty("crop_lettuce_ready", location, collection)
    green_dark = material("alface_verde_escuro", "#55A84D", 0.72)
    green = material("alface_verde", "#8FE26B", 0.68)
    green_light = material("alface_verde_claro", "#BCEB7A", 0.66)
    stem = material("alface_nucleo", "#E8F0A5", 0.78)
    nucleus = mesh_uv("crop_lettuce_ready_nucleo", (location[0], location[1] + 0.38, location[2]), (0.38, 0.30, 0.38), stem, collection)
    nucleus.parent = root
    for i in range(9):
        angle = i * math.tau / 9
        ring = i % 3
        radius = 0.24 + ring * 0.15
        height = 0.42 + ring * 0.16
        mat = [green_dark, green, green_light][ring]
        leaf = mesh_uv(
            "crop_lettuce_ready_folha_%02d" % i,
            (location[0] + math.cos(angle) * radius, location[1] + height, location[2] + math.sin(angle) * radius),
            (0.34 - ring * 0.02, 0.12, 0.22),
            mat,
            collection,
            24,
            12
        )
        leaf.rotation_euler[2] = angle
        leaf.rotation_euler[1] = math.radians(-18 + ring * 8)
        leaf.parent = root
        add_outline(leaf, 0.018)
    add_outline(nucleus, 0.018)
    return root


def create_apple(location):
    collection = collections["Arvores"]
    root = parent_empty("tree_apple_mature", location, collection)
    trunk = material("macieira_tronco", "#A66A3F", 0.82)
    crown = material("macieira_copa", "#6BCB70", 0.78)
    crown_light = material("macieira_copa_clara", "#93E078", 0.76)
    apple = material("maca_cristal", "#FF5C67", 0.50, 0.0, "#FF4D5E", 0.25)
    stalk = material("macieira_cabinho", "#7A4E32", 0.85)
    trunk_obj = mesh_cylinder("tree_apple_mature_tronco", (location[0], location[1] + 1.20, location[2]), 0.24, 2.40, trunk, collection, 16, 0.10)
    trunk_obj.parent = root
    for i, (dx, dy, dz, scale, mat) in enumerate([
        (-0.55, 2.30, 0.20, 0.95, crown),
        (0.55, 2.40, -0.05, 1.05, crown_light),
        (0.05, 2.85, 0.10, 1.15, crown),
        (-0.20, 2.55, -0.55, 0.90, crown_light),
        (0.20, 2.55, 0.55, 0.85, crown)
    ]):
        crown_obj = mesh_uv("tree_apple_mature_copa_%02d" % i, (location[0] + dx, location[1] + dy, location[2] + dz), (scale, scale * 0.82, scale), mat, collection)
        crown_obj.parent = root
    for i, (dx, dy, dz) in enumerate([
        (-0.55, 2.18, 0.72), (0.48, 2.35, 0.58),
        (0.78, 2.72, -0.12), (-0.72, 2.72, -0.35),
        (0.05, 3.12, -0.20)
    ]):
        fruit = mesh_uv("tree_apple_mature_fruto_%02d" % i, (location[0] + dx, location[1] + dy, location[2] + dz), (0.23, 0.25, 0.23), apple, collection)
        fruit.parent = root
        cabinho = mesh_cylinder("tree_apple_mature_cabinho_%02d" % i, (location[0] + dx, location[1] + dy + 0.24, location[2] + dz), 0.025, 0.20, stalk, collection, 8, 0.01)
        cabinho.parent = root
        cabinho.rotation_euler[1] = math.radians(18)
    for obj in bpy.context.scene.objects:
        if obj != root and obj.name.startswith("tree_apple_mature"):
            add_outline(obj, 0.025)
    return root


def create_lab(location):
    collection = collections["Estruturas"]
    root = parent_empty("struct_lab_l1", location, collection)
    wall = material("lab_paredes", "#EAF5F4", 0.65)
    roof = material("lab_telhado", "#4C6E8C", 0.55)
    cyan = material("lab_ciano", PALETTE["ciano"], 0.25, 0.0, PALETTE["ciano"], 1.0)
    yellow = material("lab_amarelo", PALETTE["amarelo"], 0.30, 0.0, PALETTE["amarelo"], 0.7)
    crystal = material("lab_cristal", "#7FE9FF", 0.25, 0.0, "#59E6FF", 1.2)
    body = mesh_cube("struct_lab_l1_corpo", (location[0], location[1] + 1.25, location[2]), (2.10, 1.25, 1.70), wall, collection, 0.22)
    body.parent = root
    roof_obj = mesh_cube("struct_lab_l1_cobertura", (location[0], location[1] + 2.58, location[2]), (2.25, 0.18, 1.82), roof, collection, 0.20)
    roof_obj.parent = root
    door = mesh_cube("struct_lab_l1_porta", (location[0], location[1] + 0.82, location[2] + 1.72), (0.72, 0.78, 0.07), cyan, collection, 0.12)
    door.parent = root
    window1 = mesh_cube("struct_lab_l1_janela_01", (location[0] - 1.18, location[1] + 1.42, location[2] + 1.70), (0.52, 0.48, 0.08), yellow, collection, 0.10)
    window2 = mesh_cube("struct_lab_l1_janela_02", (location[0] + 1.18, location[1] + 1.42, location[2] + 1.70), (0.52, 0.48, 0.08), yellow, collection, 0.10)
    window1.parent = root
    window2.parent = root
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.34, location=(location[0] - 0.85, location[1] + 3.12, location[2]))
    dome = bpy.context.object
    dome.name = "struct_lab_l1_antena"
    move_to_collection(dome, collection)
    assign_material(dome, crystal)
    apply_modifiers(dome, 0.04)
    dome.parent = root
    mast = mesh_cylinder("struct_lab_l1_mastro", (location[0] - 0.85, location[1] + 2.83, location[2]), 0.07, 0.60, roof, collection, 12, 0.03)
    mast.parent = root
    for obj in bpy.context.scene.objects:
        if obj != root and obj.name.startswith("struct_lab_l1"):
            add_outline(obj, 0.028)
    return root


collections = {name: make_collection(name) for name in ("Canteiros", "Culturas", "Arvores", "Estruturas", "Vitrine")}

create_plot("farm", (-5.0, 0, 0), False)
create_plot("farm", (-5.0, 0, 1.8), True)
create_plot("island", (-5.0, 0, 3.6), True)
create_plot("tower", (-5.0, 0, 5.4), False)
create_lettuce((-1.5, 0, 0))
create_apple((2.0, 0, 0))
create_lab((5.5, 0, 0))

with open(OUTPUT_PALETTE, "w", encoding="utf-8") as handle:
    json.dump(PALETTE, handle, ensure_ascii=False, indent=2)

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1920
scene.render.resolution_y = 1080
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = OUTPUT_RENDER
scene.render.film_transparent = False
scene.view_settings.look = "AgX - Medium High Contrast"
scene.world.color = color(PALETTE["ceu_pastel"])[:3]
scene.world.use_nodes = True
world_nodes = scene.world.node_tree.nodes
background = world_nodes.get("Background")
background.inputs["Color"].default_value = color(PALETTE["ceu_pastel"])
background.inputs["Strength"].default_value = 0.75

bpy.ops.object.light_add(type='AREA', location=(6, 10, 12))
key = bpy.context.object
key.name = "luz_principal_quente"
key.data.energy = 850
key.data.color = color("#FFF2C8")[:3]
key.data.size = 8

bpy.ops.object.light_add(type='SUN', location=(-8, 8, 10))
sun = bpy.context.object
sun.name = "sol_toque_carto"
sun.data.energy = 2.0
sun.data.color = color("#FFD8A8")[:3]
sun.rotation_euler = (math.radians(28), math.radians(-30), math.radians(-25))

bpy.ops.object.camera_add(location=(0.5, -30, 2))
camera = bpy.context.object
camera.name = "camera_vitrine"
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 13
direction = Vector((0.5, 1.2, 0.0)) - camera.location
camera.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
scene.camera = camera

bpy.ops.wm.save_as_mainfile(filepath=OUTPUT_BLEND)
bpy.ops.render.render(write_still=True)

for category, names in (
    ("canteiros", ("plot_farm_dry", "plot_farm_wet", "plot_island_wet", "plot_tower_dry")),
    ("culturas", ("crop_lettuce_ready",)),
    ("arvores", ("tree_apple_mature",)),
    ("estruturas", ("struct_lab_l1",)),
):
    category_dir = os.path.join(OUTPUT_MODELS, category)
    os.makedirs(category_dir, exist_ok=True)
    for name in names:
        bpy.ops.object.select_all(action='DESELECT')
        selected = []
        for obj in bpy.context.scene.objects:
            if obj.name == name or obj.parent and obj.parent.name == name:
                obj.select_set(True)
                selected.append(obj)
        if not selected:
            continue
        bpy.context.view_layer.objects.active = selected[0]
        glb_path = os.path.join(category_dir, name + ".glb")
        fbx_path = os.path.join(category_dir, name + ".fbx")
        bpy.ops.export_scene.gltf(filepath=glb_path, export_format='GLB', use_selection=True)
        bpy.ops.export_scene.fbx(filepath=fbx_path, use_selection=True, apply_unit_scale=True)

        temp_objects = []
        source_objects = list(selected)
        for source in source_objects:
            if source.type == 'MESH':
                temp = source.copy()
                temp.data = source.data.copy()
                temp.name = source.name + "_no_outline"
                temp.modifiers.clear()
                bpy.context.scene.collection.objects.link(temp)
                temp_objects.append(temp)

        bpy.ops.object.select_all(action='DESELECT')
        for temp in temp_objects:
            temp.select_set(True)
        if temp_objects:
            bpy.context.view_layer.objects.active = temp_objects[0]
            bpy.ops.export_scene.gltf(
                filepath=os.path.join(category_dir, name + "_no_outline.glb"),
                export_format='GLB',
                use_selection=True
            )
            bpy.ops.export_scene.fbx(
                filepath=os.path.join(category_dir, name + "_no_outline.fbx"),
                use_selection=True,
                apply_unit_scale=True
            )
        for temp in temp_objects:
            bpy.data.objects.remove(temp, do_unlink=True)

bpy.ops.wm.save_as_mainfile(filepath=OUTPUT_BLEND)
print("REFERENCIA_CARTOON_CONCLUIDA")

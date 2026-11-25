import bpy, sys
args=sys.argv[sys.argv.index('--')+1:]
src,dst,texsize=args[0],args[1],int(args[2])
names=dict(a.split('=') for a in args[3:])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
for o in list(bpy.data.objects):
    if o.type=='MESH' and o.parent is None: bpy.data.objects.remove(o)
arm=[o for o in bpy.data.objects if o.type=='ARMATURE'][0]
mesh=[o for o in bpy.data.objects if o.type=='MESH'][0]
arm.name='Rig'; mesh.name=args[1].split('/')[-1].split('.')[0].split('_')[0].capitalize()+'Mesh'
for a in list(bpy.data.actions):
    key=a.name.replace('_Armature','')
    if key in names: a.name=names[key]; a.use_fake_user=True
    else: print('drop',a.name); bpy.data.actions.remove(a)
# clean NLA, keep actions as stashed tracks so exporter picks them all
ad=arm.animation_data or arm.animation_data_create()
ad.action=None
for t in list(ad.nla_tracks): ad.nla_tracks.remove(t)
for a in bpy.data.actions:
    tr=ad.nla_tracks.new(); tr.name=a.name; s=tr.strips.new(a.name,int(a.frame_range[0]),a); tr.mute=True
for im in bpy.data.images:
    if im.size[0]>texsize: im.scale(texsize,texsize)
mat=mesh.data.materials[0]
for n in mat.node_tree.nodes:
    if n.type=='BSDF_PRINCIPLED':
        n.inputs['Roughness'].default_value=0.85; n.inputs['Metallic'].default_value=0.0
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_animations=True, export_animation_mode='NLA_TRACKS',
  export_image_format='JPEG', export_jpeg_quality=88, export_apply=False, export_yup=True, export_skins=True,
  export_force_sampling=True, export_optimize_animation_size=True, export_def_bones=True)
print('OK',dst,[a.name for a in bpy.data.actions])

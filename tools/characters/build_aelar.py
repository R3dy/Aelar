import bpy, bmesh, sys, colorsys
sys.path.insert(0,'.')
from mathutils import Vector, Matrix
import swordsel
from swordsel import select_sword, A, B
args=sys.argv[sys.argv.index('--')+1:]
src,dst=args[0],args[1]
names=dict(a.split('=') for a in args[2:])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
extra=names.pop('_extra',None)
if extra:
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=extra)
    for x in set(bpy.data.objects)-before: bpy.data.objects.remove(x)
for o in list(bpy.data.objects):
    if o.type=='MESH' and o.parent is None: bpy.data.objects.remove(o)
arm=[o for o in bpy.data.objects if o.type=='ARMATURE'][0]; arm.name='Rig'
o=[x for x in bpy.data.objects if x.type=='MESH'][0]; o.name='AelarBody'
# rest pose for selection
ad=arm.animation_data; saved=ad.action if ad else None
if ad: ad.action=None
for pb in arm.pose.bones: pb.matrix_basis=Matrix()
bpy.context.view_layer.update()
sel=select_sword(o)
# widen: remaining faces near the sword axis
M=o.matrix_world; d=(B-A).normalized(); L=(B-A).length
out=Vector((0,1,0)); out=(out-d*out.dot(d)).normalized(); w=d.cross(out)
me=o.data
img=[n.image for n in me.materials[0].node_tree.nodes if n.type=='TEX_IMAGE'][0]
W,H=img.size; px=img.pixels[:]
uvl=me.uv_layers.active.data
def col(li):
    u,v=uvl[li].uv; x=min(W-1,int(u%1*W)); y=min(H-1,int(v%1*H)); i=(y*W+x)*4; return px[i:i+3]
# find a solid cape-red texel: sample faces on cape area away from sword
import numpy as np
P=np.array(px,dtype=np.float32).reshape(H,W,4)[:,:,:3]
r,g,b=P[...,0],P[...,1],P[...,2]
isred=(r>0.25)&(r<0.6)&(g<0.35*r)&(b<0.45*r)
from numpy.lib.stride_tricks import sliding_window_view
k=9; win=sliding_window_view(isred,(k,k)).all(axis=(2,3))
ys,xs=np.nonzero(win)
# choose median-coloured candidate
i=len(ys)//2; yy,xx=ys[i]+k//2,xs[i]+k//2
redu=Vector(((xx+0.5)/W,(yy+0.5)/H)); print('redpix',P[yy,xx],len(ys))
print('REDUV',redu)
moved=0; patched=0
for poly in me.polygons:
    if poly.index in sel: continue
    c=M@poly.center; r=c-A; t=r.dot(d)
    if t<-0.05 or t>L+0.05: continue
    lat=abs(r.dot(w)); dep=r.dot(out); hw=swordsel.halfw(c.z)+0.03
    if lat<hw and -0.08<dep<0.1:
        cs=[col(li) for li in poly.loop_indices]; rr,gg,bb=[sum(a[i] for a in cs)/len(cs) for i in range(3)]
        h,s,v=colorsys.rgb_to_hsv(rr,gg,bb)
        if (h<0.04 or h>0.9) and s>0.4 and c.z<1.62: continue
        if c.z>1.55: sel.add(poly.index); moved+=1
        elif c.z<=1.55:
            for li in poly.loop_indices: uvl[li].uv=redu
            patched+=1
print('SEL',len(sel),'moved',moved,'patched',patched)
bpy.context.view_layer.objects.active=o; bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_mode(type='FACE'); bpy.ops.mesh.select_all(action='DESELECT')
bm=bmesh.from_edit_mesh(me); bm.faces.ensure_lookup_table()
for i in sel: bm.faces[i].select_set(True)
bmesh.update_edit_mesh(me); bpy.ops.mesh.separate(type='SELECTED'); bpy.ops.object.mode_set(mode='OBJECT')
back=[x for x in bpy.data.objects if x.type=='MESH' and x!=o][0]; back.name='BackSword'
# hand sword: duplicate, remove skin, bake rest-pose world shape, parent to RightHand
hand=back.copy(); hand.data=back.data.copy(); hand.name='HandSword'; bpy.context.collection.objects.link(hand)
for m in list(hand.modifiers): hand.modifiers.remove(m)
hand.vertex_groups.clear()
mw=hand.matrix_world.copy(); hand.parent=None; hand.matrix_world=mw
bpy.context.view_layer.objects.active=hand; bpy.ops.object.select_all(action='DESELECT'); hand.select_set(True)
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
# sword local frame: grip point on handle, axis from grip to tip
grip=A+(B-A).normalized()*0.17   # handle middle (between pommel and guard)
ax=(B-A).normalized()
# build matrix mapping sword frame -> world: Z' = ax, origin grip
up=Vector((0,1,0)); x_=up.cross(ax).normalized(); y_=ax.cross(x_)
S=Matrix.Identity(4)
for i in range(3): S[i][0]=x_[i]; S[i][1]=y_[i]; S[i][2]=ax[i]; S[i][3]=grip[i]
hand.data.transform(S.inverted())  # now sword in local frame: grip at origin, blade along +Z
bpy.context.view_layer.update()
names.pop('_gripoff',None)
# export the sword alone (grip at origin, blade along +Y in glTF)
bpy.ops.object.select_all(action='DESELECT'); hand.select_set(True)
for im in bpy.data.images:
    if im.size[0]>1024: im.scale(1024,1024)
bpy.ops.export_scene.gltf(filepath=dst.replace('aelar.glb','aelar_sword.glb'), use_selection=True, export_format='GLB',
  export_image_format='JPEG', export_jpeg_quality=88, export_yup=True, export_animations=False, export_skins=False)
bpy.data.objects.remove(hand)
# restore animations / rename
for a in list(bpy.data.actions):
    key=a.name.split('_Armature')[0]
    if key in names: a.name=names[key]; a.use_fake_user=True
    else: print('drop',a.name,key); bpy.data.actions.remove(a)
ad=arm.animation_data or arm.animation_data_create(); ad.action=None
for t in list(ad.nla_tracks): ad.nla_tracks.remove(t)
for a in bpy.data.actions:
    tr=ad.nla_tracks.new(); tr.name=a.name; tr.strips.new(a.name,int(a.frame_range[0]),a); tr.mute=True
for im in bpy.data.images:
    if im.size[0]>1024: im.scale(1024,1024)
for m in bpy.data.materials:
    for n in m.node_tree.nodes:
        if n.type=='BSDF_PRINCIPLED': n.inputs['Roughness'].default_value=0.85; n.inputs['Metallic'].default_value=0.0
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_animations=True, export_animation_mode='NLA_TRACKS',
  export_image_format='JPEG', export_jpeg_quality=88, export_yup=True, export_skins=True, export_force_sampling=True,
  export_optimize_animation_size=True, export_def_bones=True)
print('OK',[x.name for x in bpy.data.objects],[a.name for a in bpy.data.actions])

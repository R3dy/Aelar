# shared: select back-sword faces on Aelar mesh object o (rest pose, world coords meters, Blender Z-up)
import bpy, bmesh, colorsys
from mathutils import Vector
A=Vector((-0.345,0.03,1.833)); B=Vector((0.235,0.225,0.57))
def halfw(z):
    if z>1.62: return 0.05
    if z>1.47: return 0.15
    # blade: 0.08 near guard -> 0.02 at tip
    t=(1.47-z)/(1.47-0.57); return max(0.035,0.12*(1-t)+0.035*t)
def select_sword(o, scale=1.0):
    M=o.matrix_world
    d=(B-A).normalized(); out=Vector((0,1,0)); out=(out-d*out.dot(d)).normalized(); w=d.cross(out)
    me=o.data
    img=None
    for n in me.materials[0].node_tree.nodes:
        if n.type=='TEX_IMAGE': img=n.image
    W,H=img.size; px=list(img.pixels)
    uv=me.uv_layers.active.data
    def col(li):
        u,v=uv[li].uv; x=min(W-1,int(u%1*W)); y=min(H-1,int(v%1*H)); i=(y*W+x)*4
        return px[i],px[i+1],px[i+2]
    sel=set()
    for poly in me.polygons:
        c=M@poly.center
        r=c-A; t=r.dot(d); L=(B-A).length
        if t< -0.03 or t> L+0.03: continue
        dep=r.dot(out); lat=r.dot(w); z=c.z
        hw=halfw(z)
        dmin=-0.06 if z>1.47 else -0.03
        if abs(lat)<hw and dmin<dep<0.08:
            cs=[col(li) for li in poly.loop_indices]
            rr=sum(a[0] for a in cs)/len(cs); gg=sum(a[1] for a in cs)/len(cs); bb=sum(a[2] for a in cs)/len(cs)
            h,s,v=colorsys.rgb_to_hsv(rr,gg,bb)
            red=(h<0.04 or h>0.9) and s>0.4 and z<1.62
            if not red: sel.add(poly.index)
    return sel

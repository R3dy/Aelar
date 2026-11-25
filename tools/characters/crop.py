from PIL import Image
import numpy as np, sys
def crop(src, x0,x1,y0,y1,out):
    im=Image.open(src).convert('RGB'); a=np.asarray(im).astype(int)
    bg=a[5,5]
    sub=a[y0:y1,x0:x1]; m=(np.abs(sub-bg).sum(2)>30)
    ys,xs=np.where(m)
    bx0,bx1,by0,by1=xs.min()+x0,xs.max()+x0,ys.min()+y0,ys.max()+y0
    pad=20; c=Image.new('RGB',(bx1-bx0+2*pad,by1-by0+2*pad),tuple(bg)); c.paste(im.crop((bx0,by0,bx1,by1)),(pad,pad))
    s=max(c.size); sq=Image.new('RGB',(s,s),tuple(bg)); sq.paste(c,((s-c.size[0])//2,(s-c.size[1])//2))
    sq=sq.resize((1024,1024),Image.LANCZOS); sq.save(out); print(out,(bx0,by0,bx1,by1),bg)
H='/mnt/project-files/reference/03-hero-sheet-v2-accepted.png'
R='/mnt/project-files/reference/07-master-ryn-sheet.png'
crop(H,120,480,0,530,'a_front.png'); crop(H,520,760,0,530,'a_side.png')
crop(H,820,1200,0,522,'a_back.png'); crop(H,1240,1560,0,530,'a_34.png')
crop(R,20,460,100,830,'r_front.png'); crop(R,450,700,100,830,'r_side.png'); crop(R,700,1120,100,830,'r_back.png')

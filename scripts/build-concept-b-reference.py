"""Offline artwork/flow bake. Requires Pillow, numpy, opencv-python-headless.
No Python/OpenCV runtime dependency is shipped to the app.
"""
import cv2,json,hashlib
import numpy as np
from PIL import Image,ImageDraw
from pathlib import Path
source=Path('docs/evidence/concept-b-reconstruction/reference/source.gif')
out=Path('public/orb-concept-b');out.mkdir(exist_ok=True)
im=Image.open(source);frames=[];rows=[]
for i in range(im.n_frames):
 im.seek(i);assert im.info.get('duration')==170;rgba=im.convert('RGBA');rgba.save(source.parent/f'frame-{i}.png');rgb=Image.new('RGB',im.size);rgb.paste(rgba,mask=rgba.getchannel('A'));frames.append(np.array(rgb))
assert len(frames)==9 and im.size==(420,408)
w,h=im.size
atlas=Image.new('RGB',(w*3,h*3))
forward=Image.new('RGB',(w*3,h*3));backward=forward.copy()
Y,X=np.mgrid[:h,:w];R=np.sqrt(((X-w/2)/w)**2+((Y-h/2)/h)**2)
# Fixed identity region has no motion. A smooth annulus prevents a seam.
lock=np.clip((R-.15)/.08,0,1);lock=lock*lock*(3-2*lock)
dis=cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
dis.setFinestScale(0)
for i,a in enumerate(frames):
 b=frames[(i+1)%9];ga=cv2.cvtColor(a,cv2.COLOR_RGB2GRAY);gb=cv2.cvtColor(b,cv2.COLOR_RGB2GRAY)
 fa=cv2.GaussianBlur(dis.calc(ga,gb,None),(0,0),7)*lock[:,:,None];fb=cv2.GaussianBlur(dis.calc(gb,ga,None),(0,0),7)*lock[:,:,None]
 def pack(f):
  # 16-bit fixed point across RG/BA is unnecessary: +/-96 px, .756px precision.
  encoded=np.zeros((h,w,3),np.uint8);encoded[:,:,:2]=np.round(np.clip(f/96,-1,1)*127+128).astype(np.uint8)
  return Image.fromarray(encoded)
 pos=(i%3*w,i//3*h);atlas.paste(Image.fromarray(a),pos);forward.paste(pack(fa),pos);backward.paste(pack(fb),pos)
 mask=a[:,:,2]>60;ys,xs=np.where(mask)
 center=(X>145)&(X<280)&(Y>145)&(Y<250)&(a[:,:,1]>150)&(a[:,:,2]>150)
 cy,cx=np.where(center)
 rows.append(dict(frame=i,bounds=[int(xs.min()),int(ys.min()),int(xs.max()),int(ys.max())],TBounds=[int(cx.min()),int(cy.min()),int(cx.max()),int(cy.max())],meanBlue=float(a[:,:,2].mean()),meanFlowPx=float(np.linalg.norm(fa,axis=2).mean()),p95FlowPx=float(np.percentile(np.linalg.norm(fa,axis=2),95)),nextFrameMAE=float(np.abs(a.astype(float)-b).mean())))
atlas.save(out/'membrane.png',optimize=True);forward.save(out/'forward.png',optimize=True);backward.save(out/'backward.png',optimize=True)
(out/'manifest.json').write_text(json.dumps(dict(version=1,width=w,height=h,frames=9,frameMs=170,flowRangePx=96,sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),pairs=rows),indent=2))
print(json.dumps(rows,indent=2))

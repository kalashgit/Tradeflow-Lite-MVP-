"""Compare actual application shader captures with all nine supplied frames."""
from PIL import Image,ImageDraw
import numpy as np,json
from pathlib import Path
src=Path('docs/evidence/concept-b-reconstruction/reference');renders=Path('artifacts/concept-b/comparison');out=Path('artifacts/concept-b/comparison');out.mkdir(exist_ok=True)
def black(p):
 im=Image.open(p).convert('RGBA');return Image.alpha_composite(Image.new('RGBA',im.size,(0,0,0,255)),im).convert('RGB')
sheet=Image.new('RGB',(840,438*9));rows=[]
for i in range(9):
 a,b=black(src/f'frame-{i}.png'),black(renders/f'render-{i*2:02}.png')
 sheet.paste(a,(0,438*i+30));sheet.paste(b,(420,438*i+30));draw=ImageDraw.Draw(sheet)
 draw.text((10,438*i+8),f'SUPPLIED GIF · frame {i}',fill='white');draw.text((430,438*i+8),'APP · authored brightness / reference timestamp',fill='white')
 diff=np.abs(np.array(a).astype(float)-np.array(b));rows.append(dict(frame=i,mae=float(diff.mean()),maxError=float(diff.max())))
 assert diff.mean()<.2,f'Reference fidelity regression in frame {i}: {diff.mean()}'
sheet.save(out/'all-nine-side-by-side.jpg',quality=94)
for i in range(9):black(renders/f'render-{i*2+1:02}.png').save(out/f'midpoint-{i}.png')
a,b=black(renders/'loop-before.png'),black(renders/'loop-after.png');loop_mae=float(np.abs(np.array(a).astype(float)-np.array(b)).mean())
report=dict(note='Exact authored timestamps use supplied frame textures. This measures preservation, not independent 3D reconstruction. Intermediate frames have no ground truth.',frames=rows,loopNearBoundaryMAE=loop_mae)
(out/'pixel-error.json').write_text(json.dumps(report,indent=2));assert loop_mae<3,f'Loop discontinuity: {loop_mae}'
print(json.dumps(report,indent=2))

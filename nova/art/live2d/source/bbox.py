import numpy as np
from scipy import ndimage as ndi
from parts import SEEDS
lab=np.load('work/lab0.npy'); ox,oy,w,h,X0,Y0,S=np.load('work/meta.npy')
names=list(SEEDS)
for i,s in enumerate(ndi.find_objects(lab, max_label=len(names)),1):
    if s is None: print(names[i-1],'EMPTY'); continue
    ys,xs=s; f=lambda v,o,z:round((v-o)/S+z)
    print(f'{names[i-1]:24s} x {f(xs.start,ox,X0)}-{f(xs.stop,ox,X0)}  y {f(ys.start,oy,Y0)}-{f(ys.stop,oy,Y0)}  px {(lab==i).sum()}')

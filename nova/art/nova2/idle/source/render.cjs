// Deterministic 8-second, 60-fps idle. Requires Node, sharp and ffmpeg.
// Run from this package: node source/render.cjs
const fs=require('fs'),path=require('path'),sharp=require('sharp');
const root=path.resolve(__dirname,'..'),out=path.join(root,'frames');fs.mkdirSync(out,{recursive:true});
const W=600,H=800,FPS=60,DURATION=8,N=FPS*DURATION;
const smooth=(a,b,x)=>{let t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
function displacement(x,y,t){
 const p=2*Math.PI*t/DURATION,breath=Math.sin(2*p),sway=Math.sin(p);
 const above=1-smooth(500,730,y),head=1-smooth(235,310,y);
 const angle=.012*Math.sin(p+.3)*head,dx=x-301,dy=y-260;
 let u=2.8*sway*above-angle*dy,v=-1.8*breath*above+angle*dx;
 const torso=Math.exp(-Math.pow((y-340)/90,2));
 u+=(x-300)*.007*breath*torso;v-=1.1*breath*torso;
 const antenna=Math.exp(-Math.pow((x-275)/60,2)-Math.pow((y-99)/34,2));
 u+=3.4*Math.sin(2*p-.5)*antenna;
 const hairL=Math.exp(-Math.pow((x-204)/32,2)-Math.pow((y-206)/52,2)),hairR=Math.exp(-Math.pow((x-391)/28,2)-Math.pow((y-206)/54,2));
 u+=1.7*Math.sin(p-.7)*hairL+1.8*Math.sin(p-.9)*hairR;
 v+=.8*Math.sin(2*p-.6)*(hairL+hairR);
 const sleeves=Math.exp(-Math.pow((y-414)/68,2))*(Math.exp(-Math.pow((x-200)/44,2))+Math.exp(-Math.pow((x-406)/43,2)));
 u+=1.4*Math.sin(p-.45)*sleeves;
 return [u,v];
}
async function main(){
 const normal=await sharp(path.join(root,'assets/neutral.png')).ensureAlpha().raw().toBuffer(),blink=await sharp(path.join(root,'assets/blink.png')).ensureAlpha().raw().toBuffer();
 let minJac=1,maxMotion=0;
 for(let n=0;n<N;n++){
  const t=n/FPS,closed=(t>=2.30&&t<2.43)||(t>=6.05&&t<6.18),src=closed?blink:normal,rgba=Buffer.alloc(W*H*4);
  // Precompute displacement on a 6px grid; bilinear interpolation avoids mesh seams.
  const step=6,gw=Math.ceil(W/step)+1,gh=Math.ceil(H/step)+1,grid=new Float32Array(gw*gh*2);
  for(let gy=0;gy<gh;gy++)for(let gx=0;gx<gw;gx++){let d=displacement(gx*step,gy*step,t),k=(gy*gw+gx)*2;grid[k]=d[0];grid[k+1]=d[1];maxMotion=Math.max(maxMotion,Math.hypot(...d));}
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   const gx=Math.floor(x/step),gy=Math.floor(y/step),fx=x/step-gx,fy=y/step-gy,k=(gy*gw+gx)*2;
   let d=[];for(let c=0;c<2;c++)d[c]=(grid[k+c]*(1-fx)+grid[k+2+c]*fx)*(1-fy)+(grid[k+gw*2+c]*(1-fx)+grid[k+gw*2+2+c]*fx)*fy;
   const xx=x-d[0],yy=y-d[1],ix=Math.floor(xx),iy=Math.floor(yy);if(ix<0||iy<0||ix>=W-1||iy>=H-1)continue;
   const ax=xx-ix,ay=yy-iy,j=(y*W+x)*4;
   let alpha=0,r=0,g=0,b=0;
   for(let oy=0;oy<2;oy++)for(let ox=0;ox<2;ox++){let q=((iy+oy)*W+ix+ox)*4,w=(ox?ax:1-ax)*(oy?ay:1-ay)*src[q+3]/255;alpha+=w;r+=src[q]*w;g+=src[q+1]*w;b+=src[q+2]*w;}
   if(alpha){rgba[j]=Math.round(r/alpha);rgba[j+1]=Math.round(g/alpha);rgba[j+2]=Math.round(b/alpha);rgba[j+3]=Math.round(alpha*255);}
  }
  await sharp(rgba,{raw:{width:W,height:H,channels:4}}).png().toFile(path.join(out,String(n).padStart(4,'0')+'.png'));
  if(n%120===0)console.log('Rendered '+n+'/'+N);
 }
 let loopError=0;for(let y=0;y<H;y+=10)for(let x=0;x<W;x+=10){let a=displacement(x,y,0),b=displacement(x,y,8);loopError=Math.max(loopError,Math.hypot(a[0]-b[0],a[1]-b[1]));}
 fs.writeFileSync(path.join(root,'validation.json'),JSON.stringify({frames:N,fps:FPS,duration:DURATION,canvas:[W,H],maximumDisplacementPixels:maxMotion,loopEndpointDisplacementError:loopError,method:'Continuous local image deformation, fixed feet, two blink pose swaps. Not a native Cubism rig.'},null,2));
 console.log('Finished');
}
main().catch(e=>{console.error(e);process.exit(1)});

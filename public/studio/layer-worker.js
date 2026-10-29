// U²-Net inference and background repair stay on the visitor's device.
import * as ort from './vendor/ort/ort.wasm.min.mjs';
ort.env.wasm.numThreads=1;
ort.env.wasm.wasmPaths=new URL('./vendor/ort/',import.meta.url).href;
let session,loadedModel;
const post=(phase,message,percent)=>self.postMessage({type:'progress',phase,message,percent});
const surface=(w,h)=>new OffscreenCanvas(w,h);
async function loadModel(kind){if(session&&loadedModel===kind)return;if(session)await session.release();session=null;let bytes;if(kind==='fine'){const manifest=await (await fetch(new URL('./models/silueta.json',import.meta.url))).json();const all=[];let total=0;for(const [i,name]of manifest.parts.entries()){const response=await fetch(new URL('./models/'+name,import.meta.url));if(!response.ok)throw Error('模型下载失败，请检查网络后重试。');const part=new Uint8Array(await response.arrayBuffer());all.push(part);total+=part.length;post('model','正在加载精细模型 '+Math.round(total/manifest.bytes*100)+'%…',10+i*6)}bytes=new Uint8Array(total);let offset=0;for(const part of all){bytes.set(part,offset);offset+=part.length}const digest=await crypto.subtle.digest('SHA-256',bytes),hash=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');if(hash!==manifest.sha256)throw Error('模型校验失败，请刷新后重试。')}else{bytes=new URL('./models/u2netp.onnx',import.meta.url).href}session=await ort.InferenceSession.create(bytes,{executionProviders:['wasm'],graphOptimizationLevel:'all'});loadedModel=kind;}
async function predictMask(source,w,h,region){const small=surface(320,320),ctx=small.getContext('2d');const [sx,sy,sw,sh]=region;ctx.drawImage(source,sx,sy,sw,sh,0,0,320,320);const rgba=ctx.getImageData(0,0,320,320).data,N=320*320,input=new Float32Array(N*3),mean=[.485,.456,.406],std=[.229,.224,.225];let max=0;for(let i=0;i<rgba.length;i++)if(i%4!==3)max=Math.max(max,rgba[i]);max=Math.max(1,max);for(let k=0;k<3;k++)for(let i=0;i<N;i++)input[k*N+i]=(rgba[i*4+k]/max-mean[k])/std[k];const result=await session.run({[session.inputNames[0]]:new ort.Tensor('float32',input,[1,3,320,320])}),values=result[session.outputNames[0]].data;let min=Infinity,hi=-Infinity;for(const v of values){min=Math.min(min,v);hi=Math.max(hi,v)}if(hi-min<.0001)throw Error('未检测到主体，请使用手动遮罩。');const image=ctx.createImageData(320,320);let sum=0,weightedY=0,middle=0;for(let i=0;i<N;i++){const n=Math.max(0,Math.min(1,((values[i]-min)/(hi-min)-.12)/.76)),a=n*n*(3-2*n);image.data[i*4]=image.data[i*4+1]=image.data[i*4+2]=255;image.data[i*4+3]=Math.round(a*255);sum+=a;weightedY+=a*Math.floor(i/320)/320;if(i/320>320*.2&&i/320<320*.78)middle+=a}ctx.putImageData(image,0,0);const mask=surface(w,h);mask.getContext('2d').drawImage(small,sx,sy,sw,sh);return {mask,centroid:weightedY/Math.max(sum,.0001),middle:middle/Math.max(sum,.0001)}}
function rgbaCanvas(bytes,w,h){const c=surface(w,h);c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(bytes),w,h),0,0);return c}
function dilate(a,w,h,r){const horizontal=new Uint8Array(a.length),result=new Uint8Array(a.length);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let v=0;for(let k=-r;k<=r;k++)v=Math.max(v,a[y*w+Math.max(0,Math.min(w-1,x+k))]);horizontal[y*w+x]=v}for(let y=0;y<h;y++)for(let x=0;x<w;x++){let v=0;for(let k=-r;k<=r;k++)v=Math.max(v,horizontal[Math.max(0,Math.min(h-1,y+k))*w+x]);result[y*w+x]=v}return result}
function repair(source,alpha,w,h){
 // Fill the hidden region from its nearest clean boundary, then solve a smooth
 // harmonic extension. This restores occlusion margins; it is not scene generation.
 const W=240,H=360,c=surface(W,H),ctx=c.getContext('2d');ctx.drawImage(source,0,0,W,H);const data=ctx.getImageData(0,0,W,H),p=data.data,m=surface(W,H),mc=m.getContext('2d');mc.drawImage(alpha,0,0,W,H);const ad=mc.getImageData(0,0,W,H).data,raw=new Uint8Array(W*H);for(let i=0;i<raw.length;i++)raw[i]=ad[i*4+3]>15?1:0;
 const holes=dilate(raw,W,H,5),seen=new Uint8Array(holes.length),queue=new Int32Array(holes.length);let head=0,tail=0;
 for(let i=0;i<holes.length;i++)if(!holes[i]){seen[i]=1;queue[tail++]=i}
 if(!tail)throw Error('主体占满画面，缺少可修补的背景。请换一张留有背景的图片。');
 while(head<tail){const i=queue[head++],x=i%W,y=(i/W)|0;for(const n of [x>0?i-1:-1,x<W-1?i+1:-1,y>0?i-W:-1,y<H-1?i+W:-1])if(n>=0&&!seen[n]){seen[n]=1;queue[tail++]=n;for(let k=0;k<3;k++)p[n*4+k]=p[i*4+k]}}
 for(let pass=0;pass<130;pass++)for(let yy=0;yy<H;yy++){const y=pass%2?H-1-yy:yy;for(let xx=0;xx<W;xx++){const x=pass%2?W-1-xx:xx,i=y*W+x;if(!holes[i])continue;const l=y*W+Math.max(0,x-1),r=y*W+Math.min(W-1,x+1),u=Math.max(0,y-1)*W+x,d=Math.min(H-1,y+1)*W+x;for(let k=0;k<3;k++)p[i*4+k]=(p[l*4+k]+p[r*4+k]+p[u*4+k]+p[d*4+k])/4}}
 ctx.putImageData(data,0,0);const fixed=surface(w,h),fc=fixed.getContext('2d');fc.drawImage(source,0,0);const patch=surface(w,h),pc=patch.getContext('2d');pc.drawImage(c,0,0,w,h);const hc=surface(W,H),hctx=hc.getContext('2d'),hd=hctx.createImageData(W,H);for(let i=0;i<holes.length;i++){hd.data[i*4]=hd.data[i*4+1]=hd.data[i*4+2]=255;hd.data[i*4+3]=holes[i]*255}hctx.putImageData(hd,0,0);pc.globalCompositeOperation='destination-in';pc.drawImage(hc,0,0,w,h);fc.drawImage(patch,0,0);return fixed;
}
async function derive(source,mask,w,h){
 const mc=mask.getContext('2d'),ad=mc.getImageData(0,0,w,h).data;let foreground=0,transparent=0;for(let i=3;i<ad.length;i+=4){if(ad[i]>127)foreground++;if(ad[i]<10)transparent++}const coverage=foreground/(w*h);if(coverage<.008||coverage>.94||transparent<1000)throw Error('没有找到清晰、独立的主体。请换图，或用遮罩画笔选择主体。');
 post('repair','正在移除主体并修补遮挡背景…',67);const background=repair(source,mask,w,h);
 const subject=surface(w,h),sc=subject.getContext('2d');sc.drawImage(source,0,0);sc.globalCompositeOperation='destination-in';sc.drawImage(mask,0,0);
 post('contours','正在提取同源轮廓与校验透明图层…',88);
 const lineart=surface(w,h),lc=lineart.getContext('2d'),s=subject.getContext('2d').getImageData(0,0,w,h).data,out=lc.createImageData(w,h),lum=new Float32Array(w*h);for(let i=0;i<lum.length;i++)lum[i]=s[i*4]*.2126+s[i*4+1]*.7152+s[i*4+2]*.0722;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,l=y*w+Math.max(0,x-1),r=y*w+Math.min(w-1,x+1),u=Math.max(0,y-1)*w+x,d=Math.min(h-1,y+1)*w+x;const gradient=Math.hypot(lum[r]-lum[l],lum[d]-lum[u]),edge=Math.hypot(s[r*4+3]-s[l*4+3],s[d*4+3]-s[u*4+3]);const v=255-Math.min(255,Math.max(gradient*2,edge));out.data[i*4]=out.data[i*4+1]=out.data[i*4+2]=v;out.data[i*4+3]=255}lc.putImageData(out,0,0);
 const blobs=await Promise.all([subject.convertToBlob({type:'image/png'}),background.convertToBlob({type:'image/jpeg',quality:.93}),lineart.convertToBlob({type:'image/png'})]);self.postMessage({type:'result',subject:blobs[0],background:blobs[1],lineart:blobs[2],coverage,method:'u2netp-boundary-repair'});
}
self.onmessage=async e=>{try{const {pixels,width:w,height:h,maskPixels,quality='fine'}=e.data,source=rgbaCanvas(pixels,w,h);let mask;
 if(maskPixels){mask=rgbaCanvas(maskPixels,w,h)}else{
 post('model',quality==='fine'?'正在加载精细 AI 模型，首次约需下载 56 MB…':'正在加载轻量 AI 模型，首次约需下载 16 MB…',10);
 await loadModel(quality);
 post('segment','AI 正在识别并分离主体…',35);let found=await predictMask(source,w,h,[0,0,w,h]);if(found.centroid>.77||found.centroid<.16||found.middle<.22){post('segment','正在避开海报标题，重新识别中央主体…',49);found=await predictMask(source,w,h,[w*.04,h*.18,w*.92,h*.61])}mask=found.mask;
 }await derive(source,mask,w,h);
 }catch(err){self.postMessage({type:'error',message:err.message||'自动分层失败，请重试或手动选择主体。'})}};

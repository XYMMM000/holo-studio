import {mkdir,copyFile,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const out=new URL('../public/studio/',import.meta.url);
await mkdir(new URL('vendor/ort/',out),{recursive:true});await mkdir(new URL('models/',out),{recursive:true});
for(const name of ['ort.wasm.min.mjs','ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm'])await copyFile(new URL('../node_modules/onnxruntime-web/dist/'+name,import.meta.url),new URL('vendor/ort/'+name,out));
const ortLicense=await fetch('https://raw.githubusercontent.com/microsoft/onnxruntime/v1.22.0/LICENSE');if(!ortLicense.ok)throw Error('ORT license unavailable');await writeFile(new URL('vendor/ort/LICENSE.txt',out),await ortLicense.text());
const target=new URL('models/u2netp.onnx',out),sha='309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8';
let data;try{data=await readFile(target)}catch{}
if(!data||createHash('sha256').update(data).digest('hex')!==sha){const r=await fetch('https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx');if(!r.ok)throw Error('Model download failed: '+r.status);data=Buffer.from(await r.arrayBuffer());if(createHash('sha256').update(data).digest('hex')!==sha)throw Error('Model checksum mismatch');await writeFile(target,data)}
const r=await fetch('https://raw.githubusercontent.com/xuebinqin/U-2-Net/master/LICENSE');if(!r.ok)throw Error('License unavailable');await writeFile(new URL('models/U2NET-LICENSE.txt',out),await r.text());
let fine;try{const parts=await Promise.all([0,1,2].map(i=>readFile(new URL('models/silueta-'+i+'.bin',out))));fine=Buffer.concat(parts)}catch{}
if(!fine||createHash('md5').update(fine).digest('hex')!=='55e59e0d8062d2f5d013f4725ee84782'){const response=await fetch('https://github.com/danielgatis/rembg/releases/download/v0.0.0/silueta.onnx');if(!response.ok)throw Error('Fine model download failed');fine=Buffer.from(await response.arrayBuffer());if(createHash('md5').update(fine).digest('hex')!=='55e59e0d8062d2f5d013f4725ee84782')throw Error('Fine model checksum mismatch');for(let i=0;i<3;i++)await writeFile(new URL('models/silueta-'+i+'.bin',out),fine.subarray(i*16*1024*1024,Math.min(fine.length,(i+1)*16*1024*1024)))}
await writeFile(new URL('models/silueta.json',out),JSON.stringify({parts:[0,1,2].map(i=>'silueta-'+i+'.bin'),bytes:fine.length,sha256:createHash('sha256').update(fine).digest('hex')}));
await writeFile(new URL('models/NOTICE.txt',out),'U²-Net: Going Deeper with Nested U-Structure for Salient Object Detection. Xuebin Qin et al., 2020. https://github.com/xuebinqin/U-2-Net\nWeights: u2netp.onnx and silueta.onnx from https://github.com/danielgatis/rembg/releases/tag/v0.0.0\nu2netp SHA-256 '+sha+'\nsilueta SHA-256 '+createHash('sha256').update(fine).digest('hex')+'\nONNX Runtime Web 1.22.0: Microsoft, MIT License.\n');
console.log('Verified local segmentation model and runtime assets.');

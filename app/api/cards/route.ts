import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
export const dynamic='force-dynamic';
const fail=(error:string,status=400)=>Response.json({error},{status});
export async function POST(req:Request){
 const origin=req.headers.get('origin');if(!origin||origin!==new URL(req.url).origin)return fail('请从制作台发布作品。',403);
 const user=await getChatGPTUser();if(!user)return fail('登录后即可生成分享链接，草稿已保存在本机。',401);
 const bucket=env.BUCKET;if(!bucket)return fail('分享存储暂不可用，请先导出工程文件。',503);
 if(Number(req.headers.get('content-length'))>10000000)return fail('作品超过10MB，请缩小图片后重试。',413);
 try{
  const reader=req.body?.getReader();if(!reader)return fail('没有收到作品。');let total=0;const chunks:Uint8Array[]=[];
  while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>10000000){await reader.cancel();return fail('作品超过10MB。',413)}chunks.push(value)}
  const bytes=new Uint8Array(total);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}
  const doc=JSON.parse(new TextDecoder().decode(bytes));
  if(doc?.format!=='holo-studio'||doc.version!==1||!doc.assets?.source||typeof doc.settings!=='object')return fail('作品格式不正确。');
  const keys=['source','background','subject','effects','lineart'];const assets:Record<string,string>={};
  for(const key of keys){const v=doc.assets[key];if(!v)continue;if(typeof v!=='string'||v.length>6500000||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v))return fail('图片格式不正确，仅支持PNG、JPG和WebP。');assets[key]=v}
  const settings:Record<string,number|string|boolean>={};
  const ranges:Record<string,[number,number]>={foil:[0,1],depth:[0,1],bgDepth:[-1,0],fxDepth:[0,1],scale:[.8,1.5],exposure:[.5,1.6],sparkle:[0,1],roundness:[0,1],border:[0,1],tilt:[0,1]};
  for(const [k,[min,max]]of Object.entries(ranges)){const v=doc.settings[k];if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)return fail('调节参数无效。');settings[k]=v}
  if(!['holo','silver','gold','original'].includes(doc.settings.finish))return fail('材质无效。');settings.finish=doc.settings.finish;settings.auto=!!doc.settings.auto;settings.titleOn=!!doc.settings.titleOn;
  const id=crypto.randomUUID().replaceAll('-','');const card={format:'holo-studio',version:1,title:String(doc.title??'未命名闪卡').slice(0,60),subtitle:String(doc.subtitle??'').slice(0,100),demoText:!!doc.demoText,settings,assets,createdAt:new Date().toISOString()};
  await bucket.put('cards/'+id+'.json',JSON.stringify(card),{httpMetadata:{contentType:'application/json; charset=utf-8'},customMetadata:{owner:user.userId}});
  return Response.json({id,path:'/c/'+id},{status:201,headers:{'Cache-Control':'no-store'}})
 }catch{return fail('发布失败，请检查图片并重试。',500)}
}

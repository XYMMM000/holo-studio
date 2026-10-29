import {env} from 'cloudflare:workers';
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!/^[a-f0-9]{32}$/.test(id))return Response.json({error:'作品不存在。'},{status:404});
 if(!env.BUCKET)return Response.json({error:'分享存储暂不可用。'},{status:503});
 const o=await env.BUCKET.get('cards/'+id+'.json');if(!o)return Response.json({error:'没有找到这张闪卡。'},{status:404});
 return new Response(o.body,{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'}})
}

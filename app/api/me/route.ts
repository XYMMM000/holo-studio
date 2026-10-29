import {getChatGPTUser} from '../../chatgpt-auth';
export const dynamic='force-dynamic';
export async function GET(){const u=await getChatGPTUser();return Response.json({signedIn:!!u,name:u?.displayName??null},{headers:{'Cache-Control':'no-store'}})}

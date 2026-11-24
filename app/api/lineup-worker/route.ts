import { NextResponse } from "next/server";
import { runLineupWorker } from "../../../lib/football-jobs";
import { BsdApiCircuitOpenError } from "../../../lib/bsd-circuit-breaker";
export const runtime="nodejs";export const dynamic="force-dynamic";export const revalidate=0;
function authorized(r:Request){const allowed=[process.env.CRON_SECRET,process.env.SUPABASE_CRON_SECRET].filter(Boolean),h=r.headers.get("authorization")??"",t=h.startsWith("Bearer ")?h.slice(7):"";return allowed.length>0&&allowed.includes(t);}
export async function GET(request:Request){if(!authorized(request))return NextResponse.json({ok:false,error:"Unauthorized"},{status:401});try{return NextResponse.json(await runLineupWorker(),{headers:{"Cache-Control":"no-store, max-age=0"}});}catch(error){if(error instanceof BsdApiCircuitOpenError)return NextResponse.json({ok:true,skipped:true,reason:"bsd_rate_limited",retry_at:error.retryAt,provider_code:error.providerCode},{headers:{"Cache-Control":"no-store, max-age=0"}});console.error("runLineupWorker failed:",error);return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Worker failed."},{status:500});}}

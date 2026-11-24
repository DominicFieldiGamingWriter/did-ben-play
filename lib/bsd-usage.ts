import { after } from "next/server";
import { AsyncLocalStorage } from "node:async_hooks";
type Context={job_type:string;fixture_id?:number|null};const ctx=new AsyncLocalStorage<Context>();
export function withBsdUsageContext<T>(v:Context,work:()=>Promise<T>):Promise<T>{return ctx.run(v,work);}
type ApiRecord={requested_at:string;endpoint:string;http_status:number|null;latency_ms:number;outcome:"success"|"http_error"|"network_error";provider_code:string|null;rate_limit_limit:number|null;rate_limit_remaining:number|null;rate_limit_reset_at:string|null};
type RunRecord={started_at:string;finished_at:string;result:"success"|"skipped_rate_limited"|"error";duration_ms:number;provider_code:string|null};
function enrich(r:any){const c=ctx.getStore();return {...r,site:"ben",job_type:c?.job_type??"full_refresh",fixture_id:c?.fixture_id??null};}
async function send(kind:"api_request"|"refresh_run",record:any){const secret=process.env.BSD_USAGE_INGEST_SECRET;if(!secret)throw new Error("BSD_USAGE_INGEST_SECRET is not configured.");const response=await fetch("https://www.didhamzaplay.com/api/admin/bsd-usage-ingest",{method:"POST",headers:{Authorization:`Bearer ${secret}`,"Content-Type":"application/json"},body:JSON.stringify({kind,record}),cache:"no-store"});if(!response.ok)throw new Error(`Usage ingestion returned HTTP ${response.status}.`);}
export async function trackBsdApiRequest(r:ApiRecord){try{await send("api_request",enrich(r));}catch(e){console.error("BSD_USAGE_WRITE_FAILED",e);}}
export function trackBsdRefreshRun(r:RunRecord){try{after(async()=>{try{await send("refresh_run",enrich(r));}catch(e){console.error("BSD_USAGE_WRITE_FAILED",e);}});}catch(e){console.error("BSD_USAGE_SCHEDULING_FAILED",e);}}

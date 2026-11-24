import { revalidatePath, revalidateTag } from "next/cache";
import { getSupabaseAdmin } from "./supabase";
import { getEvent, getFixtureIncidents, getFixturePlayerStats, getLineups, getUpcomingFixturesForTeam } from "./bsd";
import { buildLivePlayerStatus, normaliseIncidents, refreshPlayerPage } from "./refresh";
import { resolveTeamSheetStatus } from "./status";
import { trackBsdRefreshRun, withBsdUsageContext } from "./bsd-usage";
const PAGE_TAG = "ben-player-page";
const IDLE_REFRESH_MS = 6*60*60*1000, DISCOVERY_MS = 3*60*60*1000, LIVE_MS = 5*60*1000, STATS_MS = 15*60*1000, POST_START_MS = 105*60*1000, POST_RETRY_MS = 10*60*1000;
const obj=(v:any):any=>v&&typeof v==="object"&&!Array.isArray(v)?v:{};
const idOf=(v:any):number=>{const n=Number(v?.id??v?.event_id);return Number.isSafeInteger(n)&&n>0?n:0;};
const kickoffOf=(v:any):string|null=>{const d=v?.time?.kickoff_at??v?.time?.start_time??v?.kickoff_at??v?.kickoff??v?.event_date??v?.date??v?.start_time;return typeof d==="string"&&Number.isFinite(Date.parse(d))?d:null;};
const statusOf=(v:any):string=>String(v?.status??v?.time?.status??v?.event_status??"").toLowerCase().replace(/[^a-z0-9]/g,"");
function isFinal(v:any,id:number):boolean{const h=Number(v?.home_score??v?.score?.home??v?.scores?.home??v?.home_team_score),a=Number(v?.away_score??v?.score?.away??v?.scores?.away??v?.away_team_score);return idOf(v)===id&&["finished","complete","completed","fulltime","afterextratime","afterpenalties"].includes(statusOf(v))&&Number.isFinite(h)&&h>=0&&Number.isFinite(a)&&a>=0;}
function isLive(v:any):boolean{return ["live","inprogress","inplay","1sthalf","halftime","2ndhalf","extratime","penaltyshootout","overtime"].includes(statusOf(v));}
function isDefinitive(v:any,id:number):boolean{return Number(v?.lineup_fixture_id)===id&&["confirmed_start","confirmed_bench","confirmed_not_in_squad"].includes(String(v?.status??v?.type??""));}
async function claim(k:string,s:number):Promise<boolean>{const {data,error}=await getSupabaseAdmin().rpc("claim_bsd_worker_lock",{p_job_key:k,p_lease_seconds:s});if(error)throw new Error("Worker lock claim failed: "+error.message);return data===true;}
async function release(k:string,f:string|null=null){const {error}=await getSupabaseAdmin().from("bsd_worker_locks").update({lease_until:new Date(0).toISOString(),last_completed_at:new Date().toISOString(),last_error:f,updated_at:new Date().toISOString()}).eq("job_key",k);if(error)console.error("BSD_WORKER_LOCK_RELEASE_FAILED",k,error.message);}
async function readPage(){const {data,error}=await getSupabaseAdmin().from("player_page").select("id,player_id,player_name,team_id,team_name,live_fixture,last_fixture,next_fixtures,player_status,updated_at,last_full_refresh_at,last_fixture_discovery_at").eq("id",1).maybeSingle();if(error)throw error;if(!data)throw new Error("Player page row is missing.");return data;}
async function savePage(s:any,p:Record<string,any>){const {data,error}=await getSupabaseAdmin().from("player_page").update({...p,updated_at:new Date().toISOString()}).eq("id",1).eq("updated_at",s.updated_at).select("id").maybeSingle();if(error)throw error;return Boolean(data);}
async function refreshView(){revalidateTag(PAGE_TAG,{expire:0});revalidatePath("/");}
function due(v:any,ms:number){const t=typeof v==="string"?Date.parse(v):NaN;return !Number.isFinite(t)||Date.now()-t>=ms;}
async function discoverFixtures(s:any){
 const teamId=Number(s.team_id);if(!Number.isSafeInteger(teamId)||teamId<=0)return {action:"missing_team_id"};
 const national=obj(obj(s.player_status).national_team_reference),nationalId=Number(national.id);
 const req=[withBsdUsageContext({job_type:"fixture_discovery"},()=>getUpcomingFixturesForTeam(teamId))];
 if(Number.isSafeInteger(nationalId)&&nationalId>0&&nationalId!==teamId)req.push(withBsdUsageContext({job_type:"fixture_discovery"},()=>getUpcomingFixturesForTeam(nationalId)));
 const [club,country=[]]=await Promise.all(req),now=Date.now();
 const fresh=[...club.map((f:any)=>({...f,tracked_team_id:teamId,tracked_team_name:s.team_name,tracked_team_type:"club",fixture_source:"bsd"})),...country.map((f:any)=>({...f,tracked_team_id:nationalId,tracked_team_name:national.name??"",tracked_team_type:"national",fixture_source:"bsd"}))].filter((f:any)=>idOf(f)&&kickoffOf(f)&&Date.parse(kickoffOf(f)!)>now);
 const m=new Map<number,any>();
 for(const f of Array.isArray(s.next_fixtures)?s.next_fixtures:[]){const id=idOf(f),d=kickoffOf(f);if(id&&d&&Date.parse(d)>now)m.set(id,f);}
 for(const f of fresh)m.set(idOf(f),{...(m.get(idOf(f))??{}),...f});
 const next=[...m.values()].sort((a,b)=>Date.parse(kickoffOf(a)!)-Date.parse(kickoffOf(b)!)).slice(0,12);
 const saved=await savePage(s,{next_fixtures:next,last_fixture_discovery_at:new Date().toISOString()});if(saved)await refreshView();return {action:saved?"fixtures_discovered":"write_conflict",fixture_count:next.length};
}
async function updateLive(s:any,f:any,id:number,kickoff:string,known?:any){
 if(!due(f?.targeted_checked_at,LIVE_MS-5000))return {action:"live_not_due"};
 const event=known??await withBsdUsageContext({job_type:"live_match_status",fixture_id:id},()=>getEvent(id));if(!event)throw new Error("BSD did not return tracked match.");
 const now=Date.now(),checked=new Date(now).toISOString(),pageStatus=obj(s.player_status),monitor=obj(pageStatus.post_match_refresh);
 if(isFinal(event,id)&&now<Date.parse(kickoff)+POST_START_MS){
  const updated={...f,...event,id,date:kickoff,targeted_checked_at:checked};
  const mon={...monitor,active:true,completed:false,fixture_id:id,kickoff_at:kickoff,fixture:updated,started_at:monitor.started_at??checked,next_check_at:new Date(Date.parse(kickoff)+POST_START_MS).toISOString()};
  const saved=await savePage(s,{live_fixture:updated,player_status:{...pageStatus,post_match_refresh:mon}});if(saved)await refreshView();return {action:saved?"full_time_waiting_for_post_match_window":"write_conflict"};
 }
 const statsDue=due(f?.player_stats_checked_at,STATS_MS);
 const [raw,stats]=await Promise.all([withBsdUsageContext({job_type:"live_match_incidents",fixture_id:id},()=>getFixtureIncidents(id)),statsDue?withBsdUsageContext({job_type:"live_player_stats",fixture_id:id},()=>getFixturePlayerStats(id)):Promise.resolve(f?.player_stats??[])]);
 const incidents=await withBsdUsageContext({job_type:"live_match_incidents",fixture_id:id},()=>normaliseIncidents(raw)),playerStats=Array.isArray(stats)?stats:[];
 const base={...f,...event,id,date:kickoff,incidents,player_stats:playerStats,targeted_checked_at:checked,player_stats_checked_at:statsDue?checked:f?.player_stats_checked_at??null};
 const liveStatus=await withBsdUsageContext({job_type:"live_player_status",fixture_id:id},()=>buildLivePlayerStatus(Number(s.player_id),String(s.player_name??""),base,{incidents:raw,playerStats}));
 const updated={...base,player_status:liveStatus},mon={...monitor,active:true,completed:false,fixture_id:id,kickoff_at:kickoff,fixture:updated,started_at:monitor.started_at??checked,last_checked_at:checked,next_check_at:new Date(Date.parse(kickoff)+POST_START_MS).toISOString()};
 const saved=await savePage(s,{live_fixture:updated,player_status:{...pageStatus,post_match_refresh:mon}});if(saved)await refreshView();return {action:saved?"live_updated":"write_conflict",fixture_id:id};
}
async function postMatchCheck(s:any,f:any,id:number,kickoff:string,known?:any){
 const pageStatus=obj(s.player_status),monitor=obj(pageStatus.post_match_refresh);if(Date.now()<Date.parse(kickoff)+POST_START_MS)return {action:"post_match_not_due"};if(!due(monitor.last_checked_at,POST_RETRY_MS-5000))return {action:"post_match_retry_not_due"};
 const event=known??await withBsdUsageContext({job_type:"post_match_status",fixture_id:id},()=>getEvent(id));if(!event)throw new Error("BSD did not return tracked post-match event.");
 const checked=new Date().toISOString();
 if(!isFinal(event,id)){
  const mon={...monitor,active:true,completed:false,fixture_id:id,kickoff_at:kickoff,fixture:{...f,...event},started_at:monitor.started_at??checked,last_checked_at:checked,attempts:Number(monitor.attempts??0)+1,last_error:null};
  const saved=await savePage(s,{live_fixture:{...f,...event,targeted_checked_at:checked},player_status:{...pageStatus,post_match_refresh:mon}});if(saved)await refreshView();return {action:saved?"waiting_for_final_status":"write_conflict",fixture_id:id};
 }
 const started=Date.now();
 try{
  await withBsdUsageContext({job_type:"post_match_reconciliation",fixture_id:id},()=>refreshPlayerPage());
  const fresh=await readPage();if(idOf(fresh.last_fixture)!==id||!isFinal(fresh.last_fixture,id))throw new Error("Full reconciliation did not confirm this fixture as latest finished match.");
  const ps=obj(fresh.player_status),pm=obj(ps.post_match_refresh),done=new Date().toISOString();
  const saved=await savePage(fresh,{player_status:{...ps,post_match_refresh:{...pm,active:false,completed:true,fixture_id:id,kickoff_at:kickoff,completed_at:done,last_checked_at:done,fixture:null,last_error:null}}});
  if(!saved)throw new Error("Concurrent update prevented post-match completion marker.");
  trackBsdRefreshRun({started_at:new Date(started).toISOString(),finished_at:done,duration_ms:Date.now()-started,result:"success",provider_code:null});await refreshView();return {action:"post_match_reconciled",fixture_id:id};
 }catch(error){
  const latest=await readPage().catch(()=>s),ls=obj(latest.player_status),lm=obj(ls.post_match_refresh),msg=error instanceof Error?error.message.slice(0,300):"Post-match reconciliation failed.";
  await savePage(latest,{player_status:{...ls,post_match_refresh:{...lm,active:true,completed:false,fixture_id:id,kickoff_at:kickoff,fixture:f,last_checked_at:new Date().toISOString(),last_error:msg}}});
  trackBsdRefreshRun({started_at:new Date(started).toISOString(),finished_at:new Date().toISOString(),duration_ms:Date.now()-started,result:"error",provider_code:null});throw error;
 }
}
export async function runFootballScheduler(){
 const key="main-scheduler";if(!(await claim(key,270)))return {ok:true,skipped:true,reason:"already_running"};let failure:string|null=null;
 try{
  const s=await readPage(),now=Date.now(),monitor=obj(obj(s.player_status).post_match_refresh),live=s.live_fixture;
  const tracked=live&&idOf(live)?live:(idOf(monitor.fixture)===Number(monitor.fixture_id)?monitor.fixture:null),id=idOf(tracked),kickoff=kickoffOf(tracked);
  if(id&&kickoff){if(now>=Date.parse(kickoff)+POST_START_MS)return {ok:true,...(await postMatchCheck(s,tracked,id,kickoff))};if(live&&idOf(live)===id)return {ok:true,...(await updateLive(s,live,id,kickoff))};}
  if(!live){
   const started=(Array.isArray(s.next_fixtures)?s.next_fixtures:[]).filter((f:any)=>f?.fixture_source!=="fotmob"&&idOf(f)&&kickoffOf(f)).filter((f:any)=>Date.parse(kickoffOf(f)!)<=now&&Date.parse(kickoffOf(f)!)>=now-6*60*60*1000).sort((a:any,b:any)=>Date.parse(kickoffOf(b)!)-Date.parse(kickoffOf(a)!));
   const candidate=started[0];
   if(candidate){
    const cid=idOf(candidate),ck=kickoffOf(candidate)!,event=await withBsdUsageContext({job_type:"live_fixture_detection",fixture_id:cid},()=>getEvent(cid));
    if(event&&isFinal(event,cid)&&now>=Date.parse(ck)+POST_START_MS)return {ok:true,...(await postMatchCheck(s,candidate,cid,ck,event))};
    if(event&&(isLive(event)||isFinal(event,cid)))return {ok:true,...(await updateLive(s,candidate,cid,ck,event))};
   }
  }
  if(due(s.last_fixture_discovery_at,DISCOVERY_MS))return {ok:true,...(await discoverFixtures(s))};
  if(due(s.last_full_refresh_at,IDLE_REFRESH_MS)){
   const lineupWindow=(Array.isArray(s.next_fixtures)?s.next_fixtures:[]).some((f:any)=>{const d=kickoffOf(f);if(!d||f?.fixture_source==="fotmob")return false;const mins=(Date.parse(d)-now)/60000;return mins<=65&&mins>=-120;});
   if(!lineupWindow){const start=Date.now();await withBsdUsageContext({job_type:"idle_full_refresh"},()=>refreshPlayerPage());trackBsdRefreshRun({started_at:new Date(start).toISOString(),finished_at:new Date().toISOString(),duration_ms:Date.now()-start,result:"success",provider_code:null});await refreshView();return {ok:true,action:"idle_full_refresh"};}
  }
  return {ok:true,action:"nothing_due"};
 }catch(error){failure=error instanceof Error?error.message.slice(0,300):"Scheduler failed.";throw error;}finally{await release(key,failure);}
}
export async function runLineupWorker(){
 const s=await readPage(),fs=(Array.isArray(s.next_fixtures)?s.next_fixtures:[]).filter((f:any)=>f&&f.fixture_source!=="fotmob"&&idOf(f)>0&&kickoffOf(f)).sort((a:any,b:any)=>Date.parse(kickoffOf(a)!)-Date.parse(kickoffOf(b)!)),f=fs[0];
 if(!f)return {ok:true,action:"no_bsd_fixture"};
 const id=idOf(f),kickoff=kickoffOf(f)!,mins=(Date.parse(kickoff)-Date.now())/60000;if(mins>65||mins< -120)return {ok:true,action:"outside_lineup_window"};
 const ps=obj(s.player_status),existing=obj(ps.next_match);if(isDefinitive(existing,id))return {ok:true,action:"already_confirmed",status:existing.status};if(!due(existing.lineup_checked_at,115000))return {ok:true,action:"lineup_check_not_due"};
 const key="lineup-"+id;if(!(await claim(key,100)))return {ok:true,skipped:true,reason:"already_running"};let failure:string|null=null;
 try{
  let decision:any;try{const data=await withBsdUsageContext({job_type:"lineup",fixture_id:id},()=>getLineups(id));decision=resolveTeamSheetStatus(Number(s.player_id),data);}
  catch(error){failure=error instanceof Error?error.message.slice(0,300):"Lineup request failed.";decision=resolveTeamSheetStatus(Number(s.player_id),null);decision.reason="The official lineup feed could not be reached. The scheduled checker will retry.";}
  const checked=new Date().toISOString(),result={...decision,lineup_fixture_id:id,lineup_checked_at:checked,fixture_kickoff:kickoff},saved=await savePage(s,{player_status:{...ps,next_match:result}});
  if(saved)await refreshView();return {ok:true,action:saved?"lineup_checked":"write_conflict",fixture_id:id,status:result.status};
 }finally{await release(key,failure);}
}

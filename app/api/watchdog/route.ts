import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("player_page")
      .select("player_name, team_name, updated_at, last_fixture, live_fixture, next_fixtures, player_status")
      .eq("id", 1)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return Response.json({ ok: false, error: "Player page row is missing." }, { status: 503 });
    }

    const status = data.player_status ?? {};
    const latest = data.last_fixture ?? null;
    const next = Array.isArray(data.next_fixtures) ? data.next_fixtures.slice(0, 5) : [];

    return Response.json({
      ok: true,
      sport: "football",
      player: data.player_name,
      trackedTeam: data.team_name,
      dataUpdatedAt: data.updated_at,
      latestMatch: latest,
      liveMatch: data.live_fixture ?? null,
      nextFixtures: next,
      appearance: status.latest_match?.appearance ?? status.appearance ?? latest?.player_status?.appearance ?? null,
      latestPlayerStatus: status.latest_match ?? null,
      nextMatchStatus: status.next_match ?? null
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }, { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}

import Image from "next/image";
import type { Metadata } from "next";

export const revalidate = 60;

export const metadata: Metadata = {
  alternates: {
    canonical: "/"
  },
  title: "Did Ben Brereton Díaz Play?",
  description:
    "Did Ben Brereton Díaz play in his last match for club or country? Find out whether Big Ben started, was on the bench, scored or assisted in his latest game.",
  openGraph: {
    title: "Did Ben Brereton Díaz Play?",
    description:
      "Did Ben Brereton Díaz play in his last match for club or country? Find out whether Big Ben started, was on the bench, scored or assisted in his latest game.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Did Ben Brereton Díaz Play?",
    description:
      "Did Ben Brereton Díaz play in his last match for club or country? Find out whether Big Ben started, was on the bench, scored or assisted in his latest game.",
  },
};
import { unstable_cache } from "next/cache";
import { getSupabaseAdmin } from "../lib/supabase";


const getCachedPlayerPage = unstable_cache(
  async () => {
    const { data, error } =
      await getSupabaseAdmin()
        .from("player_page")
        .select("*")
        .eq("id", 1)
        .maybeSingle();

    if (error) {
      throw error;
    }

    return data;
  },
  ["ben-player-page"],
  {
    revalidate: 60,
    tags: ["ben-player-page"]
  }
);

function dateValue(value: any): string | null {
  if (!value) return null;

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object") {
    return (
      value?.kickoff_at ??
      value?.kickoff ??
      value?.event_date ??
      value?.date ??
      value?.start_time ??
      value?.time?.kickoff_at ??
      null
    );
  }

  return null;
}

function rawTeamValue(
  fixture: any,
  side: "home" | "away"
) {
  return (
    fixture?.[side] ??
    fixture?.[`${side}_team`] ??
    fixture?.[`${side}Team`] ??
    fixture?.teams?.[side] ??
    fixture?.participants?.[side] ??
    null
  );
}

function teamName(
  fixture: any,
  side: "home" | "away"
): string {
  const team =
    rawTeamValue(
      fixture,
      side
    );

  const candidates = [
    team?.name,
    team?.team_name,
    team?.team?.name,
    fixture?.[`${side}_team_name`],
    fixture?.[`${side}_name`]
  ];

  for (const value of candidates) {
    if (
      typeof value === "string" &&
      value.trim()
    ) {
      return value.trim();
    }
  }

  return "Unknown";
}

function fixtureName(
  fixture: any
): string {
  return (
    `${teamName(
      fixture,
      "home"
    )} vs ${teamName(
      fixture,
      "away"
    )}`
  );
}

function scoreValue(
  fixture: any,
  side: "home" | "away"
) {
  return (
    fixture?.[`${side}_score`] ??
    fixture?.score?.[side] ??
    fixture?.scores?.[side] ??
    null
  );
}

function formatDate(
  value: any
): string {
  const date =
    dateValue(value);

  if (!date) return "";

  const parsed =
    new Date(date);

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    return "";
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone:
        "Europe/London"
    }
  ).format(parsed);
}

function formatUKTime(
  value: any
): string {
  const date =
    dateValue(value);

  if (!date) return "";

  const parsed =
    new Date(date);

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    return "";
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone:
        "Europe/London"
    }
  ).format(parsed);
}

function formatChileTime(
  value: any
): string {
  const date =
    dateValue(value);

  if (!date) return "";

  const parsed =
    new Date(date);

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    return "";
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone:
        "America/Santiago"
    }
  ).format(parsed);
}

function fixtureTimes(
  fixture: any,
  className = "times"
) {
  const date =
    dateValue(fixture);

  if (!date) return null;

  return (
    <div className={className}>
      <span>
        {formatUKTime(
          fixture
        )}{" "}
        (UK Time)
      </span>

      <span>
        {formatChileTime(
          fixture
        )}{" "}
        (Chile)
      </span>
    </div>
  );
}

function fixtureTimestamp(
  fixture: any
): number {
  const date =
    dateValue(fixture);

  if (!date) return 0;

  const timestamp =
    new Date(date).getTime();

  return Number.isNaN(
    timestamp
  )
    ? 0
    : timestamp;
}

function isFreshLiveFixture(
  fixture: any
): boolean {
  const timestamp =
    fixtureTimestamp(
      fixture
    );

  if (!timestamp) {
    return false;
  }

  const now =
    Date.now();

  const status =
    String(
      fixture?.status ??
        fixture?.time?.status ??
        ""
    )
      .trim()
      .toLowerCase()
      .replace(
        /[^a-z0-9]+/g,
        ""
      );

  const liveStatuses = new Set([
    "live",
    "inprogress",
    "inplay",
    "1sthalf",
    "halftime",
    "2ndhalf",
    "extratime",
    "penaltyshootout",
    "overtime"
  ]);

  if (
    !liveStatuses.has(
      status
    )
  ) {
    return false;
  }

  const maxAgeMs =
    6 * 60 * 60 * 1000;

  const maxFutureMs =
    2 * 60 * 60 * 1000;

  return (
    timestamp >=
      now - maxAgeMs &&
    timestamp <=
      now + maxFutureMs
  );
}

function sortUpcomingFixtures(
  fixtures: any[]
) {
  return [...fixtures]
    .filter(
      (fixture) =>
        fixtureTimestamp(
          fixture
        ) > 0
    )
    .sort(
      (a, b) =>
        fixtureTimestamp(a) -
        fixtureTimestamp(b)
    );
}

function getAppearance(
  fixture: any,
  status: any
) {
  return (
    fixture?.player_status
      ?.appearance ??
    status?.appearance ??
    null
  );
}

function surname(
  name: any
): string {
  if (
    typeof name !== "string" ||
    !name.trim()
  ) {
    return "Unknown";
  }

  const parts =
    name.trim().split(
      /\s+/
    );

  return (
    parts[
      parts.length - 1
    ]
  );
}

function formatMinute(
  minute: any
): string {
  const value =
    Number(minute);

  return Number.isFinite(
    value
  )
    ? `${value}'`
    : "";
}

function getIncidents(
  fixture: any
): any[] {
  return Array.isArray(
    fixture?.incidents
  )
    ? fixture.incidents
    : [];
}

function isOwnGoal(
  goal: any
): boolean {
  if (goal?.is_own_goal === true) {
    return true;
  }

  const values = [
    goal?.goal_type,
    goal?.goalType,
    goal?.goal?.type,
    goal?.goal?.goal_type,
    goal?.subtype,
    goal?.type_name
  ];

  return values.some(
    (value: any) =>
      String(
        value ??
        ""
      )
        .trim()
        .toLowerCase()
        .replace(
          /[-_ ]/g,
          ""
        )
        .includes("owngoal")
  );
}

function cleanScorerName(
  name: any
): string {
  if (
    typeof name !== "string" ||
    !name.trim()
  ) {
    return "Unknown";
  }

  const cleaned =
    name
      .replace(
        /\(\s*og\s*\)/gi,
        ""
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim();

  return surname(
    cleaned
  );
}

function formatGoal(
  goal: any
): string {
  const scorer =
    cleanScorerName(
      goal?.player_name
    );

  const og =
    isOwnGoal(goal)
      ? " (OG)"
      : "";

  return `${scorer}${og} ${formatMinute(
    goal?.minute
  )}`;
}

function getMatchEvents(
  fixture: any
) {
  const incidents =
    getIncidents(
      fixture
    );

  const goals =
    incidents
      .filter(
        (incident) =>
          incident?.type ===
          "goal"
      )
      .sort(
        (a, b) =>
          Number(
            a?.minute ??
            9999
          ) -
          Number(
            b?.minute ??
            9999
          )
      );

  const assists =
    goals.filter(
      (goal) =>
        goal?.assist_name
    );

  const cards =
    incidents.filter(
      (incident) =>
        incident?.type ===
        "card"
    );

  const redCards =
    cards
      .filter(
        (card) => {
          const type =
            String(
              card?.card_type ??
              ""
            ).toLowerCase();

          return (
            type.includes(
              "red"
            ) ||
            type.includes(
              "second"
            )
          );
        }
      )
      .sort(
        (a, b) =>
          Number(
            a?.minute ??
            9999
          ) -
          Number(
            b?.minute ??
            9999
          )
      );

  return {
    goals,
    assists,
    redCards
  };
}

function normaliseToken(value: any): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function numericPrice(value: any): number | null {
  const number = Number(value);

  return Number.isFinite(number) && number > 0
    ? number
    : null;
}

function formatOddsPrice(value: any): string {
  const price = numericPrice(value);

  return price !== null
    ? price.toFixed(2)
    : "—";
}

function priceFromNode(node: any): number | null {
  if (!node || typeof node !== "object") {
    return null;
  }

  const candidates = [
    node.price,
    node.decimal_odds,
    node.odds,
    node.value,
    node.current_price,
    node.current_odds
  ];

  for (const candidate of candidates) {
    const price = numericPrice(candidate);

    if (price !== null) {
      return price;
    }
  }

  return null;
}

function marketIs1X2(market: any): boolean {
  const values = [
    market?.market,
    market?.market_kind,
    market?.market_family,
    market?.market_name,
    market?.name,
    market?.kind,
    market?.type
  ].map(normaliseToken);

  return values.some(
    (value) =>
      value === "1x2" ||
      value === "winner" ||
      value === "matchwinner"
  );
}

function consensusBookmaker(
  payload: any,
  nestedBookmakers?: any[]
) {
  const books = Array.isArray(
    nestedBookmakers
  )
    ? nestedBookmakers
    : Array.isArray(payload?.bookmakers)
      ? payload.bookmakers
      : [];

  return (
    books.find(
      (bookmaker: any) =>
        normaliseToken(
          bookmaker?.bookmaker_slug ??
          bookmaker?.slug ??
          bookmaker?.bookmaker ??
          bookmaker?.name
        ) === "consensus"
    ) ?? null
  );
}

function oddsFromSelectionRows(
  rows: any[]
) {
  const result = {
    home: null as number | null,
    draw: null as number | null,
    away: null as number | null
  };

  for (const row of rows) {
    const outcome =
      normaliseToken(
        row?.outcome ??
        row?.selection ??
        row?.label ??
        row?.name
      );

    const price =
      priceFromNode(row) ??
      numericPrice(row?.decimal_odds);

    if (outcome === "home" || outcome === "1") {
      result.home ??= price;
    }

    if (outcome === "draw" || outcome === "x") {
      result.draw ??= price;
    }

    if (outcome === "away" || outcome === "2") {
      result.away ??= price;
    }
  }

  return result;
}

function getConsensus1X2(
  payload: any
) {
  const summary = payload?.odds;

  const summaryResult = {
    home: numericPrice(
      summary?.home_win ??
      summary?.match_winner?.home
    ),
    draw: numericPrice(
      summary?.draw ??
      summary?.match_winner?.draw
    ),
    away: numericPrice(
      summary?.away_win ??
      summary?.match_winner?.away
    )
  };

  if (
    summaryResult.home !== null ||
    summaryResult.draw !== null ||
    summaryResult.away !== null
  ) {
    return summaryResult;
  }

  const rootBookmaker =
    consensusBookmaker(payload);

  if (rootBookmaker) {
    const rootResult = {
      home:
        numericPrice(
          rootBookmaker?.odds_home ??
          rootBookmaker?.home ??
          rootBookmaker?.odds_1
        ),
      draw:
        numericPrice(
          rootBookmaker?.odds_draw ??
          rootBookmaker?.draw ??
          rootBookmaker?.odds_x
        ),
      away:
        numericPrice(
          rootBookmaker?.odds_away ??
          rootBookmaker?.away ??
          rootBookmaker?.odds_2
        )
    };

    if (
      rootResult.home !== null ||
      rootResult.draw !== null ||
      rootResult.away !== null
    ) {
      return rootResult;
    }
  }

  const directRows = Array.isArray(
    payload?.results
  )
    ? payload.results.filter(
        (row: any) =>
          normaliseToken(
            row?.bookmaker_slug ??
            row?.bookmaker
          ) === "consensus" &&
          normaliseToken(
            row?.market
          ) === "1x2"
      )
    : [];

  const fromRows =
    oddsFromSelectionRows(
      directRows
    );

  if (
    fromRows.home !== null ||
    fromRows.draw !== null ||
    fromRows.away !== null
  ) {
    return fromRows;
  }

  const markets =
    Array.isArray(payload?.markets)
      ? payload.markets
      : [];

  for (const market of markets) {
    if (
      !marketIs1X2(market)
    ) {
      continue;
    }

    const book =
      consensusBookmaker(
        payload,
        market?.bookmakers
      );

    if (!book) {
      continue;
    }

    const direct = {
      home:
        numericPrice(
          book?.odds_home ??
          book?.home ??
          book?.odds_1
        ),
      draw:
        numericPrice(
          book?.odds_draw ??
          book?.draw ??
          book?.odds_x
        ),
      away:
        numericPrice(
          book?.odds_away ??
          book?.away ??
          book?.odds_2
        )
    };

    const prices =
      book?.prices;

    if (
      prices &&
      typeof prices === "object"
    ) {
      direct.home ??=
        priceFromNode(
          prices.HOME ??
          prices.home ??
          prices["1"]
        );

      direct.draw ??=
        priceFromNode(
          prices.DRAW ??
          prices.draw ??
          prices["X"] ??
          prices["x"]
        );

      direct.away ??=
        priceFromNode(
          prices.AWAY ??
          prices.away ??
          prices["2"]
        );
    }

    if (
      direct.home !== null ||
      direct.draw !== null ||
      direct.away !== null
    ) {
      return direct;
    }

    const fromSelections =
      oddsFromSelectionRows(
        Array.isArray(
          book?.selections
        )
          ? book.selections
          : []
      );

    if (
      fromSelections.home !== null ||
      fromSelections.draw !== null ||
      fromSelections.away !== null
    ) {
      return fromSelections;
    }
  }

  return {
    home: null,
    draw: null,
    away: null
  };
}

function hasComplete1X2(
  odds: any
): boolean {
  return (
    numericPrice(odds?.home) !== null &&
    numericPrice(odds?.draw) !== null &&
    numericPrice(odds?.away) !== null
  );
}

function isChileFixture(fixture: any): boolean {
  const type = String(
    fixture?.tracked_team_type ??
      fixture?.team_type ??
      fixture?.fixture_type ??
      ""
  ).toLowerCase();

  if (type === "national") {
    return true;
  }

  const trackedName = String(
    fixture?.tracked_team_name ??
      fixture?.team_name ??
      ""
  ).toLowerCase();

  if (trackedName.includes("chile")) {
    return true;
  }

  const homeName = String(
    fixture?.home_name ??
      fixture?.home_team_name ??
      fixture?.home?.name ??
      ""
  ).toLowerCase();

  const awayName = String(
    fixture?.away_name ??
      fixture?.away_team_name ??
      fixture?.away?.name ??
      ""
  ).toLowerCase();

  return homeName === "chile" || awayName === "chile";
}

async function getConsensusMatchOdds(
  fixture: any
) {
  const fixtureId =
    Number(fixture?.id);

  const apiKey =
    process.env.BSD_API_KEY;

  if (
    !Number.isFinite(fixtureId) ||
    fixtureId <= 0 ||
    !apiKey
  ) {
    return null;
  }

  try {
    const headers = {
      Authorization: `Token ${apiKey}`
    };

    const summaryResponse =
      await fetch(
        `https://sports.bzzoiro.com/api/v2/events/${fixtureId}/odds/`,
        {
          headers,
          cache: "force-cache",
          next: {
            revalidate: 60,
            tags: [`odds-${fixtureId}`]
          }
        }
      );

    if (!summaryResponse.ok) {
      console.error(
        "Consensus odds summary request failed:",
        summaryResponse.status
      );
      return null;
    }

    const summaryPayload =
      await summaryResponse.json();

    return {
      fixtureId,
      oneXTwo:
        getConsensus1X2(
          summaryPayload
        ),
      updatedAt:
        summaryPayload?.last_update_at ??
        summaryPayload?.updated_at ??
        null
    };
  } catch (error) {
    console.error(
      "Consensus odds request failed:",
      error
    );

    return null;
  }
}

function appearanceSummary(
  appearance: any,
  latestStatus: any
): string {
  if (
    !latestStatus?.played
  ) {
    if (
      appearance?.summary ===
      "Not in the squad."
    ) {
      return "Not in the squad.";
    }

    if (
      appearance?.subbed_on_minute !==
        null &&
      appearance?.subbed_on_minute !==
        undefined
    ) {
      return "Didn't start. Sub in.";
    }

    return "Didn't start. Didn't come on.";
  }

  const started =
    appearance?.started ===
    true;

  const subbedOn =
    appearance
      ?.subbed_on_minute ??
    null;

  const subbedOff =
    appearance
      ?.subbed_off_minute ??
    null;

  const minutes =
    appearance?.minutes ??
    null;

  if (
    started &&
    subbedOff !== null
  ) {
    return (
      `Started. Sub out. Played ${
        minutes ??
        subbedOff
      } mins.`
    );
  }

  if (started) {
    return (
      minutes !== null
        ? `Started. Played ${minutes} mins.`
        : "Started. Played."
    );
  }

  if (
    subbedOn !== null
  ) {
    return (
      minutes !== null
        ? `Didn't start. Sub in. Played ${minutes} mins.`
        : "Didn't start. Sub in."
    );
  }

  return "Played.";
}

export default async function Home() {
  let data: any = null;

  try {
    data = await getCachedPlayerPage();
  } catch (error) {
    console.error(
      "Player page data lookup failed:",
      error
    );
  }

  if (!data) {
    return (
      <main className="page">
        <h1 className="main-heading">
          DID{" "}
          <span className="ben-name">
            BEN
          </span>{" "}
          PLAY?
        </h1>

        <div className="error-card">
          Data unavailable.
        </div>
      </main>
    );
  }

  const storedLiveFixture =
    data.live_fixture ??
    null;

  const liveFixture =
    isFreshLiveFixture(
      storedLiveFixture
    )
      ? storedLiveFixture
      : null;

  const lastFixture =
    data.last_fixture ??
    null;

  const storedFixtures =
    Array.isArray(
      data.next_fixtures
    )
      ? data.next_fixtures
      : [];

  const nextFixtures =
    sortUpcomingFixtures(
      storedFixtures
    );

  const next =
    nextFixtures[0] ??
    null;

  const upcomingFixtures =
    next
      ? nextFixtures.slice(
          1,
          4
        )
      : nextFixtures.slice(
          0,
          3
        );

  const latestStatus =
    lastFixture?.player_status ??
    data.player_status
      ?.latest_match ??
    null;

  const nextStatus =
    data.player_status
      ?.next_match ??
    null;

  const latestPlayed =
    latestStatus?.played ===
    true;

  const appearance =
    getAppearance(
      lastFixture,
      latestStatus
    );

  const events =
    getMatchEvents(
      lastFixture
    );

  const benPlayerId =
    Number(
      data.player_id
    );

  const benScored =
    events.goals.some(
      (goal: any) =>
        Number(
          goal?.player_id
        ) === benPlayerId &&
        !isOwnGoal(goal)
    );

  const benAssisted =
    events.assists.some(
      (goal: any) =>
        Number(
          goal?.assist_id
        ) === benPlayerId
    );

  const latestDate =
    dateValue(
      lastFixture
    );

  const latestHomeScore =
    scoreValue(
      lastFixture,
      "home"
    );

  const latestAwayScore =
    scoreValue(
      lastFixture,
      "away"
    );

  const nextDate =
    dateValue(next);

  const nextChileFixture =
    nextFixtures.find(
      (fixture: any) =>
        isChileFixture(fixture)
    ) ?? null;

  const firstUpcomingFixture =
    upcomingFixtures[0] ??
    null;

  const [nextOdds, firstUpcomingOdds, chileOdds] =
    await Promise.all([
      next
        ? getConsensusMatchOdds(next)
        : Promise.resolve(null),
      firstUpcomingFixture
        ? getConsensusMatchOdds(firstUpcomingFixture)
        : Promise.resolve(null),
      nextChileFixture
        ? getConsensusMatchOdds(nextChileFixture)
        : Promise.resolve(null)
    ]);

  const appearanceSummaryText =
    appearanceSummary(
      appearance,
      latestStatus
    );

  const liveStatus =
    liveFixture
      ?.player_status
      ?.status ??
    null;

  const liveAnswer =
    liveStatus ===
    "playing"
      ? "YES"
      : liveStatus ===
          "substitute" ||
        liveStatus ===
          "not_playing"
      ? "NO"
      : "—";

  const liveAnswerClass =
    liveStatus ===
      "playing"
      ? "answer yes live-answer"
      : liveStatus ===
          "substitute" ||
        liveStatus ===
          "not_playing"
      ? "answer no live-answer"
      : "answer live-answer";

  const liveDate =
    dateValue(
      liveFixture
    );

  const liveHomeScore =
    scoreValue(
      liveFixture,
      "home"
    );

  const liveAwayScore =
    scoreValue(
      liveFixture,
      "away"
    );

  return (
    <>
      

      <main className="page">
        <div className="top-row">
          <h1 className="main-heading">
            DID{" "}
            <span className="ben-name">
              BEN
            </span>{" "}
            PLAY?
          </h1>

          <div className="top-image-wrap">
            <Image
              className="top-image"
              src={
                latestPlayed
                  ? "/ben-happy.png"
                  : "/ben-serious.png"
              }
              alt={
                latestPlayed
                  ? "Happy Ben Brereton Díaz"
                  : "Serious Ben Brereton Díaz"
              }
              width={108}
              height={108}
              sizes="(max-width: 500px) 86px, (max-width: 820px) 76px, 108px"
              preload
            />
          </div>

          <div
            className={
              latestPlayed
                ? "answer yes"
                : "answer no"
            }
          >
            {latestPlayed
              ? "YES"
              : "NO"}
          </div>
        </div>

        <section className="section-card">
          <div className="recent-grid">
            <div>
              <div className="section-label">
                MOST RECENT MATCH
              </div>

              <h2 className="match-title">
                {fixtureName(
                  lastFixture
                )}
              </h2>

              {latestDate && (
                <>
                  <div className="match-date">
                    {formatDate(
                      latestDate
                    )}
                  </div>

                  {fixtureTimes(
                    lastFixture
                  )}
                </>
              )}

              <div className="result-panel">
                <div className="score">
                  {latestHomeScore ??
                    "—"}
                  –
                  {latestAwayScore ??
                    "—"}
                </div>

                <div className="event-list">
                  <div className="event-line">
                    <div className="event-label">
                      GOALSCORERS
                    </div>

                    <div className="event-value">
                      {events.goals.length ===
                      0
                        ? "None"
                        : events.goals
                            .map(
                              (
                                goal: any
                              ) =>
                                formatGoal(goal)
                            )
                            .join(
                              " · "
                            )}
                    </div>
                  </div>

                  <div className="event-line">
                    <div className="event-label">
                      ASSISTS
                    </div>

                    <div className="event-value">
                      {events.assists.length ===
                      0
                        ? "None"
                        : events.assists
                            .map(
                              (
                                goal: any
                              ) =>
                                `${surname(goal.assist_name)} ${formatMinute(goal.minute)}`
                            )
                            .join(
                              " · "
                            )}
                    </div>
                  </div>

                  <div className="event-line">
                    <div className="event-label">
                      RED CARDS
                    </div>

                    <div className="event-value">
                      {events.redCards.length ===
                      0
                        ? "None"
                        : events.redCards
                            .map(
                              (
                                card: any
                              ) =>
                                `${surname(card.player_name)} ${formatMinute(card.minute)}`
                            )
                            .join(
                              " · "
                            )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="details-panel">
              <div className="section-label">
                DETAILS
              </div>

              <div className="details-main">
                {appearanceSummaryText}
              </div>

              <div className="details-supporting">
                Appearance details, including
                starting status and substitutions.
              </div>

              <div className="detail-stats">
                <div className="detail-stat">
                  <div className="detail-stat-label">
                    Minutes
                  </div>

                  <div className="detail-stat-value">
                    {appearance?.minutes ??
                      "—"}
                  </div>
                </div>

                <div className="detail-stat">
                  <div className="detail-stat-label">
                    Started
                  </div>

                  <div
                    className={
                      appearance?.started === true
                        ? "detail-stat-value yes"
                        : "detail-stat-value no"
                    }
                  >
                    {appearance?.started ===
                    true
                      ? "Yes"
                      : "No"}
                  </div>
                </div>

                <div className="detail-stat">
                  <div className="detail-stat-label">
                    Bench
                  </div>

                  <div
                    className={
                      appearance?.bench === true
                        ? "detail-stat-value yes"
                        : "detail-stat-value no"
                    }
                  >
                    {appearance?.bench ===
                    true
                      ? "Yes"
                      : "No"}
                  </div>
                </div>

                <div className="detail-stat">
                  <div className="detail-stat-label">
                    Sub in
                  </div>

                  <div className="detail-stat-value">
                    {appearance
                      ?.subbed_on_minute !==
                      null &&
                    appearance
                      ?.subbed_on_minute !==
                      undefined
                      ? `${appearance.subbed_on_minute}'`
                      : "—"}
                  </div>
                </div>

                <div className="detail-stat">
                  <div className="detail-stat-label">
                    Sub out
                  </div>

                  <div className="detail-stat-value">
                    {appearance
                      ?.subbed_off_minute !==
                      null &&
                    appearance
                      ?.subbed_off_minute !==
                      undefined
                      ? `${appearance.subbed_off_minute}'`
                      : "—"}
                  </div>
                </div>
              </div>

              <div className="ben-outcomes">
                <div className="ben-outcome">
                  <div className="ben-outcome-label">
                    Did Ben score?
                  </div>

                  <div className="ben-outcome-value">
                    {benScored ? "Yes" : "No"}
                  </div>
                </div>

                <div className="ben-outcome">
                  <div className="ben-outcome-label">
                    Did Ben assist?
                  </div>

                  <div className="ben-outcome-value">
                    {benAssisted ? "Yes" : "No"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {liveFixture && (
          <section className="live-section">
            <div className="live-heading-row">
              <h2 className="live-heading">
                CURRENTLY PLAYING
              </h2>

              {liveAnswer && (
                <div
                  className={
                    liveAnswerClass
                  }
                >
                  {liveAnswer}
                </div>
              )}
            </div>

            <div className="live-card">
              <div className="live-card-inner">
                <div>
                  <div className="section-label">
                    LIVE MATCH
                  </div>

                  <h3 className="live-title">
                    {fixtureName(
                      liveFixture
                    )}
                  </h3>

                  {liveDate && (
                    <>
                      <div className="live-date">
                        {formatDate(
                          liveDate
                        )}
                      </div>

                      {fixtureTimes(
                        liveFixture,
                        "live-times"
                      )}
                    </>
                  )}

                  <div className="live-status">
                    LIVE
                  </div>
                </div>

                <div className="live-score">
                  {liveHomeScore ??
                    "—"}
                  –
                  {liveAwayScore ??
                    "—"}
                </div>
              </div>
            </div>
          </section>
        )}

        <h2 className="next-heading">
          WILL BEN PLAY NEXT?
        </h2>

        <section className="next-card">
          <h3 className="next-title">
            {next
              ? fixtureName(next)
              : "No upcoming fixture"}
          </h3>

          {nextDate && (
            <>
              <div className="match-date">
                {formatDate(
                  nextDate
                )}
              </div>

              {fixtureTimes(next)}
            </>
          )}

          <div className="availability">
            <div>
              <div className="section-label">
                {nextStatus?.phase ===
                "team_news"
                  ? "TEAM NEWS"
                  : "AVAILABILITY"}
              </div>

              <div
                className={`availability-status ${nextStatus?.tone ?? "positive"}`}
              >
                {nextStatus?.label ??
                  "Likely available"}
              </div>

              <div className="availability-reason">
                {nextStatus?.reason ??
                  "No current injury, doubt or suspension is listed."}
              </div>
            </div>

            <div
              className={`status-pill ${nextStatus?.tone ?? "positive"}`}
            >
              {nextStatus?.label ??
                "LIKELY AVAILABLE"}
            </div>
          </div>
        </section>

        <section className="fixtures-card">
          <div className="section-label">
            UPCOMING FIXTURES
          </div>

          {upcomingFixtures.length ===
          0 ? (
            <div className="fixture-row">
              No upcoming fixtures found.
            </div>
          ) : (
            upcomingFixtures.map(
              (
                fixture: any,
                index: number
              ) => {
                const date =
                  dateValue(
                    fixture
                  );

                return (
                  <div
                    className="fixture-row"
                    key={
                      fixture?.id ??
                      `${fixtureTimestamp(fixture)}-${index}`
                    }
                  >
                    <div>
                      <div className="fixture-title">
                        {fixtureName(
                          fixture
                        )}
                      </div>

                      {index === 0 && (
                        <>
                          {hasComplete1X2(
                            firstUpcomingOdds?.oneXTwo
                          ) && (
                            <div className="fixture-odds">
                              (1){" "}{formatOddsPrice(
                                firstUpcomingOdds?.oneXTwo?.home
                              )}{" "}-{" "}(X){" "}{formatOddsPrice(
                                firstUpcomingOdds?.oneXTwo?.draw
                              )}{" "}-{" "}(2){" "}{formatOddsPrice(
                                firstUpcomingOdds?.oneXTwo?.away
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    <div className="fixture-date">
                      {date
                        ? formatDate(
                            date
                          )
                        : ""}
                    </div>

                    <div className="fixture-time">
                      {date
                        ? `${formatUKTime(fixture)} (UK Time)`
                        : ""}
                    </div>

                    <div className="fixture-time">
                      {date
                        ? `${formatChileTime(fixture)} (Chile)`
                        : ""}
                    </div>
                  </div>
                );
              }
            )
          )}
        </section>

        <section className="odds-card">
          <div className="odds-heading">MATCH ODDS</div>

          <div className="odds-grid">
            <div className="odds-mini-card">
              <h3 className="odds-mini-title">
                Next match odds
              </h3>
              <div className="odds-mini-subtitle">
                1X2
              </div>
              <div className="odds-mini-match">
                {next
                  ? fixtureName(next)
                  : "No upcoming fixture"}
              </div>

              {hasComplete1X2(
                nextOdds?.oneXTwo
              ) ? (
                <div className="odds-mini-row">
                  <div className="odds-prices">
                    <span>
                      (1) {formatOddsPrice(
                        nextOdds?.oneXTwo?.home
                      )}
                    </span>
                    <span>-</span>
                    <span>
                      (X) {formatOddsPrice(
                        nextOdds?.oneXTwo?.draw
                      )}
                    </span>
                    <span>-</span>
                    <span>
                      (2) {formatOddsPrice(
                        nextOdds?.oneXTwo?.away
                      )}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="odds-unavailable">
                  No odds yet
                </div>
              )}
            </div>

            <div className="odds-mini-card">
              <h3 className="odds-mini-title">
                Next Chile match odds
              </h3>
              <div className="odds-mini-subtitle">
                1X2
              </div>
              <div className="odds-mini-match">
                {nextChileFixture
                  ? fixtureName(
                      nextChileFixture
                    )
                  : "No upcoming Chile fixture"}
              </div>

              {hasComplete1X2(
                chileOdds?.oneXTwo
              ) ? (
                <div className="odds-mini-row">
                  <div className="odds-prices">
                    <span>
                      (1) {formatOddsPrice(
                        chileOdds?.oneXTwo?.home
                      )}
                    </span>
                    <span>-</span>
                    <span>
                      (X) {formatOddsPrice(
                        chileOdds?.oneXTwo?.draw
                      )}
                    </span>
                    <span>-</span>
                    <span>
                      (2) {formatOddsPrice(
                        chileOdds?.oneXTwo?.away
                      )}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="odds-unavailable">
                  No odds yet
                </div>
              )}
            </div>
          </div>

          <div className="odds-note">
            Decimal odds. Prices can change.
          </div>
        </section>

        <section className="bio-card">
          <h2 className="bio-heading">
            ABOUT BEN BRERETON DÍAZ
          </h2>

          <div className="bio-content">
            <Image
              className="bio-photo"
              src="/ben-bio.jpg"
              alt="Ben Brereton Díaz"
              width={170}
              height={170}
              sizes="(max-width: 500px) 130px, (max-width: 820px) 145px, 170px"
            />

            <p>
              Ben Brereton Díaz is a professional footballer. Born in Stoke, his father is an Englishman, but his mother is from Concepción in Chile.
            </p>

            <p>
              Originally in the Manchester United youth academy, Díaz later played junior football for Stoke, then Nottingham Forest. It was at the City Ground where he made his first-team debut, before transferring to Blackburn Rovers, where he scored 45 goals in 144 league games.
            </p>

            <p>
              An unsuccessful move to Villarreal followed, before Sheffield United gave Díaz an escape route on loan. He later moved to Southampton, after the Blades were relegated from the Premier League. But Díaz would soon play for them again, rejoining on loan in 2025.
            </p>

            <p>
              A season on loan at Derby County yielded seven league goals from 40 league appearances, before Díaz opted to join Sheffield United for a third loan spell in 2026.
            </p>

            <p>
              Born Benjamin Anthony Brereton, the talented attacker adopted his mother’s name in later life. He actually earned a combined 19 caps for the England Under-19 and Under-20 sides, before switching allegiance to La Roja in 2021.
            </p>

            <p>
              The inclusion of Díaz in the Chile national squad came about thanks to a group of <em>Football Manager</em> players. They noticed his dual nationality in the game and called for him to be selected. The social media campaign took off, and the rest is history.
            </p>
          </div>
        </section>

        <div className="updated">
          Data updated{" "}
          {data.updated_at
            ? `${new Intl.DateTimeFormat(
                "en-GB",
                {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone:
                    "America/Santiago"
                }
              ).format(
                new Date(
                  data.updated_at
                )
              )} (Chile Time)`
            : ""}
        </div>
      </main>
    </>
  );
}

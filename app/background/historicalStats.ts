import axiosInstance from "../lib/axiosInstance.js";
import { pool } from "../lib/pool.js";

type PlayerStatObj = {
  player_id: string;
  stats: { [cat: string]: number };
  player: { team: string; injury_status: string | null };
};

type ScheduleGame = {
  start_time: number;
  metadata: {
    away_team: string;
    home_team: string;
    time_remaining?: string;
    is_in_progress: boolean;
    quarter_num: number | "";
  };
};

const fetchWeekStats = async (
  season: number,
  week: number,
  season_type: string
) => {
  console.log(
    `Fetching stats for ${season} ${season_type} - season, week ${week}.`
  );
  const graphqlQuery = {
    query: `
        query batch_scores {
            scores(
              sport: "nfl"
              season_type: "${season_type}"
              season: "${season}"
                week: ${week}
            ) {
                game_id
                metadata 
                status
                start_time
            }
        }
    `,
  };
  const [schedule_week, projections_week, stats_week]: [
    { data: { data: { scores: ScheduleGame[] } } },
    { data: PlayerStatObj[] },
    { data: PlayerStatObj[] }
  ] = await Promise.all([
    axiosInstance.post("https://sleeper.com/graphql", graphqlQuery),
    axiosInstance.get(
      `https://api.sleeper.com/projections/nfl/${season}/${week}?season_type=${season_type}`
    ),
    axiosInstance.get(
      `https://api.sleeper.com/stats/nfl/${season}/${week}?season_type=${season_type}`,
      {
        params: {
          timestamp: new Date().getTime(),
        },
      }
    ),
  ]);

  const schedule_obj: {
    [team: string]: {
      kickoff: number;
      opp: string;
      home: boolean;
    };
  } = {};

  schedule_week.data.data.scores.forEach(
    (game: {
      start_time: number;
      metadata: {
        away_team: string;
        home_team: string;
      };
    }) => {
      schedule_obj[game.metadata.away_team] = {
        kickoff: game.start_time,
        opp: game.metadata.home_team,
        home: false,
      };

      schedule_obj[game.metadata.home_team] = {
        kickoff: game.start_time,
        opp: game.metadata.away_team,
        home: true,
      };
    }
  );

  const player_ids = Array.from(
    new Set([
      ...projections_week.data
        .filter((obj) => obj.stats.pts_ppr)
        .map((obj) => obj.player_id),
      ...stats_week.data.map((obj) => obj.player_id),
    ])
  );

  const weekStats: {
    player_id: string;
    season: number;
    week: number;
    season_type: string;
    stats: { [cat: string]: number };
    home: boolean;
    opp: string;
    kickoff: number;
  }[] = [];

  player_ids.forEach((player_id) => {
    const projObj = projections_week.data.find(
      (obj) => obj.player_id === player_id
    );
    const statObj = stats_week.data.find((obj) => obj.player_id === player_id);

    if (!projObj && !statObj) return;

    const team = statObj?.player?.team ?? projObj?.player.team;

    if (!team || !schedule_obj[team]) return;

    const { kickoff, opp, home } = schedule_obj[team];

    if (!kickoff || !opp) return;

    const stats = statObj?.stats ?? {};

    weekStats.push({
      player_id,
      season,
      week,
      season_type,
      stats,
      home,
      opp,
      kickoff,
    });
  });

  const upsertWeekStatsQuery = `
    INSERT INTO weekly_stats (
        player_id,
        season,
        week,
        season_type,
        home,
        opp,
        kickoff,
        stats
    )
    VALUES ${weekStats
      .map(
        (_, i) =>
          `($${i * 8 + 1}, $${i * 8 + 2}, $${i * 8 + 3}, $${i * 8 + 4}, $${
            i * 8 + 5
          }, $${i * 8 + 6}, $${i * 8 + 7}, $${i * 8 + 8})`
      )
      .join(", ")}
  `;

  const values = weekStats.flatMap((week_stat_obj) => {
    const { player_id, season, week, season_type, home, opp, kickoff, stats } =
      week_stat_obj;

    return [player_id, season, week, season_type, home, opp, kickoff, stats];
  });

  try {
    await pool.query(upsertWeekStatsQuery, values);
  } catch {
    console.log(
      `${season} ${season_type} - season, week ${week} already in DB`
    );
  }

  console.log(
    `Values inserted for ${season} ${season_type} - season, week ${week}.`
  );
};

const fetchHistoricalStats = async () => {
  for await (const season of [2024]) {
    const weeks = Array.from(Array(17).keys()).map((key) => key + 1);

    for await (const week of weeks) {
      await fetchWeekStats(season, week, "regular");
    }
  }
};

export default fetchHistoricalStats;

import { parentPort } from "worker_threads";
import { pool } from "../lib/pool.js";
import axiosInstance from "../lib/axiosInstance.js";
import { updateLeagues } from "../utils/updateLeagues.js";
const increment_leagues = 50;
const updateUsers = async (league_ids_queue, season) => {
    console.log({ league_ids_queue: league_ids_queue.length });
    if (league_ids_queue.length < increment_leagues) {
        console.log("Getting Users To Update...");
        const getUserIdsQuery = `
      SELECT user_id 
      FROM users 
      WHERE type IN ('S', 'LM')
      ORDER BY updated_at ASC 
      LIMIT 25;
    `;
        const users_to_update = await pool.query(getUserIdsQuery);
        const league_ids_to_add = league_ids_queue;
        const batchSize = 10;
        const users_updated = [];
        for (let i = 0; i < users_to_update.rows.length; i += batchSize) {
            const batch = users_to_update.rows.slice(i, i + batchSize);
            await Promise.all(batch.map(async (user) => {
                try {
                    const leagues = await axiosInstance.get(`https://api.sleeper.app/v1/user/${user.user_id}/leagues/nfl/${season}`);
                    const league_ids = leagues.data.map((league) => league.league_id);
                    const existingLeaguesQuery = `
            SELECT league_id
            FROM leagues
            WHERE league_id = ANY($1)
            ORDER BY updated_at ASC;
          `;
                    const existingLeague_ids = await pool.query(existingLeaguesQuery, [
                        league_ids,
                    ]);
                    const newLeague_ids = league_ids.filter((league_id) => !league_ids_to_add.includes(league_id) &&
                        !existingLeague_ids.rows
                            .map((r) => r.league_id)
                            .includes(league_id));
                    league_ids_to_add.push(...newLeague_ids);
                    users_updated.push(user.user_id);
                }
                catch { }
            }));
        }
        const upsertUsersQuery = `
      INSERT INTO users (user_id, username, type, created_at, updated_at) 
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id) DO UPDATE SET
        updated_at = EXCLUDED.updated_at;
    `;
        for (const user_id of users_updated) {
            try {
                await pool.query(upsertUsersQuery, [
                    user_id,
                    "",
                    "",
                    new Date(),
                    new Date(),
                ]);
            }
            catch (err) {
                if (err instanceof Error) {
                    console.log(err.message);
                }
                else {
                    console.log({ err });
                }
            }
        }
        return {
            league_ids_queue_updated: Array.from(new Set(league_ids_to_add)),
        };
    }
    else {
        return { league_ids_queue_updated: league_ids_queue };
    }
};
parentPort?.on("message", async (message) => {
    const { league_ids_queue } = message;
    const state = await (await axiosInstance.get("https://api.sleeper.app/v1/state/nfl")).data;
    const week = Math.max(Math.min(state.week, state.leg), 1);
    const result = await updateUsers(league_ids_queue, process.env.SEASON);
    let outOfDateLeagueIds;
    if (result.league_ids_queue_updated.length < increment_leagues) {
        const outOfDateLeaguesQuery = `
      SELECT league_id
      FROM leagues
      ORDER BY updated_at ASC
      LIMIT $1;
    `;
        const outOfDateLeagues = await pool.query(outOfDateLeaguesQuery, [
            increment_leagues - result.league_ids_queue_updated.length,
        ]);
        outOfDateLeagueIds = outOfDateLeagues.rows.map((l) => l.league_id);
        console.log({ outOfDateLeagueIds: outOfDateLeagueIds.length });
    }
    console.log({ result: result.league_ids_queue_updated.length });
    const updated_league_ids = (await updateLeagues([
        ...result.league_ids_queue_updated.slice(0, increment_leagues),
        ...(outOfDateLeagueIds || []),
    ], outOfDateLeagueIds || [], week.toString())).map((league) => league.league_id);
    console.log("POSTING MESSAGE");
    console.log({ updated: updated_league_ids.length });
    parentPort?.postMessage(result.league_ids_queue_updated.filter((l) => !updated_league_ids.includes(l)));
});

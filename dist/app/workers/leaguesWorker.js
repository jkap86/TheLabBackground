import { parentPort } from "worker_threads";
import { pool } from "../lib/pool.js";
import axiosInstance from "../lib/axiosInstance.js";
import { updateLeagues } from "../utils/updateLeagues.js";
const increment_leagues = 250;
const getUserIdsToUpdate = async () => {
    console.log("Getting User IDs To Update...");
    const getUserIdsQuery = `
      SELECT user_id 
      FROM users 
      WHERE type IN ('S', 'LM')
      ORDER BY updated_at ASC 
      LIMIT 25;
    `;
    const users_to_update = await pool.query(getUserIdsQuery);
    return users_to_update.rows.map((r) => r.user_id);
};
const upsertUserIds = async (user_ids_updated) => {
    const upsertUsersQuery = `
      INSERT INTO users (user_id, username, type, created_at, updated_at) 
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id) DO UPDATE SET
        updated_at = EXCLUDED.updated_at;
    `;
    for (const user_id of user_ids_updated) {
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
};
const updateUsers = async (league_ids_queue, season) => {
    console.log({ league_ids_queue: league_ids_queue.length });
    if (league_ids_queue.length < increment_leagues) {
        const user_ids_to_update = await getUserIdsToUpdate();
        const league_ids_to_add = league_ids_queue;
        const batchSize = 10;
        for (let i = 0; i < user_ids_to_update.length; i += batchSize) {
            const batch = user_ids_to_update.slice(i, i + batchSize);
            const user_ids_updated = [];
            await Promise.all(batch.map(async (user_id) => {
                try {
                    const leagues = await axiosInstance.get(`https://api.sleeper.app/v1/user/${user_id}/leagues/nfl/${season}`);
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
                    const newLeague_ids = league_ids.filter((league_id) => !existingLeague_ids.rows
                        .map((r) => r.league_id)
                        .includes(league_id));
                    league_ids_to_add.push(...newLeague_ids);
                    user_ids_updated.push(user_id);
                }
                catch { }
            }));
            await upsertUserIds(user_ids_updated);
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
    const updated_league_ids = await updateLeagues([
        ...result.league_ids_queue_updated.slice(0, increment_leagues),
        ...(outOfDateLeagueIds || []),
    ], outOfDateLeagueIds || [], week.toString());
    console.log({ updated: updated_league_ids.length });
    parentPort?.postMessage(result.league_ids_queue_updated.filter((l) => !updated_league_ids.includes(l)));
    parentPort?.close();
});

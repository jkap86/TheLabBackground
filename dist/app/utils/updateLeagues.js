import { pool } from "../lib/pool.js";
import axiosInstance from "../lib/axiosInstance.js";
export const updateLeagues = async (leagueIdsToUpdate, dbLeagueIds, week) => {
    const usersDb = [];
    const updatedLeagues = [];
    const tradesBatch = [];
    const batchSize = 10;
    for (let i = 0; i < leagueIdsToUpdate.length; i += batchSize) {
        await Promise.all(leagueIdsToUpdate
            .slice(i, i + batchSize)
            .map(async (leagueIdToUpdate) => {
            try {
                const league = await axiosInstance.get(`https://api.sleeper.app/v1/league/${leagueIdToUpdate}`);
                const rosters = await axiosInstance.get(`https://api.sleeper.app/v1/league/${leagueIdToUpdate}/rosters`);
                const users = await axiosInstance.get(`https://api.sleeper.app/v1/league/${leagueIdToUpdate}/users`);
                let leagueDraftPicksObj;
                let upcomingDraft;
                let startupCompletionTime;
                if (league.data.settings.type === 2) {
                    const drafts = await axiosInstance.get(`https://api.sleeper.app/v1/league/${leagueIdToUpdate}/drafts`);
                    const tradedPicks = await axiosInstance.get(`https://api.sleeper.app/v1/league/${leagueIdToUpdate}/traded_picks`);
                    upcomingDraft = drafts.data.find((x) => x.season === league.data.season &&
                        x.settings.rounds === league.data.settings.draft_rounds);
                    startupCompletionTime = league.data.previous_league_id
                        ? 1
                        : drafts.data.find((x) => x.status === "complete" &&
                            x.settings.rounds > league.data.settings.draft_rounds)?.last_picked || -1;
                    leagueDraftPicksObj = getLeagueDraftPicksObj(league.data, rosters.data, users.data, upcomingDraft?.status === "complete"
                        ? undefined
                        : upcomingDraft, tradedPicks.data);
                }
                else {
                    leagueDraftPicksObj = {};
                    startupCompletionTime = 1;
                }
                const rostersUserInfo = getRostersUserInfo(rosters.data, users.data, leagueDraftPicksObj);
                rostersUserInfo
                    .filter((ru) => ru.user_id)
                    .forEach((ru) => {
                    if (!usersDb.some((u) => u.user_id === ru.user_id)) {
                        usersDb.push({
                            user_id: ru.user_id,
                            username: ru.username,
                            avatar: ru.avatar,
                            type: "",
                            updated_at: new Date(),
                            created_at: new Date(),
                        });
                    }
                });
                if (week) {
                    const currentLeagueTrades = await getTrades(league.data, week, rostersUserInfo, upcomingDraft, startupCompletionTime);
                    tradesBatch.push(...currentLeagueTrades);
                }
                updatedLeagues.push({
                    league_id: leagueIdToUpdate,
                    name: league.data.name,
                    avatar: league.data.avatar,
                    season: league.data.season,
                    status: league.data.status,
                    settings: league.data.settings,
                    scoring_settings: league.data.scoring_settings,
                    roster_positions: league.data.roster_positions,
                    rosters: rostersUserInfo,
                    updated_at: new Date(),
                });
            }
            catch (err) {
                if (err instanceof Error) {
                    console.log(err.message + ": Error getting league info " + leagueIdToUpdate);
                    if (err.response?.status === 404) {
                        console.log(`Deleting League - ${leagueIdToUpdate}`);
                        await pool.query(`DELETE FROM leagues WHERE league_id = $1`, [
                            leagueIdToUpdate,
                        ]);
                    }
                }
                else {
                    console.log({ err });
                }
            }
        }));
    }
    try {
        try {
            await pool.query("BEGIN");
            await upsertUsers(usersDb);
            await upsertLeagues(updatedLeagues);
            await upsertTrades(tradesBatch);
            await pool.query("COMMIT");
        }
        catch (err) {
            await pool.query("ROLLBACK");
            console.error("Error upserting leagues:", err);
        }
    }
    catch (err) {
        console.error("Error connecting to the database:", err);
    }
    return updatedLeagues;
};
export const getLeagueDraftPicksObj = (league, rosters, users, upcomingDraft, tradedPicks) => {
    const draftSeason = upcomingDraft
        ? parseInt(league.season)
        : parseInt(league.season) + 1;
    const draft_order = upcomingDraft?.draft_order;
    const leagueDraftPicksObj = {};
    rosters.forEach((roster) => {
        const draftPicksTeam = [];
        const user = users.find((u) => u.user_id === roster.owner_id);
        // loop through seasons (draft season and next two seasons)
        for (let j = draftSeason; j <= draftSeason + 2; j++) {
            // loop through rookie draft rounds
            for (let k = 1; k <= league.settings.draft_rounds; k++) {
                // check if each rookie pick is in traded picks
                const isTraded = tradedPicks.find((pick) => parseInt(pick.season) === j &&
                    pick.round === k &&
                    pick.roster_id === roster.roster_id);
                // if it is not in traded picks, add to original manager
                if (!isTraded) {
                    draftPicksTeam.push({
                        season: j,
                        round: k,
                        roster_id: roster.roster_id,
                        original_user: {
                            avatar: user?.avatar || "",
                            user_id: roster.owner_id,
                            username: user?.display_name || "Orphan",
                        },
                        order: (draft_order &&
                            j === parseInt(upcomingDraft.season) &&
                            draft_order[roster?.owner_id]) ||
                            null,
                    });
                }
            }
        }
        tradedPicks
            .filter((x) => x.owner_id === roster.roster_id && parseInt(x.season) >= draftSeason)
            .forEach((pick) => {
            const original_roster = rosters.find((t) => t.roster_id === pick.roster_id);
            const original_user = users.find((u) => u.user_id === original_roster?.owner_id);
            if (original_roster) {
                draftPicksTeam.push({
                    season: parseInt(pick.season),
                    round: pick.round,
                    roster_id: pick.roster_id,
                    original_user: {
                        avatar: original_user?.avatar || "",
                        user_id: original_user?.user_id || "",
                        username: original_user?.display_name || "Orphan",
                    },
                    order: (original_user &&
                        draft_order &&
                        parseInt(pick.season) === parseInt(upcomingDraft.season) &&
                        draft_order[original_user?.user_id]) ||
                        null,
                });
            }
        });
        tradedPicks
            .filter((x) => x.previous_owner_id === roster.roster_id &&
            parseInt(x.season) >= draftSeason)
            .forEach((pick) => {
            const index = draftPicksTeam.findIndex((obj) => {
                return (obj.season === parseInt(pick.season) &&
                    obj.round === pick.round &&
                    obj.roster_id === pick.roster_id);
            });
            if (index !== -1) {
                leagueDraftPicksObj[roster.roster_id].splice(index, 1);
            }
        });
        leagueDraftPicksObj[roster.roster_id] = draftPicksTeam;
    });
    return leagueDraftPicksObj;
};
export const getRostersUserInfo = (rosters, users, league_draftpicks_obj) => {
    const rosters_username = rosters.map((roster) => {
        const user = users.find((user) => user.user_id === roster.owner_id);
        return {
            roster_id: roster.roster_id,
            username: user?.display_name || "Orphan",
            user_id: roster.owner_id,
            avatar: user?.avatar || null,
            players: roster.players,
            draftpicks: league_draftpicks_obj[roster.roster_id] || [],
            starters: roster.starters || [],
            starters_optimal_dynasty: [],
            starters_optimal_redraft: [],
            taxi: roster.taxi || [],
            reserve: roster.reserve || [],
            wins: roster.settings.wins,
            losses: roster.settings.losses,
            ties: roster.settings.ties,
            fp: parseFloat(`${roster.settings.fpts}.${roster.settings.fpts_decimal || 0}`),
            fpa: parseFloat(`${roster.settings.fpts_against || 0}.${roster.settings.fpts_against_decimal || 0}`),
        };
    });
    return rosters_username;
};
export const getTrades = async (league, week, rosters, upcomingDraft, startupCompletionTime) => {
    const tradesBatch = [];
    const transactions = await axiosInstance.get(`https://api.sleeper.app/v1/league/${league.league_id}/transactions/${week}`);
    tradesBatch.push(...transactions.data
        .filter((t) => t.type === "trade" &&
        t.status === "complete" &&
        startupCompletionTime &&
        t.status_updated > startupCompletionTime)
        .map((t) => {
        const adds = {};
        const drops = {};
        const draft_picks = t.draft_picks.map((dp) => {
            const original_user_id = rosters.find((ru) => ru.roster_id === dp.roster_id)?.user_id;
            const order = (upcomingDraft?.draft_order &&
                original_user_id &&
                parseInt(upcomingDraft.season) === parseInt(dp.season) &&
                upcomingDraft.draft_order[original_user_id]) ||
                null;
            return {
                round: dp.round,
                season: dp.season,
                new: rosters.find((ru) => ru.roster_id === dp.owner_id)?.user_id,
                old: rosters.find((ru) => ru.roster_id === dp.previous_owner_id)
                    ?.user_id,
                original: rosters.find((ru) => ru.roster_id === dp.roster_id)
                    ?.user_id,
                order: order,
            };
        });
        if (t.adds) {
            Object.keys(t.adds).forEach((add) => {
                const manager = rosters.find((ru) => ru.roster_id === t.adds[add]);
                adds[add] = manager?.user_id || "0";
            });
        }
        if (t.drops) {
            Object.keys(t.drops).forEach((drop) => {
                const manager = rosters.find((ru) => ru.roster_id === t.drops[drop]);
                drops[drop] = manager?.user_id || "0";
            });
        }
        const managers = Array.from(new Set([
            ...Object.values(adds || {}),
            ...Object.values(drops || {}),
            ...draft_picks.map((dp) => dp.new),
        ]));
        return {
            ...t,
            league_id: league.league_id,
            status_updated: new Date(t.status_updated),
            rosters,
            draft_picks,
            managers,
            adds,
            drops,
        };
    }));
    return tradesBatch;
};
export const upsertLeagues = async (updatedLeagues) => {
    const upsertLeaguesQuery = `
    INSERT INTO leagues (league_id, name, avatar, season, status, settings, scoring_settings, roster_positions, rosters, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (league_id) DO UPDATE SET
      name = EXCLUDED.name,
      avatar = EXCLUDED.avatar,
      season = EXCLUDED.season,
      status = EXCLUDED.status,
      settings = EXCLUDED.settings,
      scoring_settings = EXCLUDED.scoring_settings,
      roster_positions = EXCLUDED.roster_positions,
      rosters = EXCLUDED.rosters,
      updated_at = EXCLUDED.updated_at;
  `;
    for (const league of updatedLeagues) {
        try {
            await pool.query(upsertLeaguesQuery, [
                league.league_id,
                league.name,
                league.avatar,
                league.season,
                league.status,
                JSON.stringify(league.settings),
                JSON.stringify(league.scoring_settings),
                JSON.stringify(league.roster_positions),
                JSON.stringify(league.rosters),
                league.updated_at,
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
export const upsertTrades = async (trades) => {
    if (trades.length === 0)
        return;
    const upsertTradesQuery = `
    INSERT INTO trades (transaction_id, status_updated, adds, drops, draft_picks, price_check, rosters, managers, players, league_id)
     VALUES ${trades
        .map((_, i) => `($${i * 10 + 1}, $${i * 10 + 2}, $${i * 10 + 3}, $${i * 10 + 4}, $${i * 10 + 5}, $${i * 10 + 6}, $${i * 10 + 7}, $${i * 10 + 8}, $${i * 10 + 9}, $${i * 10 + 10})`)
        .join(", ")}
    ON CONFLICT (transaction_id) DO UPDATE SET
      draft_picks = EXCLUDED.draft_picks,
      price_check = EXCLUDED.price_check,
      players = EXCLUDED.players,
      managers = EXCLUDED.managers;
  `;
    const values = trades.flatMap((trade) => [
        trade.transaction_id,
        trade.status_updated,
        JSON.stringify(trade.adds),
        JSON.stringify(trade.drops),
        JSON.stringify(trade.draft_picks),
        trade.price_check,
        JSON.stringify(trade.rosters),
        trade.managers,
        trade.players,
        trade.league_id,
    ]);
    try {
        const upserted = await pool.query(upsertTradesQuery, values);
        console.log(`${upserted.rowCount} Trades modified`);
    }
    catch (err) {
        if (err instanceof Error) {
            console.log(err.message);
        }
        else {
            console.log({ err });
        }
    }
};
export const upsertUsers = async (users) => {
    const upsertUsersQuery = `
    INSERT INTO users (user_id, username, avatar, type, updated_at, created_at)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (user_id) DO UPDATE SET
      username = EXCLUDED.username,
      avatar = EXCLUDED.avatar,
      type = CASE
        WHEN users.type IN ('S', 'LM') THEN users.type
        ELSE EXCLUDED.type
      END,
      updated_at = EXCLUDED.updated_at;
  `;
    let modified = 0;
    for (const user of users) {
        try {
            const upserted = await pool.query(upsertUsersQuery, [
                user.user_id,
                user.username,
                user.avatar,
                user.type,
                user.updated_at,
                user.created_at,
            ]);
            modified += upserted.rowCount || 0;
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
    console.log(`Upserting ${modified} users...`);
};

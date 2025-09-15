import axiosInstance from "../lib/axiosInstance.js";
import * as cheerio from "cheerio";
import { pool } from "../lib/pool.js";
import { parentPort } from "worker_threads";
import fs from "fs";

type KtcPlayerDbUpdate = {
  player_id: string;
  date: string;
  value: number;
  overall_rank: number;
  position_rank: number;
};

type ktcPlayerObj = {
  playerID: number;
  playerName: string;
  slug: string;
  position: string;
  team: string;
  superflexValues: {
    tepp: { value: number; rank: number; positionalRank: number };
  };
};

type sleeperAllplayer = {
  player_id: string;
  position: string;
  team: string;
  full_name: string;
  first_name: string;
  last_name: string;
  age: string;
  fantasy_positions: string[];
  years_exp: number;
  active: boolean;
};

let syncComplete = false;

setTimeout(async () => {
  /*
  await updateCurrentValues("dynasty");

  setTimeout(async () => {
    await syncAlltimeValues("dynasty");
  }, 10000);
  */
  await updateKtcDynastyValues();

  if (!syncComplete) {
    setTimeout(async () => {
      await syncKtcDynastyValues();
    }, 10000);
  }
}, 5000);

const controlValue = new Date().getTime() - 12 * 60 * 60 * 1000;

const syncKtcDynastyValues = async () => {
  parentPort?.postMessage(true);

  const { ktc_map_dynasty } = await getKtcMapAndUnmatched();

  const linksToUpdate = Object.keys(ktc_map_dynasty).filter(
    (link) =>
      !(
        ktc_map_dynasty[link]?.sync &&
        ktc_map_dynasty[link]?.sync > controlValue
      )
  );

  console.log(`${linksToUpdate.length} Dynasty Players to update...`);

  const increment = 10;

  for await (let link of linksToUpdate.slice(0, increment)) {
    const sleeper_id = ktc_map_dynasty[link].sleeper_id;

    const syncPlayer = async () => {
      try {
        const player_historical_values: { [date: string]: KtcPlayerDbUpdate } =
          {};

        const response = await axiosInstance.get(
          `https://keeptradecut.com/dynasty-rankings/players/` + link
        );

        const html = response.data;
        const $ = cheerio.load(html);

        $("script").each((index, element) => {
          const content = $(element).html();

          const match = content?.match(
            /var playerSuperflex\s*=\s*(\{[\s\S]*?\});/
          );

          if (match && match[1]) {
            const playerObj = JSON.parse(match[1]);
            const position = playerObj.adjacentPositionalPlayers[0]?.position;
            const historicalValues =
              position === "TE"
                ? playerObj.tepp.history
                : playerObj.overallValue;

            historicalValues.forEach((obj: { d: string; v: number }) => {
              const overall_rank =
                playerObj.overallRankHistory.find(
                  (or: { d: string; v: number }) => or.d === obj.d
                )?.v ?? null;

              const position_rank =
                playerObj.positionalRankHistory.find(
                  (or: { d: string; v: number }) => or.d === obj.d
                )?.v ?? null;

              const date_string = `20${obj.d.slice(0, 2)}-${obj.d.slice(
                2,
                4
              )}-${obj.d.slice(4, 6)}`;

              const date = new Date(date_string).toISOString().split("T")[0];
              const value = obj.v;

              player_historical_values[date] = {
                player_id: sleeper_id,
                date,
                value,
                overall_rank,
                position_rank,
              };
            });

            ktc_map_dynasty[link].sync = new Date().getTime();
          }
        });

        await insertUpdatedValues(Object.values(player_historical_values));
        await insertIntoCommon("ktc_map_dynasty", ktc_map_dynasty, new Date());
      } catch (err: any) {
        if (err.response?.status === 404) delete ktc_map_dynasty[link];

        console.log(err.message, link);
      }
    };

    await syncPlayer();
  }

  console.log("sync batch inserted");

  if (Object.keys(ktc_map_dynasty).length === 0) {
    setTimeout(async () => {
      await updateKtcDynastyValues();

      setTimeout(async () => {
        await syncKtcDynastyValues();
      }, 15000);
    }, 15000);
  } else if (linksToUpdate.length > increment) {
    setTimeout(async () => {
      await syncKtcDynastyValues();
    }, 15000);
  } else {
    syncComplete = true;
    parentPort?.postMessage(false);

    parentPort?.close();
  }
};

const updateKtcDynastyValues = async () => {
  parentPort?.postMessage(true);

  const { ktc_map_dynasty, ktc_unmatched_dynasty } =
    await getKtcMapAndUnmatched();
  const { allplayers } = await queryAllPlayers();

  const url = `https://keeptradecut.com/dynasty-rankings?page=0&filters=QB|WR|RB|TE|RDP&format=2`;

  const response = await axiosInstance.get(url);

  const html = response.data;
  const $ = cheerio.load(html);

  const date = new Date().toISOString().split("T")[0];

  const currentValues: KtcPlayerDbUpdate[] = [];

  $("script").each((index, element) => {
    const content = $(element).html();

    const match = content?.match(/var playersArray\s*=\s*(\[[\s\S]*?\]);/);

    if (match && match[1]) {
      const playersArray: ktcPlayerObj[] = JSON.parse(match[1]);

      playersArray.forEach((playerKtcObj: ktcPlayerObj, index: number) => {
        let { sleeperId } = matchPlayer(
          playerKtcObj,
          allplayers,
          ktc_map_dynasty
        );

        if (sleeperId) {
          const overall_rank = playerKtcObj.superflexValues.tepp.rank;

          const position_rank =
            playerKtcObj.superflexValues.tepp.positionalRank;

          const value = playerKtcObj.superflexValues.tepp.value;

          currentValues.push({
            player_id: sleeperId,
            date,
            value,
            overall_rank,
            position_rank,
          });
        } else if (!ktc_unmatched_dynasty.links.includes(playerKtcObj.slug)) {
          ktc_unmatched_dynasty.links.push(playerKtcObj.slug);
        }
      });
    }
  });

  await insertUpdatedValues(currentValues);
  await insertIntoCommon("ktc_map_dynasty", ktc_map_dynasty, new Date());
  await insertIntoCommon(
    "ktc_unmatched_dynasty",
    ktc_unmatched_dynasty,
    new Date()
  );

  console.log(`KTC dynasty values updated successfully at ${new Date()}`);

  parentPort?.postMessage(false);
};

const formatPickLink = (link: string) => {
  const link_array = link.split("-");

  return `${link_array[0]} ${
    link_array[1].charAt(0).toUpperCase() + link_array[1].slice(1)
  } ${link_array[2]}`;
};

const convertTeamAbbrev = (ktcTeam: string) => {
  const teamMap: { [ktcTeam: string]: string } = {
    KCC: "KC",
    LVR: "LV",
    JAC: "JAX",
    NEP: "NE",
    TBB: "TB",
    GBP: "GB",
    NOS: "NO",
    SFO: "SF",
  };

  return teamMap[ktcTeam] || ktcTeam;
};

const getKtcMapAndUnmatched = async () => {
  const ktc_unmatched_db = await pool.query(
    "SELECT * FROM common WHERE name = $1;",
    [`ktc_unmatched_dynasty`]
  );

  const ktc_unmatched_dynasty = ktc_unmatched_db.rows[0]?.data || { links: [] };

  const ktc_map_db = await pool.query("SELECT * FROM common WHERE name = $1;", [
    `ktc_map_dynasty`,
  ]);

  const ktc_map_dynasty = ktc_map_db.rows[0]?.data || {};

  return { ktc_map_dynasty, ktc_unmatched_dynasty };
};

const insertUpdatedValues = async (data: KtcPlayerDbUpdate[]) => {
  if (data.length === 0) return;

  const query = `
        INSERT INTO ktc_dynasty (player_id, date, value, overall_rank, position_rank) 
        VALUES  ${data
          .map(
            (_, i) =>
              `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${
                i * 5 + 5
              })`
          )
          .join(", ")}
        ON CONFLICT (player_id, date) 
        DO UPDATE SET 
            value = EXCLUDED.value,
            overall_rank = EXCLUDED.overall_rank,
            position_rank = EXCLUDED.position_rank
        RETURNING *;
        `;

  const values = data.flatMap((d) => [
    d.player_id,
    d.date,
    d.value,
    d.overall_rank,
    d.position_rank,
  ]);

  await pool.query(query, values);
};

const syncAlltimeValues = async (type: "dynasty" | "fantasy") => {
  parentPort?.postMessage(true);

  const { ktc_dates, ktc_players } = await queryKtcValues(type);

  const sleeperIdsToUpdate = Object.keys(ktc_players).filter(
    (sleeperId) =>
      !(
        ktc_players[sleeperId]?.sync &&
        ktc_players[sleeperId]?.sync > controlValue
      )
  );

  console.log(`${sleeperIdsToUpdate.length} ${type} Sleeper Ids to update...`);

  const increment = 10;

  for await (let sleeperId of sleeperIdsToUpdate.slice(0, increment)) {
    const syncPlayer = async (type: "dynasty" | "fantasy") => {
      try {
        const link = ktc_players[sleeperId]?.link;

        if (link) {
          const response = await axiosInstance.get(
            `https://keeptradecut.com/${type}-rankings/players/` + link
          );

          const html = response.data;
          const $ = cheerio.load(html);

          $("script").each((index, element) => {
            const content = $(element).html();

            const match = content?.match(
              /var playerSuperflex\s*=\s*(\{[\s\S]*?\});/
            );

            if (match && match[1]) {
              const obj = JSON.parse(match[1]);
              const historicalValues = obj.overallValue;

              historicalValues.forEach(
                (obj: { d: string; v: number }, index: number) => {
                  const date_string = `20${obj.d.slice(0, 2)}-${obj.d.slice(
                    2,
                    4
                  )}-${obj.d.slice(4, 6)}`;
                  const date = new Date(date_string)
                    .toISOString()
                    .split("T")[0];
                  const value = obj.v;

                  ktc_players[sleeperId].values[date] = value;

                  if (!ktc_dates[date]) {
                    ktc_dates[date] = {};
                  }

                  ktc_dates[date][sleeperId] = value;
                }
              );

              ktc_players[sleeperId].sync = new Date().getTime();
            }
          });
        } else {
          console.log(`No ${type} link for ${sleeperId}`);
        }
      } catch (err: any) {
        if (err.response?.status === 404) delete ktc_players[sleeperId];

        console.log(err.message, sleeperId);

        console.log(ktc_players[sleeperId]?.link);
      }
    };

    await syncPlayer(type);
  }

  const updated_at = new Date();
  try {
    await insertIntoCommon(`ktc_dates_${type}`, ktc_dates, updated_at);
    await insertIntoCommon(`ktc_players_${type}`, ktc_players, updated_at);
    console.log("synced values inserted " + type);
  } catch (err) {
    console.log("Error inserting synced values " + type);
  }

  if (
    Object.keys(ktc_dates).length === 0 &&
    Object.keys(ktc_players).length === 0
  ) {
    setTimeout(async () => {
      await updateCurrentValues(type);

      setTimeout(async () => {
        await syncAlltimeValues(type);
      }, 15000);
    }, 15000);
  } else if (sleeperIdsToUpdate.length > increment) {
    setTimeout(() => {
      syncAlltimeValues(type);
    }, 15000);
  } else {
    parentPort?.postMessage(false);

    parentPort?.close();
  }
};

const updateCurrentValues = async (type: "dynasty" | "fantasy") => {
  parentPort?.postMessage(true);
  const { ktc_map, ktc_dates, ktc_players, ktc_unmatched } =
    await queryKtcValues(type);
  const { allplayers } = await queryAllPlayers();

  const url = `https://keeptradecut.com/${type}-rankings?page=0&filters=QB|WR|RB|TE|RDP&format=2`;

  const response = await axiosInstance.get(url);

  const html = response.data;
  const $ = cheerio.load(html);

  const date = new Date().toISOString().split("T")[0];

  if (!ktc_dates[date]) {
    ktc_dates[date] = {};
  }

  let updated_at;

  $("script").each((index, element) => {
    const content = $(element).html();

    const match = content?.match(/var playersArray\s*=\s*(\[[\s\S]*?\]);/);

    if (match && match[1]) {
      const playersArray = JSON.parse(match[1]);

      playersArray.forEach((playerKtcObj: ktcPlayerObj, index: number) => {
        let { sleeperId } = matchPlayer(playerKtcObj, allplayers, ktc_map);

        const value = playerKtcObj.superflexValues.tepp.value;

        if (sleeperId) {
          if (!ktc_map[playerKtcObj.slug]) {
            ktc_map[playerKtcObj.slug] = sleeperId;
          }

          if (!ktc_players[sleeperId]) {
            ktc_players[sleeperId] = {
              link: "",
              values: {},
            };
          }

          ktc_players[sleeperId].link = playerKtcObj.slug;
          ktc_players[sleeperId].values[date] = value;

          ktc_dates[date][sleeperId] = value;
        } else if (!ktc_unmatched.links.includes(playerKtcObj.slug)) {
          ktc_unmatched.links.push(playerKtcObj.slug);
        }
      });

      updated_at = new Date();
    }
  });

  if (updated_at) {
    insertIntoCommon(`ktc_dates_${type}`, ktc_dates, updated_at);
    insertIntoCommon(`ktc_players_${type}`, ktc_players, updated_at);
    insertIntoCommon(`ktc_unmatched_${type}`, ktc_unmatched, updated_at);
    insertIntoCommon(`ktc_map_${type}`, ktc_map, updated_at);

    console.log(`KTC ${type} values updated successfully at ${new Date()}`);
  } else {
    console.log("NO VALUES FOUND IN SCRAPED HTML - " + type);
  }

  parentPort?.postMessage(false);
};

const matchPlayer = (
  player: ktcPlayerObj,
  allplayers: { [player_id: string]: sleeperAllplayer },
  ktc_map: { [key: string]: { sleeper_id: string; sync: number } }
) => {
  if (ktc_map[player.slug])
    return { sleeperId: ktc_map[player.slug].sleeper_id };

  if (["-early-", "-mid-", "-late-"].some((pt) => player.slug.includes(pt))) {
    return { sleeperId: formatPickLink(player.slug) };
  }

  const getMatchName = (name: string) => {
    return name
      .replace("Marquise Brown", "Hollywood Brown")
      .replace("Jr", "")
      .replace("III", "")
      .toLowerCase()
      .replace(/[^a-z]/g, "");
  };

  let matches = Object.keys(allplayers).filter((sleeper_id) => {
    const positon_check =
      player.position?.toLowerCase() ===
      allplayers[sleeper_id]?.position?.toLowerCase();

    const name_check =
      getMatchName(player.playerName).startsWith(
        getMatchName(allplayers[sleeper_id]?.first_name.slice(0, 3))
      ) &&
      getMatchName(player.playerName).includes(
        getMatchName(allplayers[sleeper_id]?.last_name)
      );

    return positon_check && name_check;
  });

  if (matches.length > 1) {
    matches = matches.filter(
      (sleeper_id) =>
        convertTeamAbbrev(player.team) === allplayers[sleeper_id]?.team
    );
  }

  if (matches.length === 1) {
    const sleeperId = matches[0];

    ktc_map[player.slug] = { sleeper_id: sleeperId, sync: 0 };

    return { sleeperId };
  } else {
    return { sleeperId: undefined };
  }
};

const queryKtcValues = async (type: "dynasty" | "fantasy") => {
  const ktc_dates_db = await pool.query(
    "SELECT * FROM common WHERE name = $1;",
    [`ktc_dates_${type}`]
  );

  const ktc_dates = ktc_dates_db.rows[0]?.data || {};

  const ktc_players_db = await pool.query(
    "SELECT * FROM common WHERE name = $1;",
    [`ktc_players_${type}`]
  );

  const ktc_players: {
    [sleeperId: string]: {
      sync?: number;
      link: string;
      values: {
        [date: string]: number;
      };
    };
  } = ktc_players_db.rows[0]?.data || {};

  const ktc_unmatched_db = await pool.query(
    "SELECT * FROM common WHERE name = $1;",
    [`ktc_unmatched_${type}`]
  );

  const ktc_unmatched = ktc_unmatched_db.rows[0]?.data || { links: [] };

  const ktc_map_db = await pool.query("SELECT * FROM common WHERE name = $1;", [
    `ktc_map_${type}`,
  ]);

  const ktc_map = ktc_map_db.rows[0]?.data || {};

  return { ktc_dates, ktc_players, ktc_unmatched, ktc_map };
};

const queryAllPlayers = async () => {
  const allplayers_db = await pool.query(
    "SELECT * FROM common WHERE name = $1;",
    ["allplayers"]
  );

  let allplayers = allplayers_db.rows[0]?.data;

  if (!allplayers) {
    allplayers = await fetchAllPlayers();

    await pool.query(
      `
        INSERT INTO common (name, data, updated_at) 
        VALUES ($1, $2, $3)
        ON CONFLICT (name) 
        DO UPDATE SET 
            data = EXCLUDED.data,
            updated_at = EXCLUDED.updated_at
        RETURNING *;
        `,
      ["allplayers", JSON.stringify(allplayers), new Date()]
    );
  }

  return {
    allplayers: Object.fromEntries(
      allplayers.map((player: { player_id: string }) => [
        player.player_id,
        player,
      ])
    ),
  };
};

const insertIntoCommon = async (field: string, data: {}, updated_at: Date) => {
  await pool.query(
    `
        INSERT INTO common (name, data, updated_at) 
        VALUES ($1, $2, $3)
        ON CONFLICT (name) 
        DO UPDATE SET 
            data = EXCLUDED.data,
            updated_at = EXCLUDED.updated_at
        RETURNING *;
        `,
    [field, data, updated_at]
  );
};

const addToKtcPlayers = async (
  type: "dynasty" | "fantasy",
  data: {
    [link: string]: string;
  }
) => {
  const { ktc_map, ktc_unmatched } = await queryKtcValues(type);

  const updatedMap = {
    ...(ktc_map || {}),
    ...data,
  };

  const updatedUnmatched = {
    links: ktc_unmatched.links.filter(
      (l: string) => !Object.keys(data).some((p) => p === l)
    ),
  };

  insertIntoCommon(`ktc_map_${type}`, updatedMap, new Date());
  insertIntoCommon(`ktc_unmatched_${type}`, updatedUnmatched, new Date());
};

const fetchAllPlayers = async () => {
  const response = await axiosInstance.get(
    "https://sleeper.app/v1/players/nfl"
  );

  const allplayers: { [player_id: string]: sleeperAllplayer } = response.data;

  const allplayersFiltered: sleeperAllplayer[] = [];

  const positions = [
    "QB",
    "RB",
    "FB",
    "WR",
    "TE",
    "K",
    "DEF",
    "DL",
    "LB",
    "DB",
  ];

  Object.values(allplayers)
    .filter((player) => player.active && positions.includes(player.position))
    .forEach((value) => {
      const player_obj = value as sleeperAllplayer;

      allplayersFiltered.push({
        player_id: player_obj.player_id,
        position: player_obj.position === "FB" ? "RB" : player_obj.position,
        team: player_obj.team || "FA",
        full_name:
          player_obj.position === "DEF"
            ? `${player_obj.player_id} DEF`
            : player_obj.full_name,
        first_name: player_obj.first_name,
        last_name: player_obj.last_name,
        age: player_obj.age,
        fantasy_positions: player_obj.fantasy_positions.map((p) => {
          if (p === "FB") {
            return "RB";
          } else {
            return p;
          }
        }),
        years_exp: player_obj.years_exp,
        active: player_obj.active,
      });
    });

  return allplayersFiltered;
};

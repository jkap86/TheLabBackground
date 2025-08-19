import axiosInstance from "../lib/axiosInstance.js";
import * as cheerio from "cheerio";
import { pool } from "../lib/pool.js";
import fs from "fs";

type ktcPlayerObj = {
  playerID: number;
  playerName: string;
  slug: string;
  position: string;
  superflexValues: { tepp: { value: number }; value: number };
};

type sleeperAllplayer = {
  player_id: string;
  position: string;
  team: string;
  full_name: string;
  age: string;
  fantasy_positions: string[];
  years_exp: number;
  active: boolean;
};

const controlValue = new Date().getTime() - 6 * 60 * 60 * 1000;

const formatPickLink = (link: string) => {
  const link_array = link.split("-");

  return `${link_array[0]} ${
    link_array[1].charAt(0).toUpperCase() + link_array[1].slice(1)
  } ${link_array[2]}`;
};

setTimeout(async () => {
  const { ktc_unmatched } = await queryKtcValues("dynasty");

  const picks: { [key: string]: string } = {};

  ktc_unmatched.links.forEach((link: string) => {
    picks[link] = formatPickLink(link);
  });

  await addToKtcPlayers("dynasty", picks);

  await updateCurrentValues("dynasty");
  //await updateCurrentValues("fantasy");

  setTimeout(async () => {
    await syncAlltimeValues("dynasty");
    //await syncAlltimeValues("fantasy");
  }, 10000);
}, 5000);

const syncAlltimeValues = async (type: "dynasty" | "fantasy") => {
  const { ktc_dates, ktc_players } = await queryKtcValues(type);

  const sleeperIdsToUpdate = Object.keys(ktc_players).filter(
    (sleeperId) =>
      !(
        ktc_players[sleeperId]?.sync &&
        ktc_players[sleeperId]?.sync >= controlValue
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

              ktc_players[sleeperId].sync = controlValue;
            }
          });
        } else {
          console.log(`No ${type} link for ${sleeperId}`);
        }
      } catch (err: any) {
        console.log(err.message, sleeperId);

        console.log(ktc_players[sleeperId]?.link);
      }
    };

    await syncPlayer(type);
  }

  const updated_at = new Date();
  try {
    await insertKtcValues(`ktc_dates_${type}`, ktc_dates, updated_at);
    await insertKtcValues(`ktc_players_${type}`, ktc_players, updated_at);
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
    setTimeout(async () => {
      await updateCurrentValues(type);
    }, 15000);

    const minute = new Date().getMinutes();

    const delay = (minute > 30 ? 30 - minute - 30 : 30 - minute) * 60000;

    console.log(
      "Next update at " +
        new Date(new Date().getTime() + delay) +
        " for " +
        type
    );

    setTimeout(() => {
      setInterval(async () => {
        await updateCurrentValues(type);
      }, 1000 * 60 * 30);
    }, delay);
  }
};

const updateCurrentValues = async (type: "dynasty" | "fantasy") => {
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

      playersArray.forEach((playerKtcObj: ktcPlayerObj) => {
        let { sleeperId } = matchPlayer(playerKtcObj, allplayers, ktc_map);

        const value = playerKtcObj.superflexValues.value;

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
    insertKtcValues(`ktc_dates_${type}`, ktc_dates, updated_at);
    insertKtcValues(`ktc_players_${type}`, ktc_players, updated_at);
    insertKtcValues(`ktc_unmatched_${type}`, ktc_unmatched, updated_at);
    insertKtcValues(`ktc_map_${type}`, ktc_map, updated_at);

    console.log(`KTC ${type} values updated successfully...`);
  } else {
    console.log("NO VALUES FOUND IN SCRAPED HTML - " + type);
  }
};

const matchPlayer = (
  player: ktcPlayerObj,
  allplayers: { [player_id: string]: sleeperAllplayer },
  ktc_map: { [key: string]: string }
) => {
  if (ktc_map[player.slug]) return { sleeperId: ktc_map[player.slug] };

  const getMatchName = (name: string) => {
    return name
      .replace("Jr", "")
      .replace("III", "")
      .toLowerCase()
      .replace(/[^a-z]/g, "");
  };

  const matches = Object.keys(allplayers).filter(
    (sleeper_id) =>
      player.position.slice(0, 2)?.toLowerCase() ===
        allplayers[sleeper_id]?.position?.toLowerCase() &&
      getMatchName(player.playerName) ===
        getMatchName(allplayers[sleeper_id]?.full_name)
  );

  if (matches.length === 1) {
    const sleeperId = matches[0];

    ktc_map[player.slug] = sleeperId;

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

  fs.writeFileSync(
    `./app/utils/KtcSleeperIds_${type}.json`,
    JSON.stringify(ktc_map)
  );

  return { ktc_dates, ktc_players, ktc_unmatched, ktc_map };
};

const queryAllPlayers = async () => {
  const allplayers_db = await pool.query(
    "SELECT * FROM common WHERE name = $1;",
    ["allplayers"]
  );

  const allplayers = allplayers_db.rows[0]?.data || [];

  return {
    allplayers: Object.fromEntries(
      allplayers.map((player: { player_id: string }) => [
        player.player_id,
        player,
      ])
    ),
  };
};

const insertKtcValues = async (field: string, data: {}, updated_at: Date) => {
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

  insertKtcValues(`ktc_map_${type}`, updatedMap, new Date());
  insertKtcValues(`ktc_unmatched_${type}`, updatedUnmatched, new Date());
};

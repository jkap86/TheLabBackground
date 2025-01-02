import * as cheerio from "cheerio";
import { pool } from "../db/pool.js";
import axiosInstance from "../api/axiosInstance.js";
import fs from "fs";
const createKtcSleeperIdsMapping = async () => {
    const { ktc_players } = await queryKtcValues();
    const ktsIdMapping2 = Object.fromEntries(Object.keys(ktc_players).map((sleeperId) => [
        ktc_players[sleeperId].ktcId,
        sleeperId,
    ]));
    fs.writeFileSync("./app/utils/ktcIdMapping2.json", JSON.stringify(ktsIdMapping2));
};
const queryKtcValues = async () => {
    const ktc_dates_db = await pool.query("SELECT * FROM common WHERE name = $1;", ["ktc_dates"]);
    const ktc_dates = ktc_dates_db.rows[0]?.data || {};
    const ktc_players_db = await pool.query("SELECT * FROM common WHERE name = $1;", ["ktc_players"]);
    const ktc_players = ktc_players_db.rows[0]?.data || {};
    const ktc_unmatched_db = await pool.query("SELECT * FROM common WHERE name = $1;", ["ktc_unmatched"]);
    const ktc_unmatched = ktc_unmatched_db.rows[0]?.data || { links: [] };
    return { ktc_dates, ktc_players, ktc_unmatched };
};
const updateCurrentValues = async () => {
    let { ktc_dates, ktc_players, ktc_unmatched } = await queryKtcValues();
    const ktcMap = JSON.parse(fs.readFileSync("./app/utils/ktcIdMapping2.json", "utf-8"));
    const update = async () => {
        const response = await axiosInstance.get("https://keeptradecut.com/dynasty-rankings?page=0&filters=QB|WR|RB|TE|RDP&format=2");
        const html = response.data;
        const $ = cheerio.load(html);
        const date = new Date().toISOString().split("T")[0];
        if (!ktc_dates[date]) {
            ktc_dates[date] = {};
        }
        let updatedat;
        $("script").each((index, element) => {
            const content = $(element).html();
            const match = content?.match(/var playersArray\s*=\s*(\[[\s\S]*?\]);/);
            if (match && match[1]) {
                const playersArray = JSON.parse(match[1]);
                playersArray.forEach((playerKtcObj) => {
                    const ktcId = playerKtcObj.playerID.toString();
                    const sleeperId = ktcMap[ktcId];
                    const value = playerKtcObj.superflexValues.value;
                    if (sleeperId) {
                        ktc_players[sleeperId] = {
                            name: playerKtcObj.playerName,
                            ktcId: ktcId,
                            link: playerKtcObj.slug,
                            position: playerKtcObj.position,
                            updatedat: ktc_players[sleeperId]?.updatedat,
                            values: {
                                ...(ktc_players[sleeperId]?.values || {}),
                                [date]: value,
                            },
                        };
                        ktc_dates[date][sleeperId] = value;
                    }
                    else {
                        if (!ktc_players[sleeperId]) {
                            if (!ktc_unmatched.links.includes(playerKtcObj.slug)) {
                                ktc_unmatched.links.push(playerKtcObj.slug);
                            }
                        }
                        else {
                            ktc_unmatched.links = ktc_unmatched.links.filter((l) => l !== playerKtcObj.slug);
                        }
                    }
                });
                updatedat = new Date();
            }
        });
        if (updatedat) {
            await pool.query(`
          INSERT INTO common (name, data, updatedat) 
          VALUES ($1, $2, $3)
          ON CONFLICT (name) 
          DO UPDATE SET 
            data = EXCLUDED.data,
            updatedat = EXCLUDED.updatedat
          RETURNING *;
        `, ["ktc_dates", ktc_dates, updatedat]);
            await pool.query(`
          INSERT INTO common (name, data, updatedat) 
          VALUES ($1, $2, $3)
          ON CONFLICT (name) 
          DO UPDATE SET 
            data = EXCLUDED.data,
            updatedat = EXCLUDED.updatedat
          RETURNING *;
        `, ["ktc_players", ktc_players, updatedat]);
            await pool.query(`
          INSERT INTO common (name, data, updatedat) 
          VALUES ($1, $2, $3)
          ON CONFLICT (name) 
          DO UPDATE SET 
            data = EXCLUDED.data,
            updatedat = EXCLUDED.updatedat
          RETURNING *;
        `, [
                "ktc_unmatched",
                {
                    ...ktc_unmatched,
                    links: Array.from(new Set(ktc_unmatched.links.filter((l) => {
                        const link_array = l.split("-");
                        const ktcId = link_array[link_array.length - 1];
                        return !(Object.keys(ktcMap).includes(ktcId) ||
                            parseInt(link_array[0]));
                    }))),
                },
                updatedat,
            ]);
            console.log("KTC Values updated successfully...");
        }
        else {
            console.log("NO VALUES FOUND IN SCRAPED HTML");
        }
    };
    try {
        console.log("Begin KTC update");
        await update();
    }
    catch (err) {
        console.log(err.message);
        await update();
    }
    finally {
        console.log("KTC update complete.");
        const used = process.memoryUsage();
        for (let key in used) {
            const cat = key;
            console.log(`${key} ${Math.round((used[cat] / 1024 / 1024) * 100) / 100} MB`);
        }
    }
};
const syncAlltimeValues = async () => {
    console.log("Begin Syncing Alltime Values");
    const { ktc_dates, ktc_players } = await queryKtcValues();
    const ktcMap = JSON.parse(fs.readFileSync("./app/utils/ktcIdMapping2.json", "utf-8"));
    const sleeperIdsToUpdate = Object.values(ktcMap).filter((sleeperId) => !(ktc_players[sleeperId]?.updatedat === 1));
    console.log(`${sleeperIdsToUpdate.length} Sleeper Ids to update...`);
    const increment = 25;
    for await (let sleeperId of sleeperIdsToUpdate.slice(0, increment)) {
        console.log(sleeperId);
        const link = ktc_players[sleeperId]?.link;
        if (link) {
            try {
                const response = await axiosInstance.get("https://keeptradecut.com/dynasty-rankings/players/" + link);
                const html = response.data;
                const $ = cheerio.load(html);
                $("script").each((index, element) => {
                    const content = $(element).html();
                    const match = content?.match(/var playerSuperflex\s*=\s*(\{[\s\S]*?\});/);
                    if (match && match[1]) {
                        const obj = JSON.parse(match[1]);
                        const historicalValues = obj.overallValue;
                        historicalValues.forEach((obj, index) => {
                            const date_string = `20${obj.d.slice(0, 2)}-${obj.d.slice(2, 4)}-${obj.d.slice(4, 6)}`;
                            const date = new Date(date_string).toISOString().split("T")[0];
                            const value = obj.v;
                            ktc_players[sleeperId].values[date] = value;
                            if (!ktc_dates[date]) {
                                ktc_dates[date] = {};
                            }
                            ktc_dates[date][sleeperId] = value;
                        });
                        ktc_players[sleeperId].updatedat = 1;
                    }
                });
            }
            catch (err) {
                console.log(err.message, sleeperId);
            }
        }
        else {
            console.log("NO LINK FOR sleeperId - " + sleeperId);
        }
    }
    const updatedat = new Date();
    await pool.query(`
          INSERT INTO common (name, data, updatedat) 
          VALUES ($1, $2, $3)
          ON CONFLICT (name) 
          DO UPDATE SET 
            data = EXCLUDED.data,
            updatedat = EXCLUDED.updatedat
          RETURNING *;
        `, ["ktc_dates", ktc_dates, updatedat]);
    await pool.query(`
          INSERT INTO common (name, data, updatedat) 
          VALUES ($1, $2, $3)
          ON CONFLICT (name) 
          DO UPDATE SET 
            data = EXCLUDED.data,
            updatedat = EXCLUDED.updatedat
          RETURNING *;
        `, ["ktc_players", ktc_players, updatedat]);
    console.log("Sync Complete");
    if (sleeperIdsToUpdate.length > increment) {
        setTimeout(syncAlltimeValues, 15000);
    }
    else {
        setTimeout(updateCurrentValues, 60000);
        setInterval(updateCurrentValues, 1000 * 60 * 60);
    }
};
setTimeout(async () => {
    await createKtcSleeperIdsMapping();
    await syncAlltimeValues();
}, 5000);
/*
setTimeout(syncAlltimeValues, 5000);
setInterval(updateCurrentValues, 1000 * 60 * 60);
*/
const insertIntoKtcPlayers = async () => {
    const data = {
        "7583": {
            link: "sam-ehlinger-1027",
            ktcId: "1027",
            values: {},
        },
    };
    const { ktc_players } = await queryKtcValues();
    const ktc_players_updated = {
        ...ktc_players,
        ...data,
    };
    await pool.query(`
      INSERT INTO common (name, data, updatedat) 
      VALUES ($1, $2, $3)
      ON CONFLICT (name) 
      DO UPDATE SET 
        data = EXCLUDED.data,
        updatedat = EXCLUDED.updatedat
      RETURNING *;
    `, ["ktc_players", ktc_players_updated, new Date()]);
    console.log("ktc_players updated...");
};
insertIntoKtcPlayers();

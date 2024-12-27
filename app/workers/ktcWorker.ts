import puppeteer from "puppeteer";
import * as cheerio from "cheerio";
import { ktcIdMapping } from "../utils/KtcIdMapping.js";
import { pool } from "../db/pool.js";

const queryKtcValues = async () => {
  const ktc_dates_db = await pool.query(
    "SELECT * FROM common WHERE name = $1;",
    ["ktc_dates"]
  );

  const ktc_dates = ktc_dates_db.rows[0]?.data || {};

  const ktc_players_db = await pool.query(
    "SELECT * FROM common WHERE name = $1;",
    ["ktc_players"]
  );

  const ktc_players = ktc_players_db.rows[0]?.data || {};

  const ktc_unmatched_db = await pool.query(
    "SELECT * FROM common WHERE name = $1;",
    ["ktc_unmatched"]
  );

  const ktc_unmatched = ktc_unmatched_db.rows[0]?.data || [];

  return { ktc_dates, ktc_players, ktc_unmatched };
};

const updateCurrentValues = async () => {
  const { ktc_dates, ktc_players, ktc_unmatched } = await queryKtcValues();

  const ktcMap: { [ktcId: string]: string } = ktcIdMapping;
  const browser = await puppeteer.launch({
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-extensions",
      "--disable-gpu",
      "--no-zygote",
    ],
  });

  const page = await browser.newPage();

  const update = async () => {
    console.log("Updating KTC Values...");

    await page.goto(
      `https://keeptradecut.com/dynasty-rankings?page=0&filters=QB|WR|RB|TE|RDP&format=2`
    );

    await page.waitForNetworkIdle();
    const html = await page.content();

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

        const unmatched: string[] = [];

        playersArray.forEach(
          (playerKtcObj: {
            playerID: number;
            playerName: string;
            position: string;
            superflexValues: { tepp: { value: number }; value: number };
          }) => {
            const ktcId = playerKtcObj.playerID.toString();

            const sleeperId = ktcMap[ktcId];

            const value =
              playerKtcObj.position === "TE"
                ? playerKtcObj.superflexValues.tepp.value
                : playerKtcObj.superflexValues.value;

            if (sleeperId) {
              if (!ktc_players[sleeperId]) {
                ktc_players[sleeperId] = {
                  name: playerKtcObj.playerName,
                  ktcId: ktcId,
                  position: playerKtcObj.position,
                  values: {},
                };
              }

              ktc_dates[date][sleeperId] = value;

              ktc_players[sleeperId].values[date] = value;
            } else {
              unmatched.push(`${playerKtcObj.playerName}-${ktcId}`);
            }
          }
        );

        updatedat = new Date();
      }
    });

    if (updatedat) {
      await pool.query(
        `
          INSERT INTO common (name, data, updatedat) 
          VALUES ($1, $2, $3)
          ON CONFLICT (name) 
          DO UPDATE SET 
            data = EXCLUDED.data,
            updatedat = EXCLUDED.updatedat
          RETURNING *;
        `,
        ["ktc_dates", ktc_dates, updatedat]
      );

      await pool.query(
        `
          INSERT INTO common (name, data, updatedat) 
          VALUES ($1, $2, $3)
          ON CONFLICT (name) 
          DO UPDATE SET 
            data = EXCLUDED.data,
            updatedat = EXCLUDED.updatedat
          RETURNING *;
        `,
        ["ktc_players", ktc_players, updatedat]
      );

      console.log("KTC Values updated successfully...");
    }
  };
  try {
    await update();
  } catch (err: any) {
    console.log(err.message);
    await update();
  } finally {
    console.log("KTC update complete.");
    await browser.close();

    const used = process.memoryUsage();

    for (let key in used) {
      const cat = key as keyof NodeJS.MemoryUsage;
      console.log(
        `${key} ${Math.round((used[cat] / 1024 / 1024) * 100) / 100} MB`
      );
    }
  }
};

setTimeout(updateCurrentValues, 1000 * 15);
setInterval(updateCurrentValues, 1000 * 60 * 60);

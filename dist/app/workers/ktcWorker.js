"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const puppeteer_1 = __importDefault(require("puppeteer"));
const cheerio = __importStar(require("cheerio"));
const KtcIdMapping_js_1 = require("../utils/KtcIdMapping.js");
const pool_js_1 = require("../db/pool.js");
const queryKtcValues = async () => {
    const ktc_dates_db = await pool_js_1.pool.query("SELECT * FROM common WHERE name = $1;", ["ktc_dates"]);
    const ktc_dates = ktc_dates_db.rows[0]?.data || {};
    const ktc_players_db = await pool_js_1.pool.query("SELECT * FROM common WHERE name = $1;", ["ktc_players"]);
    const ktc_players = ktc_players_db.rows[0]?.data || {};
    const ktc_unmatched_db = await pool_js_1.pool.query("SELECT * FROM common WHERE name = $1;", ["ktc_unmatched"]);
    const ktc_unmatched = ktc_unmatched_db.rows[0]?.data || [];
    return { ktc_dates, ktc_players, ktc_unmatched };
};
const updateCurrentValues = async () => {
    const { ktc_dates, ktc_players, ktc_unmatched } = await queryKtcValues();
    const ktcMap = KtcIdMapping_js_1.ktcIdMapping;
    const browser = await puppeteer_1.default.launch();
    const page = await browser.newPage();
    try {
        console.log("Updating KTC Values...");
        await page.goto(`https://keeptradecut.com/dynasty-rankings?page=0&filters=QB|WR|RB|TE|RDP&format=2`);
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
                const unmatched = [];
                playersArray.forEach((playerKtcObj) => {
                    const ktcId = playerKtcObj.playerID.toString();
                    const sleeperId = ktcMap[ktcId];
                    const value = playerKtcObj.position === "TE"
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
                    }
                    else {
                        unmatched.push(`${playerKtcObj.playerName}-${ktcId}`);
                    }
                });
                updatedat = new Date();
            }
        });
        if (updatedat) {
            await pool_js_1.pool.query(`
          INSERT INTO common (name, data, updatedat) 
          VALUES ($1, $2, $3)
          ON CONFLICT (name) 
          DO UPDATE SET 
            data = EXCLUDED.data,
            updatedat = EXCLUDED.updatedat
          RETURNING *;
        `, ["ktc_dates", ktc_dates, updatedat]);
            await pool_js_1.pool.query(`
          INSERT INTO common (name, data, updatedat) 
          VALUES ($1, $2, $3)
          ON CONFLICT (name) 
          DO UPDATE SET 
            data = EXCLUDED.data,
            updatedat = EXCLUDED.updatedat
          RETURNING *;
        `, ["ktc_players", ktc_players, updatedat]);
            console.log("KTC Values updated successfully...");
        }
    }
    catch (err) {
        console.log(err.message);
    }
    finally {
        console.log("KTC update complete.");
        await browser.close();
    }
};
setTimeout(updateCurrentValues, 1000 * 15);
setInterval(updateCurrentValues, 1000 * 60 * 60);

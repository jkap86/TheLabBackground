"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDayValues = void 0;
const pool_js_1 = require("../db/pool.js");
const getDayValues = async (req, res) => {
    let { days } = req.query;
    if (!days) {
        days = "0";
    }
    const ktc_dates_db = await pool_js_1.pool.query("SELECT * FROM common WHERE name = $1;", ["ktc_dates"]);
    const ktc_dates = ktc_dates_db.rows[0]?.data || {};
    const current_date = Object.keys(ktc_dates).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[parseInt(days)];
    const current_values_obj = ktc_dates[current_date];
    const current_values_array = Object.entries(current_values_obj);
    res.send({
        date: current_date,
        values: current_values_array,
    });
};
exports.getDayValues = getDayValues;

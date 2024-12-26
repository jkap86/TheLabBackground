import { Request, Response } from "express";
import { pool } from "../db/pool.js";

export const getDayValues = async (
  req: Request,
  res: Response
): Promise<void> => {
  let { days } = req.query;

  if (!days) {
    days = "0";
  }

  const ktc_dates_db = await pool.query(
    "SELECT * FROM common WHERE name = $1;",
    ["ktc_dates"]
  );

  const ktc_dates = ktc_dates_db.rows[0]?.data || {};

  const current_date = Object.keys(ktc_dates).sort(
    (a: string, b: string) => new Date(b).getTime() - new Date(a).getTime()
  )[parseInt(days as string)];

  const current_values_obj = ktc_dates[current_date];

  const current_values_array = Object.entries(current_values_obj);

  res.send({
    date: current_date,
    values: current_values_array,
  });
};

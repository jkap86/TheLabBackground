import axiosInstance from "../lib/axiosInstance.js";
import { pool } from "../lib/pool.js";

setTimeout(async () => {
  await updateProjections();
}, 5000);

const updateProjections = async () => {
  console.log("Projections Update");
  const state: { week: number; leg: number } = await (
    await axiosInstance.get("https://api.sleeper.app/v1/state/nfl")
  ).data;
  const week = Math.max(Math.min(state.week, state.leg), 1);

  if (week > 0 && week < 18) {
    console.log("Updating ROS projections for week " + week);

    const projections_ros_updated: {
      [player_id: string]: {
        stats: { [cat: string]: number };
        player_id: string;
      };
    } = {};

    for (let i = week; i <= 18; i++) {
      const projections_week: {
        data: { player_id: string; stats: { [cat: string]: number } }[];
      } = await axiosInstance.get(
        `https://api.sleeper.com/projections/nfl/2025/${i}?season_type=regular`
      );

      projections_week.data
        .filter((p) => p.stats.pts_ppr)
        .forEach((p) => {
          if (!projections_ros_updated[p.player_id]?.stats) {
            projections_ros_updated[p.player_id] = {
              stats: {},
              player_id: p.player_id,
            };
          }

          Object.keys(p.stats).forEach((cat) => {
            if (!projections_ros_updated[p.player_id].stats[cat]) {
              projections_ros_updated[p.player_id].stats[cat] = p.stats[cat];
            } else {
              projections_ros_updated[p.player_id].stats[cat] += p.stats[cat];
            }
          });
        });
    }

    await insertProjections(Object.values(projections_ros_updated));

    console.log(`Projections update for week ${week} complete`);
  } else {
    console.log(`Week ${week} - Skipping projections update`);
  }

  setTimeout(updateProjections, 15 * 60 * 60 * 1000);
};

const insertProjections = async (
  data: {
    stats: { [cat: string]: number };
    player_id: string;
  }[]
) => {
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
    ["projections_ros", JSON.stringify(data), new Date()]
  );
};

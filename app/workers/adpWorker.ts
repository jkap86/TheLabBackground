import { pool } from "../db/pool.js";
import axiosInstance from "../api/axiosInstance.js";
import { SleeperDraftDraftPick } from "../types/sleeperApiTypes.js";

const getDraftsToUpdate = async () => {
  const getDraftIdsQuery = `
      SELECT draft_id 
      FROM drafts 
      WHERE status <> 'complete'
      OR TO_TIMESTAMP(COALESCE(last_picked, EXTRACT(EPOCH FROM NOW()) * 1000) / 1000) > COALESCE(picksupdatedat, 'epoch')
      ORDER BY picksupdatedat ASC NULLS FIRST
      LIMIT 100;
    `;

  const draft_ids_db = await pool.query(getDraftIdsQuery);

  return draft_ids_db.rows.map((row) => row.draft_id);
};

const getDraftPicks = async (draft_ids: string[]) => {
  const BATCH_SIZE = 10;

  const draft_picks: {
    draft_id: string;
    picks: { [player_id: string]: number };
  }[] = [];

  for (let i = 0; i < draft_ids.length; i += BATCH_SIZE) {
    await Promise.all(
      draft_ids.slice(i, i + BATCH_SIZE).map(async (draft_id) => {
        try {
          const picks = await axiosInstance.get(
            `https://api.sleeper.app/v1/draft/${draft_id}/picks`
          );

          const picks_obj = Object.fromEntries(
            picks.data.map((pick: SleeperDraftDraftPick) => [
              pick.player_id,
              pick.pick_no,
            ])
          );

          draft_picks.push({
            draft_id,
            picks: picks_obj,
          });
        } catch (err: unknown) {
          console.log({ draft_id });
          if (err instanceof Error) {
            console.log(err.message);
            if ((err as any).response?.status === 404) {
              console.log(`Deleting DRAFT - ${draft_id}`);
              await pool.query(`DELETE FROM drafts WHERE draft_id = $1`, [
                draft_id,
              ]);
            }
          } else {
            console.log({ err });
          }
        }
      })
    );
  }

  return draft_picks;
};

const insertDraftPicks = async (
  draftObjs: {
    draft_id: string;
    picks: { [player_id: string]: number };
  }[]
) => {
  const insertQuery = `
    INSERT INTO drafts (draft_id, status, type, league_id, picks, picksupdatedat)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (draft_id) DO UPDATE SET
        status = drafts.status,
        type = drafts.type,
        league_id = drafts.league_id,
        picks = EXCLUDED.picks,
        picksupdatedat = EXCLUDED.picksupdatedat;
    `;

  for (const draftObj of draftObjs) {
    try {
      await pool.query(insertQuery, [
        draftObj.draft_id,
        "",
        "",
        "",
        draftObj.picks,
        new Date(),
      ]);
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.log(err.message);
      } else {
        console.log({ err });
      }
    }
  }
};

setTimeout(() => {
  const draftPicksUpdate = async () => {
    console.log("Begining ADP Update...");
    const draft_ids = await getDraftsToUpdate();

    const draftpicks = await getDraftPicks(draft_ids);

    await insertDraftPicks(draftpicks);
    console.log("ADP Update Complete...");
    setTimeout(draftPicksUpdate, 5 * 60 * 1000);
  };

  draftPicksUpdate();
  console.log("ADP Update Complete");
}, 5000);

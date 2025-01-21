import { pool } from "../db/pool.js";
import axiosInstance from "../api/axiosInstance.js";
import { SleeperDraftDraftPick } from "../types/sleeperApiTypes.js";
import { DraftDb } from "../types/dbTypes.js";

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

const getDraftPicksUpdatedDrafts = async (draft_ids: string[]) => {
  const BATCH_SIZE = 10;

  const updatedDrafts: DraftDb[] = [];

  for (let i = 0; i < draft_ids.length; i += BATCH_SIZE) {
    await Promise.all(
      draft_ids.slice(i, i + BATCH_SIZE).map(async (draft_id) => {
        try {
          const [draft, picks] = await Promise.all([
            await axiosInstance.get(
              `https://api.sleeper.app/v1/draft/${draft_id}`
            ),
            await axiosInstance.get(
              `https://api.sleeper.app/v1/draft/${draft_id}/picks`
            ),
          ]);

          const kickers =
            picks.data.filter(
              (p: SleeperDraftDraftPick) => p.metadata.position === "K"
            ).length > 36
              ? Object.fromEntries(
                  picks.data
                    .filter(
                      (p: SleeperDraftDraftPick) => p.metadata.position === "K"
                    )
                    .sort(
                      (a: SleeperDraftDraftPick, b: SleeperDraftDraftPick) => {
                        if (draft.data.type === "auction") {
                          return (
                            parseInt(b.metadata.amount) -
                            parseInt(b.metadata.amount)
                          );
                        } else {
                          return a.pick_no - b.pick_no;
                        }
                      }
                    )
                    .map((p: SleeperDraftDraftPick, index: number) => [
                      p.player_id,
                      `${draft.data.season} ${Math.floor(index / 12) + 1}.${(
                        (index % 12) +
                        1
                      ).toLocaleString("en-US", { minimumIntegerDigits: 2 })}`,
                    ])
                )
              : {};

          const picks_obj = Object.fromEntries(
            picks.data.map((pick: SleeperDraftDraftPick) => [
              kickers[pick.player_id] || pick.player_id,
              draft.data.type === "auction"
                ? Math.round(
                    (parseInt(pick.metadata.amount) /
                      draft.data.settings.budget) *
                      1000
                  ) / 10
                : pick.pick_no,
            ])
          );

          updatedDrafts.push({
            ...draft.data,
            type:
              draft.data.type === "auction"
                ? "auction"
                : draft.data.type === "linear"
                ? "rookie"
                : "startup",
            settings: draft.data.settings,
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

  return updatedDrafts;
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

export const upsertDrafts = async (drafts: DraftDb[]) => {
  const upsertDraftsQuery = `
    INSERT INTO drafts (draft_id, status, type, settings, last_picked, updatedat, league_id, picks, picksupdatedat)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (draft_id) DO UPDATE SET
      status = EXCLUDED.status,
      type = EXCLUDED.type,
      settings = EXCLUDED.settings,
      last_picked = EXCLUDED.last_picked,
      updatedat = EXCLUDED.updatedat,
      league_id = EXCLUDED.league_id,
      picks = EXCLUDED.picks,
      picksupdatedat = EXCLUDED.picksupdatedat;
  `;

  for (const draft of drafts) {
    try {
      await pool.query(upsertDraftsQuery, [
        draft.draft_id,
        draft.status,
        draft.type,
        draft.settings,
        draft.last_picked,
        new Date(),
        draft.league_id,
        draft.picks,
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

    const updatedDrafts = await getDraftPicksUpdatedDrafts(draft_ids);

    await upsertDrafts(updatedDrafts);
    console.log("ADP Update Complete...");
    setTimeout(draftPicksUpdate, 1 * 60 * 1000);
  };

  draftPicksUpdate();
}, 5000);

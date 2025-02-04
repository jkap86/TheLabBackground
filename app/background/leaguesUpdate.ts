import * as workerThreads from "worker_threads";
import * as path from "path";
import { fileURLToPath } from "url";
import { Express } from "express";

let updateInProgress = false;

const startWorker = (worker: workerThreads.Worker, app: Express) => {
  updateInProgress = true;
  console.log(`Beginning User Update...`);

  const league_ids_queue = app.get("league_ids_queue") || [];

  worker.postMessage({ league_ids_queue });

  worker.on("error", (err) => {
    console.log(err);
  });

  worker.once("message", (message) => {
    console.log({ queue: message.length });

    try {
      app.set("league_ids_queue", message);
    } catch (err: unknown) {
      if (err instanceof Error) console.log(err.message);
    }

    updateInProgress = false;

    const used = process.memoryUsage();

    for (let key in used) {
      const cat = key as keyof NodeJS.MemoryUsage;
      console.log(
        `${key} ${Math.round((used[cat] / 1024 / 1024) * 100) / 100} MB`
      );
    }
  });

  worker.on("exit", (code) => {
    if (code !== 0) {
      console.error(new Error(`Worker stopped with exit code ${code}`));
    } else {
      console.log("Worker completed successfully");
    }
  });
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const worker = new workerThreads.Worker(
  path.resolve(__dirname, "../workers/leaguesWorker.js")
);

const userUpdateInterval = async (app: Express) => {
  const used = process.memoryUsage();

  const rss = Math.round((used["rss"] / 1024 / 1024) * 100) / 100;

  console.log({ rss });
  if (updateInProgress) {
    console.log("UPDATE IN PROGRESS...");
  } else if (rss > 500) {
    console.log("Mem use too high...");
  } else {
    try {
      startWorker(worker, app);
    } catch (err) {
      if (err instanceof Error) console.log(err.message);
    }
  }
  setTimeout(() => userUpdateInterval(app), 30 * 1000);
};

export default userUpdateInterval;

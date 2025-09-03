import * as workerThreads from "worker_threads";
import * as path from "path";
import { fileURLToPath } from "url";
import { Express } from "express";

const startWorker = (app: Express) => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const worker = new workerThreads.Worker(
    path.resolve(__dirname, "../workers/ktcWorker.js")
  );

  worker.on("error", (err) => {
    console.log(err.message);
  });

  worker.on("message", (message) => {
    app.set("updateInProgress", message);
  });

  worker.on("exit", (code) => {
    if (code !== 0) {
      console.error(new Error(`Worker stopped with exit code ${code}`));
      startWorker(app);
    } else {
      console.log("Worker completed successfully");
      const minute = new Date().getMinutes();

      const delay = (minute > 30 ? 30 - minute - 30 : 30 - minute) * 60000;

      console.log(
        "Next KTC update at " + new Date(new Date().getTime() + delay)
      );

      setTimeout(async () => startWorker(app), delay);
    }
  });
};

export default startWorker;

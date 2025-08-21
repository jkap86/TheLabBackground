import * as workerThreads from "worker_threads";
import * as path from "path";
import { fileURLToPath } from "url";
const startWorker = (worker, app) => {
    app.set("updateInProgress", true);
    console.log(`Beginning User Update...`);
    const league_ids_queue = app.get("league_ids_queue") || [];
    worker.postMessage({ league_ids_queue });
    worker.once("error", (err) => {
        console.log(err);
    });
    worker.once("message", (message) => {
        console.log({ queue: message.length });
        try {
            app.set("league_ids_queue", message);
        }
        catch (err) {
            if (err instanceof Error)
                console.log(err.message);
        }
        app.set("updateInProgress", false);
        const used = process.memoryUsage();
        for (let key in used) {
            const cat = key;
            console.log(`${key} ${Math.round((used[cat] / 1024 / 1024) * 100) / 100} MB`);
        }
    });
    worker.once("exit", (code) => {
        if (code !== 0) {
            console.error(new Error(`Worker stopped with exit code ${code}`));
            app.set("updateInProgress", false);
            startWorker(worker, app);
        }
        else {
            console.log("Worker completed successfully");
        }
    });
};
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const worker = new workerThreads.Worker(path.resolve(__dirname, "../workers/leaguesWorker.js"));
const userUpdateInterval = async (app) => {
    const used = process.memoryUsage();
    const rss = Math.round((used["rss"] / 1024 / 1024) * 100) / 100;
    console.log({ rss });
    if (app.get("updateInProgress")) {
        console.log("UPDATE IN PROGRESS...");
    }
    else if (rss > 400) {
        console.log("Mem use too high...");
    }
    else {
        try {
            setTimeout(() => {
                startWorker(worker, app);
            }, 10000);
        }
        catch (err) {
            if (err instanceof Error)
                console.log(err.message);
        }
    }
    setTimeout(() => userUpdateInterval(app), 60 * 1000);
};
export default userUpdateInterval;

import * as workerThreads from "worker_threads";
import * as path from "path";
import { fileURLToPath } from "url";

const startWorker = () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const worker = new workerThreads.Worker(
    path.resolve(__dirname, "../workers/ktcWorker.js")
  );

  worker.on("error", (err) => {
    console.log(err.message);
  });
};

export default startWorker;

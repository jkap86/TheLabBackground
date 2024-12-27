import * as workerThreads from "worker_threads";
import * as path from "path";

const startWorker = () => {
  const worker = new workerThreads.Worker(
    path.resolve(__dirname, "../workers/ktcWorker.js")
  );

  worker.on("error", (err) => {
    console.log(err.message);
  });
};

export default startWorker;

import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);

  const { default: ktcUpdate } = await import("./app/background/ktcUpdate.js");
  ktcUpdate();

  const { default: leaguesUpdate } = await import(
    "./app/background/leaguesUpdate.js"
  );
  leaguesUpdate(app);

  const { default: adpUpdate } = await import("./app/background/adpUpdate.js");
  adpUpdate();
});

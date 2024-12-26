import express from "express";
import ktcRoutes from "./app/routes/ktc.routes.js";
const app = express();
app.use(express.json());
app.use("/ktc", ktcRoutes);
const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    const { default: ktcUpdate } = await import("./app/background/ktcUpdate.js");
    ktcUpdate();
});

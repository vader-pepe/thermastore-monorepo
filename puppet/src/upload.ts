import express from "express";
import fs from "fs/promises";
import path from "path";
const router = express.Router();

router.post("/", async (req, res) => {
  if (req.file) {
    const fileName = req.file.filename;
    const queuePath = path.join(__dirname, "queue");
    const filesPath = path.join(queuePath, "files");
    await fs
      .access(queuePath)
      .then(async () => {
        await fs.appendFile(filesPath, fileName + "\n");
      })
      .catch(async (_err) => {
        await fs.mkdir(queuePath);
        await fs.writeFile(filesPath, fileName + "\n");
      });

    return res.status(200).json({ message: "OK", data: fileName });
  }
  return res.status(404).json({ message: "No file!" });
});

export default router;

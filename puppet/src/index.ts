import express from "express";
import bodyParser from "body-parser";
import multer from "multer";
import { convertMsToTime } from "./utils";
import uploadRoute from "./upload";
import Bree from "bree";

const app = express();
const bree = new Bree({
  root: __dirname + "/jobs/",
  jobs: [
    {
      name: "upload",
      interval: "10s",
    },
  ],
});

const port = process.env.PORT || 3000;
var storage = multer.diskStorage({
  destination: __dirname + "/files/",
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  },
});

const upload = multer({ storage });
const timestamp = new Date();
// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }));
// parse application/json
app.use(bodyParser.json());
app.use("/upload", upload.single("file"), uploadRoute);
app.get("/", function (req, res) {
  const timediff = new Date().getTime() - timestamp.getTime();
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).send(`Alive for: ${convertMsToTime(timediff)}`);
});

bree
  .start()
  .then(() => {
    console.log("Bree started");
  })
  .catch((_err) => {
    console.log("Files aren't built yet or missing");
  });

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

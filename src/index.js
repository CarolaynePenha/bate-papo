import express, { json } from "express";
import joi from "joi";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import chalk from "chalk";
import dayjs from "dayjs";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(json());
app.use(cors());

let db = null;
const mongoClient = new MongoClient(process.env.MONGO_URI ?? "");

const promise = mongoClient.connect();
promise.then(() => {
  db = mongoClient.db("bate-papo");
  console.log(chalk.blue.bold("Banco de dados criado com sucesso"));
});
promise.catch((err) =>
  console.log(chalk.red.bold("Não foi possivel conectar ao Mongo", err))
);

app.post("/participants", async (req, res) => {
  const { name } = req.body;
  const nameSchema = joi.object({
    name: joi.string().required(),
  });
  const validation = nameSchema.validate(req.body, { abortEarly: false });
  if (validation.error) {
    res.sendStatus(422);
    return;
  }
  const user = { name: name, lastStatus: Date.now() };
  const statusMessage = {
    from: name,
    to: "Todos",
    text: "entra na sala...",
    type: "status",
    time: dayjs().format("HH:mm:ss"),
  };

  try {
    const usersCollection = db.collection("users");
    const noUniqueName = await usersCollection.findOne({ name: name });
    if (noUniqueName) {
      res.sendStatus(409);
      return;
    }
    await usersCollection.insertOne(user);

    const messagesCollection = db.collection("messages");
    await messagesCollection.insertOne(statusMessage);
    res.sendStatus(201);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

app.post("/messages", async (req, res) => {
  const message = req.body;
  const { user } = req.headers;
  const messageSchema = joi.object({
    to: joi.string().required(),
    text: joi.string().required(),
    type: joi.string().valid("private_message", "message"),
  });
  const validation = messageSchema.validate(message, { abortEarly: false });
  if (validation.error) {
    res.sendStatus(422);
    return;
  }
  const messageObj = {
    from: user,
    to: message.to,
    text: message.text,
    type: message.type,
    time: dayjs().format("HH:mm:ss"),
  };

  try {
    const usersCollection = db.collection("users");
    const validName = await usersCollection.findOne({ name: user });

    if (!validName) {
      res.sendStatus(404);
      return;
    }
    const messagesCollection = db.collection("messages");
    await messagesCollection.insertOne(messageObj);
    res.sendStatus(201);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});
app.post("/status", async (req, res) => {
  const { user } = req.headers;

  try {
    const usersCollection = db.collection("users");
    const validName = await usersCollection.findOne({ name: user });

    if (!validName) {
      res.sendStatus(404);
      return;
    }
    const userCollection = db.collection("users");
    await userCollection.updateOne(
      { name: user },
      {
        $set: { lastStatus: Date.now() },
      }
    );
    res.sendStatus(201);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

app.get("/participants", async (req, res) => {
  try {
    const usersCollection = db.collection("users");
    const participants = await usersCollection.find({}).toArray();

    res.send(participants);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});
app.get("/messages", async (req, res) => {
  const limit = parseInt(req.query.limit);
  const { user } = req.headers;
  try {
    if (!limit) {
      const participants = await db
        .collection("messages")
        .find({ $or: [{ from: user }, { to: user }, { to: "Todos" }] })
        .toArray();
      res.send(participants);
    } else {
      const participants = await db
        .collection("messages")
        .find({ $or: [{ from: user }, { to: user }, { to: "Todos" }] })
        .sort({ $natural: -1 })
        .limit(limit)
        .toArray();
      res.send(participants);
    }
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});
async function deleteOldUsers() {
  console.log("entrei");
  try {
    const userStatusCollection = db.collection("users");
    const userStatus = await userStatusCollection.find({}).toArray();
    console.log("userStatus: ", userStatus);
    if (userStatus) {
      for (let i = 0; i < userStatus.length; i++) {
        let date = Date.now();
        if (date - userStatus[i].lastStatus > 10000) {
          console.log("entrei no if");
          await userStatusCollection.deleteOne({ name: userStatus[i].name });
          const collectionMessages = db.collection("messages");
          const lastMessage = {
            from: userStatus[i].name,
            to: "Todos",
            text: "sai da sala...",
            type: "status",
            time: dayjs().format("HH:mm:ss"),
          };
          await collectionMessages.insertOne(lastMessage);
        }
      }
    }
  } catch (err) {
    console.error(err);
  }
}

setInterval(async () => {
  await deleteOldUsers();
}, 15000);

app.listen(process.env.ACCESS_PORT);

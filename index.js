const express = require("express");
const cors = require("cors");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

const corsConfig = {
  origin: "*",
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
};
app.use(cors(corsConfig));
app.options("", cors(corsConfig));
app.use(express.json());

//verify JWT token
const verifyToken = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ authorization: false, message: "Unauthorized access" });
  }

  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res
        .status(403)
        .send({ authorization: false, message: "Forbidded access" });
    }
    req.decoded = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.gnzth.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const run = async () => {
  try {
    //tools collection
    const toolsCollection = client.db("toolManufacturer").collection("tools");
    //users collection
    const userCollection = client.db("toolManufacturer").collection("users");
    //purchased collection
    const purchasedCollection = client
      .db("toolManufacturer")
      .collection("purchased");
    //review collection
    const reviewCollection = client.db("toolManufacturer").collection("review");

    //verify admin middleware
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const user = await userCollection.findOne({ email: email });
      if (user.role === "admin") {
        next();
      } else {
        res.status(403).send({ message: "forbidden" });
      }
    };

    app.get("/admin/:email", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      const isAdmin = user.role === "admin";
      res.send({ admin: isAdmin });
    });

    //login or signup and get jwt
    app.patch("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign(
        { email: email },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "1d" }
      );
      res.send({ result, token });
    });

    //get specific user
    app.get("/user", async (req, res) => {
      const query = req.query;
      const user = await userCollection.findOne(query);
      res.send(user);
    });
    //update specific profile data
    app.patch("/profile/:profileId", verifyToken, async (req, res) => {
      const id = req.params.profileId;
      const data = req.body;
      console.log(data);
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: data,
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });
    //update profile
    app.patch("/profiledata", async (req, res) => {
      const id = req.params.profileId;
      const data = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: data,
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    //stripe api
    app.post("/create-payment-intent", async (req, res) => {
      const product = req.body;
      const price = product.price;
      const amount = price * 100;
      if (!isNaN(amount)) {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });
        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      }
    });

    //get all tools
    app.get("/getTools", async (req, res) => {
      const query = {};
      const homeTools = await toolsCollection.find(query).toArray();
      const tools = homeTools.reverse();
      res.send(tools);
    });
    //get admin tools
    app.get("/adminGetTools", verifyToken, verifyAdmin, async (req, res) => {
      const query = {};
      const tools = await toolsCollection.find(query).toArray();
      res.send(tools);
    });

    //get specific tool by id
    app.get("/getTool/:toolId", async (req, res) => {
      const id = req.params.toolId;
      const query = { _id: new ObjectId(id) };
      const tool = await toolsCollection.findOne(query);
      res.send(tool);
    });
    //update tool fields
    app.patch(
      "/updateTool/:toolId",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.toolId;
        const data = req.body;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            availableQuantity: parseInt(data.availableQuantity),
            minimumOrderQuantity: parseInt(data.minimumOrderQuantity),
            price: parseInt(data.price),
          },
        };
        const result = await toolsCollection.updateOne(filter, updatedDoc);
        res.send(result);
      }
    );
    //add tool
    app.post("/addTool", verifyToken, verifyAdmin, async (req, res) => {
      const toolData = req.body;
      const result = await toolsCollection.insertOne(toolData);
      res.send(result);
    });
    //delete tool
    app.delete(
      "/deleteTool/:toolId",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.toolId;
        const query = { _id: new ObjectId(id) };
        const result = await toolsCollection.deleteOne(query);
        res.send(result);
      }
    );
    //update tool quantity
    app.patch("/getTool", verifyToken, verifyAdmin, async (req, res) => {
      const query = req.query;
      const quan = req.body.quantity;
      const tool = await toolsCollection.findOne(query);
      const newQuantity = parseInt(tool.availableQuantity) - parseInt(quan);
      const filter = query;
      const updatedDoc = {
        $set: {
          availableQuantity: newQuantity,
        },
      };
      const result = await toolsCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    //delete order by admin
    app.delete(
      "/deletOrder/:deleteId",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.deleteId;
        const query = { _id: new ObjectId(id) };
        const result = await purchasedCollection.deleteOne(query);
        res.send(result);
      }
    );

    //post data to purchased collection
    app.post("/purchased", verifyToken, async (req, res) => {
      const toolData = req.body;
      const result = await purchasedCollection.insertOne(toolData);
      res.send(result);
    });

    //get data from purchased collection
    app.get("/purchased", verifyToken, async (req, res) => {
      const query = req.query;
      const result = await purchasedCollection.find(query).toArray();
      res.send(result);
    });
    app.get("/adminPurchased", verifyToken, verifyAdmin, async (req, res) => {
      const query = req.query;
      const result = await purchasedCollection.find(query).toArray();
      res.send(result);
    });

    //get single purchased product
    app.get("/purchasedSingle/:productId", async (req, res) => {
      const id = req.params.productId;
      const query = { _id: new ObjectId(id) };
      const purchasedProduct = await purchasedCollection.findOne(query);
      res.send(purchasedProduct);
    });
    //patch transaction id to purchased product
    app.patch("/purchasedSingle/:productId", async (req, res) => {
      const id = req.params.productId;
      const transaction = req.body;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          status: "paid",
          transactionId: transaction.transactionId,
          delivery: transaction.delivery,
        },
      };
      const result = await purchasedCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });
    app.patch("/deliverConfirm/:deliverId", async (req, res) => {
      const id = req.params.deliverId;
      const data = req.body.delivery;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          delivery: data,
        },
      };
      const result = await purchasedCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    //delete purchased product
    app.delete("/purchasedSingle/:productId", verifyToken, async (req, res) => {
      const id = req.params.productId;
      const query = { _id: new ObjectId(id) };
      const result = await purchasedCollection.deleteOne(query);
      res.send(result);
    });

    //post data to review collection
    app.post("/review", verifyToken, async (req, res) => {
      const data = req.body;
      const result = await reviewCollection.insertOne(data);
      res.send(result);
    });

    //get all reviews
    app.get("/review", async (req, res) => {
      const query = {};
      const reviews = await reviewCollection.find(query).toArray();
      const reversedReviews = reviews.reverse();
      res.send(reversedReviews);
    });

    //get all users
    app.get("/allUsers", verifyToken, verifyAdmin, async (req, res) => {
      const query = {};
      const users = await userCollection.find(query).toArray();
      res.send(users);
    });
  } finally {
  }
};
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello from the server");
});

app.listen(port, () => {
  console.log(`app listening on port ${port}`);
});

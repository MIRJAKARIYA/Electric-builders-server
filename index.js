const express = require("express");
const cors = require("cors");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
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
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

const run = async () => {
  try {
    await client.connect();

    //tools collection
    const toolsCollection = client.db("toolManufacturer").collection("tools");
    //users collection
    const userCollection = client.db("toolManufacturer").collection("users");
    //purchased collection
    const purchasedCollection = client.db("toolManufacturer").collection("purchased");

    //login with JWT
    app.post("/getToken", async (req, res) => {
      const user = req.body.email;
      const payload = { email: user };
      const accessToken = jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1d",
      });
      res.send({ accessToken });
    });

    //stripe api
    app.post("/create-payment-intent", async (req, res) => {
      const product = req.body;
      const price = product.price;
      const amount = price * 100;
      console.log(amount);
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
    app.get('/getTools', async(req, res)=>{
      const query = {};
      const tools = await toolsCollection.find(query).toArray();
      res.send(tools);
    })

    //get specific tool by id
    app.get('/getTool/:toolId', async(req, res)=>{
      const id = req.params.toolId;
      const query = {_id:ObjectId(id)};
      const tool = await toolsCollection.findOne(query);
      res.send(tool)
    })

    //post data to purchased collection
    app.post('/purchased', async(req, res)=>{
      const toolData = req.body;
      const result = await purchasedCollection.insertOne(toolData);
      res.send(result)
    })

    //get data from purchased collection
    app.get('/purchased', async(req, res)=>{
      const query = req.query;
      console.log(query)
      const result = await purchasedCollection.find(query).toArray();
      console.log(result)
      res.send(result)
    })

    //get single purchased product
    app.get('/purchasedSingle/:productId', async(req, res)=>{
      const id = req.params.productId;
      const query = {_id:ObjectId(id)};
      const purchasedProduct = await purchasedCollection.findOne(query);
      res.send(purchasedProduct);
    })
    //patch transaction id to purchased product
    app.patch('/purchasedSingle/:productId', async(req, res)=>{
      const id = req.params.productId;
      const transaction = req.body;
      const filter = {_id:ObjectId(id)};
      const updatedDoc = {
        $set:{
          status: 'paid',
          transactionId:transaction.transactionId
        }
      }

      const result = await purchasedCollection.updateOne(filter, updatedDoc);
      res.send(result)
    })



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

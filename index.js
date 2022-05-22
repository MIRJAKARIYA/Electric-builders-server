const express = require("express");
const cors = require("cors");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { MongoClient, ServerApiVersion, ObjectId, Db } = require("mongodb");

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

const run = async () => {
  try {



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

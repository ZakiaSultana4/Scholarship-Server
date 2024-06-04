const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const morgan = require("morgan");
const { emit } = require("nodemon");
const port = process.env.PORT || 9000;
const stripe = require("stripe")(process.env.PAYMENT_METHOD);
const nodemailer = require("nodemailer");
// middleware
const corsOptions = {
  origin: ["https://scholary-90512.web.app/", "http://localhost:5173"],
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());
app.use(morgan("dev"));

// Send email
const sendEmail = (emailAddress, emailData) => {
  //Create a transporter
  const transporter = nodemailer.createTransport({
    service: "gmail",
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.MAIL,
      pass: process.env.PASS,
    },
  });

  //verify connection
  transporter.verify((error, success) => {
    if (error) {
      console.log(error);
    } else {
      console.log("Server is ready to take our emails", success);
    }
  });

  const mailBody = {
    from: process.env.MAIL,
    to: emailAddress,
    subject: emailData?.subject,
    html: `<p>${emailData?.message}</p>`,
  };

  transporter.sendMail(mailBody, (error, info) => {
    if (error) {
      console.log(error);
    } else {
      console.log("Email sent: " + info.response);
    }
  });
};

const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token;
  console.log(token);
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err);
      return res.status(401).send({ message: "unauthorized access" });
    }
    req.user = decoded;
    next();
  });
};
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.e0fsll4.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;


const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  await client.connect();

  const usersCollection = client.db("ScholarshipDb").collection("User");
  const reviewsCollection = client.db("ScholarshipDb").collection("reviews");
  const ScholarshipsCollection = client
    .db("ScholarshipDb")
    .collection("AllScholarship");
  const bookingsCollection = client
    .db("ScholarshipDb")
    .collection("bookingScholarship");
  // Role verification middlewares
  // For admins
  const verifyAdmin = async (req, res, next) => {
    const user = req.user;
    console.log("user from verify admin", user);
    const query = { email: user?.email };
    const result = await usersCollection.findOne(query);
    if (!result || result?.role !== "admin")
      return res.status(401).send({ message: "unauthorized access" });
    next();
  };

  // For hosts
  const verifyHost = async (req, res, next) => {
    const user = req.user;
    const query = { email: user?.email };
    const result = await usersCollection.findOne(query);
    if (!result || result?.role !== "host")
      return res.status(401).send({ message: "unauthorized access" });
    next();
  };
  try {
    // auth related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      console.log("I need a new jwt", user);
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "365d",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    // Logout
    app.get("/logout", async (req, res) => {
      try {
        res
          .clearCookie("token", {
            maxAge: 0,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
          })
          .send({ success: true });
        console.log("Logout successful");
      } catch (err) {
        res.status(500).send(err);
      }
    });

    // Save or modify user email, status in DB
    app.put("/users/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const query = { email: email };
      const options = { upsert: true };
      const isExist = await usersCollection.findOne(query);
      console.log("User found?----->", isExist);
      if (isExist) {
        if (user?.status === "Requested") {
          const result = await usersCollection.updateOne(
            query,
            {
              $set: user,
            },
            options
          );
          return res.send(result);
        } else {
          return res.send(isExist);
        }
      }
      const result = await usersCollection.updateOne(
        query,
        {
          $set: { ...user, timestamp: Date.now() },
        },
        options
      );
      res.send(result);
    });

    // Get user role
    app.get("/user/:email", async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.findOne({ email });
      res.send(result);
    });
    //     Get a all Scholarships
    app.get("/allScholarship", async (req, res) => {
      const result = await ScholarshipsCollection.find()
        .sort({ timestamp: -1, fee: -1 })
        .toArray();
      res.send(result);
    });
    // Get all jobs data from db for pagination
    app.get("/allScholarships", async (req, res) => {
      let query = {};
      let query2 = {};
      let query3 = {};
      let query4 = {};
      let query5 = {};
      const size = parseInt(req.query.size);
      const page = parseInt(req.query.page) - 1;
      const search = req.query.search;

      if (query) {
        query = { unName: { $regex: search, $options: "i" } };
      }
      if (query2) {
        query2 = { degree: { $regex: search, $options: "i" } };
      }
      if (query3) {
        query3 = { name: { $regex: search, $options: "i" } };
      }
      if (query4) {
        query4 = { scholarCategory: { $regex: search, $options: "i" } };
      }
      if (query5) {
        query5 = { subjectCategory: { $regex: search, $options: "i" } };
      }

      const result = await ScholarshipsCollection.find({
        $or: [query, query2, query3, query4, query5],
      })
        .skip(page * size)
        .limit(size)
        .toArray();

      res.send(result);
    });

    // Get all jobs data count from db
    app.get("/allScholarships-count", async (req, res) => {
      const search = req.query.search;
      let query2 = {};
      if (query2) {
        query2 = { degree: search };
      }
      let query = {
        unName: { $regex: search, $options: "i" },
      };

      const count = await ScholarshipsCollection.countDocuments(query, query2);

      res.send({ count });
    });

    // Get a Scholarships
    app.get("/scholar/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await ScholarshipsCollection.findOne(query);
      res.send(result);
    });
    app.get("/apply/:id", async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const query = { _id: new ObjectId(id) };
      const result = await ScholarshipsCollection.findOne(query);
      res.send(result);
    });

    // Save a room in database
    app.post("/scholarship", async (req, res) => {
      const Scholarship = req.body;
      const result = await bookingsCollection.insertOne(Scholarship);
      res.send(result);
    });

    // Save a Scholarships in database
    app.put("/scholarshipApply/:id", async (req, res) => {
      const scholarship = req.body;
      const id = req.params.id;
      const query = { _id: id };

      const result = await bookingsCollection.updateOne(query, {
        $set: scholarship,
      });
      res.send(result);
    });
    // Generate client secret for stripe payment
    app.post("/create-payment-intent", async (req, res) => {
      const { fee } = req.body;
      const amount = parseInt(fee * 100);
      if (!fee || amount < 1) return;
      const { client_secret } = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({ clientSecret: client_secret });
    });
    // moderator added
    // Save a room in database
    app.post("/moderator-add-scholarship", async (req, res) => {
      const Scholarship = req.body;
      const result = await ScholarshipsCollection.insertOne(Scholarship);
      res.send(result);
    });
    // Get a Scholarships
    app.get("/booking-scholarship/:email", async (req, res) => {
      const email = req.params.email;
      const query = {
        scholarAdderemail: email,
      };
      const result = await bookingsCollection.find(query).toArray();
      res.send(result);
    });
    // Get a Scholarships
    app.get("/moderator-added-scholarship/:email", async (req, res) => {
      const email = req.params.email;
      const query = {
        scholarAdderemail: email,
      };
      const result = await ScholarshipsCollection.find(query).toArray();
      res.send(result);
    });
    app.delete("/scholarship/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await ScholarshipsCollection.deleteOne(query);
      res.send(result);
    });
    // update a job in db
    app.put("/scholarship/:id", async (req, res) => {
      const id = req.params.id;
      const Data = req.body;
      const query = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          ...Data,
        },
      };
      const result = await ScholarshipsCollection.updateOne(
        query,
        updateDoc,
        options
      );
      res.send(result);
    });
    //  // Update  status
    app.patch("/scholar/:id", async (req, res) => {
      const id = req.params.id;
      const status = req.body;
      const query = { _id: id };
      const updateDoc = {
        $set: status,
      };
      const result = await bookingsCollection.updateOne(query, updateDoc);
      res.send(result);
    });
    app.delete("/scholar/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: id };
      const result = await bookingsCollection.deleteOne(query);
      res.send(result);
    });
    // Save a Scholarships in database
    app.put("/Feedback/:id", async (req, res) => {
      const Feedback = req.body;
      const id = req.params.id;
      const query = { _id: id };

      const result = await bookingsCollection.updateOne(query, {
        $set: Feedback,
      });
      res.send(result);
    });
    // ==============Student or applicant
    // Get a Scholarships
    app.get("/applicant-scholarship/:email", async (req, res) => {
      const email = req.params.email;
      const query = {
        scholarAdderemail: email,
      };
      const result = await bookingsCollection.find(query).toArray();
      res.send(result);
    });
    // Get a Scholarships
    app.get("/applicant-find-scholarship/:email", async (req, res) => {
      const email = req.params.email;
      const query = {
        Applicantemail: email,
      };
      const result = await bookingsCollection.find(query).toArray();
      res.send(result);
    });
    // Save a room in database
    app.post("/review", async (req, res) => {
      const review = req.body;
      const result = await reviewsCollection.insertOne(review);
      res.send(result);
    });
    // Get a Scholarships
    app.get("/review/:email", async (req, res) => {
      const email = req.params.email;
      const query = {
        reviewerEmail: email,
      };
      const result = await reviewsCollection.find(query).toArray();
      res.send(result);
    });
    app.delete("/review/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await reviewsCollection.deleteOne(query);
      res.send(result);
    });
    // Save a Scholarships in database
    app.put("/review/:id", async (req, res) => {
      const review = req.body;
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      const result = await reviewsCollection.updateOne(query, {
        $set: review,
      });
      res.send(result);
    });
    // Get a Scholarships
    app.get("/reviews", async (req, res) => {
      const id = req.query.id;

      const filter = {
        reviewId: id,
      };

      const result = await reviewsCollection.find(filter).toArray();
      res.send(result);
    });
    // ----------------------
    // Get a Scholarships
    app.get("/Edit/:id", async (req, res) => {
      const id = req.params.id;

      const query = {
        _id: id,
      };
      const result = await bookingsCollection.find(query).toArray();
      res.send(result);
    });
    // update a job in db
    app.put("/Edit/:id", async (req, res) => {
      const id = req.params.id;
      const Data = req.body;
      const query = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          ...Data,
        },
      };
      const result = await bookingsCollection.updateOne(
        query,
        updateDoc,
        options
      );
      res.send(result);
    });
    // ----------Admin--------------
    // Get all users for admin
    app.get("/users", verifyToken, async (req, res) => {
      const Filter = req.query.filter;
      let query = {};
      if (Filter) {
        query = {
          role: Filter,
        };
      }
      const result = await usersCollection
        .find(query)
        .sort({ timestamp: -1 })
        .toArray();
      res.send(result);
    });
    // Update user role for admin
    app.put("/users/update/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const query = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          ...user,
          timestamp: Date.now(),
        },
      };
      const result = await usersCollection.updateOne(query, updateDoc, options);
      res.send(result);
    });
    // Get a Scholarships
    app.get("/admin-scholarship", async (req, res) => {
      const result = await ScholarshipsCollection.find().toArray();
      res.send(result);
    });
    // Get a single Scholarship
    app.get("/admin-applied-scholarship", async (req, res) => {
      const sort = req.query.sort;
      let options = {}
      if (sort === 'asc') {
        options = { sort: { deadline: 1 } }
      }
      if (sort === 'dsc') {
       options = { sort: { deadline: -1 } }
      }
     
      const result = await bookingsCollection.find(options).toArray();
      res.send(result);
    });
        // Get all sc data from db for pagination
        app.get('/ad-ap-scholar', async (req, res) => {
          const size = parseInt(req.query.size)
          const page = parseInt(req.query.page) - 1
          const filter = req.query.filter
          const sort = req.query.sort
          const sort2 = req.query.sort2
          const search = req.query.search
    
          let query = {
            name: { $regex: search, $options: 'i' },
          }
          if (filter) query.category = filter
          let options = {}
    
          if (sort) options = { sort: { deadline: sort === 'asc' ? 1 : -1 } }
          // if (sort2) options = { sort2: { appliedData: sort2 === 'asc2' ? 1 : -1 } }
          const result = await bookingsCollection
            .find(query, options)
            .skip(page * size)
            .limit(size)
            .toArray()
    
          res.send(result)
        })
    
        // Get all sc data count from db
        app.get('/jobs-count', async (req, res) => {
          const filter = req.query.filter
          const search = req.query.search
          let query = {
            job_title: { $regex: search, $options: 'i' },
          }
          if (filter) query.category = filter
          const count = await bookingsCollection.countDocuments(query)
    
          res.send({ count })
        })
    
    // Get a Scholarships
    app.get("/review", async (req, res) => {
      const result = await reviewsCollection.find().toArray();
      res.send(result);
    });
    app.delete("/user/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });
    // Admin Stat Data in 
    app.get("/admin-stat", verifyToken, async (req, res) => {
      const bookingsDetails = await bookingsCollection
        .find({}, { projection: { date: 1, fee: 1 } })
        .toArray();
      const userCount = await usersCollection.countDocuments();
      const roomCount = await ScholarshipsCollection.countDocuments();
      const totalSale = bookingsDetails.reduce(
        (sum, data) => sum + data.fee,
        0
      );
      const chartData = bookingsDetails.map((data) => {
        const day = new Date(data.date).getDate();
        const month = new Date(data.date).getMonth() + 1;
        return [day + "/" + month, data.price];
      });
      chartData.unshift(["Day", "Sale"]);
      res.send({
        totalSale,
        bookingCount: bookingsDetails.length,
        userCount,
        roomCount,
        chartData,
      });
    });
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello from StayVista Server..");
});

app.listen(port, () => {
  console.log(`StayVista is running on port ${port}`);
});

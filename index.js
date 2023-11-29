const express = require('express')
const cors = require('cors');
const app = express();
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);


// >>>>>>>>>>>>>>>middlewares<<<<<<<<<<<<<<<<
app.use(cors());
app.use(express.json());
app.use(cookieParser());

const verifyToken = (req, res, next) => {
    try {
        const token = req?.headers?.token;
        console.log('from headers', token)
        if (!token) {
            return res?.status(401)?.send({ message: 'forbidden access' })
        }
        jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
            if (err) {
                return res.status(401).send({ message: 'forbidden access' })
            }
            else {
                req.decoded = decoded;
                next();
            }
        });
    } catch (error) {
        console.log(error)
    }
}
// >>>>>>>>>>>>>>>middlewares<<<<<<<<<<<<<<<<

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>DB ACTIVITIES<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.mf3nl9y.mongodb.net/?retryWrites=true&w=majority`;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        // >>>>>>collections<<<<<<<<<<
        const database = client.db("contestDB");
        const userCollection = database.collection("users");
        const contestCollection = database.collection("contests");
        const paymentCollection = database.collection("payments");
        // >>>>>>collections<<<<<<<<<<

        // role checker
        app.get('/userRole/:email', verifyToken, async (req, res) => {
            try {
                const email = req?.params?.email;
                const filter = { email: email };
                const user = await userCollection.find(filter).toArray();
                const role = user[0]?.role;
                res.send({ role });
                // console.log(email, role)
            } catch (error) {
                console.log(error)
            }
        })

        const verifyCreator = async (req, res, next) => {
            try {
                const email = req?.decoded?.email;
                const filter = { email: email }
                const user = await userCollection.findOne(filter);
                console.log({ decodedEmail: email, role: user?.role, userEmail: user?.email })
                // console.log(user, 'from verifyCreator');
                if (user?.role !== 'creator') {
                    return res.status(403).send({ message: 'unauthorized access' })
                }
                next();
            } catch (error) {
                console.log(error)
            }
        }

        const verifyAdmin = async (req, res, next) => {
            try {
                const email = req?.decoded?.email;
                const filter = { email: email }
                const user = await userCollection.findOne(filter)
                console.log({ decodedEmail: email, role: user?.role, userEmail: user?.email })
                if (user?.role !== 'admin') {
                    return res.status(403).send({ message: 'unauthorized access' })
                }
                next();
            } catch (error) {
                console.log(error)
            }
        }
        // role checker

        //  >>>>>>>>>>>>>>>>>>>>>>JWT related api<<<<<<<<<<<<<<
        app.post('/jwt', async (req, res) => {
            try {
                const user = req.body;
                const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '24h' });
                res.send({ token })
            } catch (error) {
                console.log(error)
            }
        })
        //  >>>>>>>>>>>>>>>>>>>>>>JWT related api<<<<<<<<<<<<<<


        //  >>>>>>>>>>>>>>>>>>>>>>users related api<<<<<<<<<<<<<<
        app.post('/users', async (req, res) => {
            try {
                const userInfo = req?.body;
                const email = userInfo?.email;

                const filter = { email: email };
                const isExist = await userCollection.findOne(filter)

                if (isExist) {
                    return res.send({ message: 'user is already exist', insertedId: null })
                }

                const result = await userCollection.insertOne(userInfo);
                res.send(result);
            } catch (error) {
                console.log(error)
            }
        })

        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            try {
                const result = await userCollection.find().toArray();
                res.send(result);
            } catch (error) {
                console.log(error)
            }
        })

        app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
            try {
                const id = req?.params?.id;
                const filter = { _id: new ObjectId(id) };
                const result = await userCollection.deleteOne(filter);
                res.send(result);
            } catch (error) {
                console.log(error)
            }
        })

        app.put('/toggleRole/:id', verifyToken, verifyAdmin, async (req, res) => {
            try {
                const id = req?.params?.id;
                const newRole = req?.body;
                const filter = { _id: new ObjectId(id) };
                const updateDoc = {
                    $set: {
                        role: newRole?.newRole
                    },
                };
                const result = await userCollection.updateOne(filter, updateDoc)
                res.send(result);
            } catch (error) {
                console.log(error)
            }
        })
        //  >>>>>>>>>>>>>>>>>>>>>>users related api<<<<<<<<<<<<<<

        // contests related apis
        app.post('/contests', verifyToken, verifyCreator, async (req, res) => {
            try {
                const contestData = req?.body;
                const result = await contestCollection.insertOne(contestData);
                res.send(result);
            } catch (error) {
                console.log(error)
            }
        })

        app.get('/specificContests/:email', verifyToken, verifyCreator, async (req, res) => {
            try {
                const email = req?.params?.email;
                const filter = { creatorEmail: email };
                const result = await contestCollection.find(filter).toArray();
                res.send(result);
            } catch (error) {
                console.log(error)
            }
        })

        app.delete('/contests/:id', verifyToken, verifyCreator, async (req, res) => {
            try {
                const id = req?.params?.id;
                const contest = await contestCollection.findOne({ _id: new ObjectId(id) });

                if (contest?.status === 'approved') {
                    return res.send({ message: 'Already approved by admin', deleteCound: 0 })
                }

                const filter = { _id: new ObjectId(id) };
                const result = await contestCollection.deleteOne(filter);
                res.send(result);
            } catch (error) {
                console.log(error)
            }
        })

        app.delete('/contestsAdmin/:id', verifyToken, verifyAdmin, async (req, res) => {
            try {
                const id = req?.params?.id;
                const filter = { _id: new ObjectId(id) };
                const result = await contestCollection.deleteOne(filter);
                res.send(result);
            } catch (error) {
                console.log(error)
            }
        })

        app.get('/contests', async (req, res) => {
            try {
                const result = await contestCollection.find().toArray();
                res.send(result);
            } catch (error) {
                console.log(error)
            }
        })

        app.get('/contests/:id', async (req, res) => {
            try {
                const id = req?.params?.id;
                const filter = { _id: new ObjectId(id) };
                const result = await contestCollection.findOne(filter);
                res.send(result);
            } catch (error) {
                console.log(error)
            }
        })

        // update
        app.get('/singleContest/:id', verifyToken, async (req, res) => {
            try {
                const id = req?.params?.id;
                const filter = { _id: new ObjectId(id) };
                const result = await contestCollection.findOne(filter);
                res.send(result);
            } catch (error) {
                console.log(error)
            }
        })

        app.put('/contests/:id', verifyToken, verifyCreator, async (req, res) => {
            try {
                const id = req?.params?.id;
                const filter = { _id: new ObjectId(id) };
                const updateIt = req?.body;

                const contest = await contestCollection.findOne(filter);
                if (contest?.status === 'approved') {
                    return res.send({ message: 'Already approved by admin', modifiedCount: 0 })
                }

                const updateDoc = {
                    $set: {
                        ...updateIt
                    },
                };
                const result = await contestCollection.updateOne(filter, updateDoc)
                res.send(result);
            } catch (error) {
                console.log(error)
            }
        })

        app.put('/contestsAdmin/:id', verifyToken, verifyAdmin, async (req, res) => {
            try {
                const id = req?.params?.id;
                const newStatus = req?.body;

                const filter = { _id: new ObjectId(id) };
                const updateDoc = {
                    $set: {
                        status: newStatus?.newStatus
                    },
                };
                const result = await contestCollection.updateOne(filter, updateDoc);
                res.send(result);
            } catch (error) {
                console.log(error)
            }
        })
        // contests related apis

        // >>>>>>>>>>>user participation and win api's<<<<<<<<<<<<<<<<<<
        app.get('/specificParticipants/:email', verifyToken, async (req, res) => {
            try {
                const email = req?.params?.email;
                const filter = { email: email };
                const participations = await paymentCollection.find(filter).toArray();
                const contestIds = participations?.map(id => new ObjectId(id?.contestId));

                const query = {
                    _id: {
                        $in: contestIds
                    }
                }

                const result = await contestCollection.find(query).toArray();

                res.send(result)
            } catch (error) {
                console.log(error)
            }
        })

        app.get('/userWinnings/:email', verifyToken, async (req, res) => {
            try {
                const email = req?.params?.email;
                const filter = { email: email };
                const participations = await paymentCollection.find(filter).toArray();
                const winContests = participations.filter(contest => contest?.isWin === true);
                const contestIds = winContests?.map(id => new ObjectId(id?.contestId));

                const query = {
                    _id: {
                        $in: contestIds
                    }
                }
                const result = await contestCollection.find(query).toArray();

                res.send(result)
            } catch (error) {
                console.log(error)
            }
        })

        app.get('/contestParticipants/:id', async (req, res) => {
            try {
                const id = req?.params?.id;
                const filter = { contestId: id };
                const contestParticipants = await paymentCollection.find(filter).toArray();

                res.send(contestParticipants)
            } catch (error) {
                console.log(error)
            }
        })

        app.get('/setWinner/:id', verifyToken, async (req, res) => {
            try {
                const contestId = req?.params?.id;
                const filter = { contestId: contestId };
                const contestParticipants = await paymentCollection.find(filter).toArray();
                const isAlreadyWin = contestParticipants.filter(participant => participant?.isWin === true)
                if (isAlreadyWin?.length > 0) {
                    return res.send({ message: 'Winner already declered!' })
                }

                const updateDoc = {
                    $set: {
                        isWin: true
                    },
                };

                const randomNumber = Math.floor(Math.random() * contestParticipants?.length);
                const winner = contestParticipants[randomNumber];
                const result = await paymentCollection.updateOne({ _id: new ObjectId(winner?._id) }, updateDoc)
                res.send(result)
            } catch (error) {
                console.log(error)
            }
        })

        app.get('/getWinner/:id', async (req, res) => {
            try {
                const contestId = req?.params?.id;
                const filter = { contestId: contestId };
                const contestParticipants = await paymentCollection.find(filter).toArray();
                const winner = await contestParticipants.filter(participant => participant?.isWin === true);
                // console.log('the winner', winner)
                res.send(winner);
            } catch (error) {
                console.log(error)
            }
        })

        app.put('/setWinnerByCreator/:id', verifyToken, verifyCreator, async (req, res) => {
            try {
                const contestId = req?.params?.id;
                const filter = { contestId: contestId };
                const contestParticipants = await paymentCollection.find(filter).toArray();
                const isAlreadyWin = contestParticipants.filter(participant => participant?.isWin === true)
                if (isAlreadyWin?.length > 0) {
                    return res.send({ message: 'Winner already declered!' })
                }

                const id = req?.body?.id;
                const query = { _id: new ObjectId(id) };
                const updateDoc = {
                    $set: {
                        isWin: true
                    },
                };
                const result = await paymentCollection.updateOne(query, updateDoc)
                res.send(result)
            } catch (error) {
                console.log(error)
            }
        })
        // >>>>>>>>>>>user participation and win api's<<<<<<<<<<<<<<<<<<

        // >>>>>>>>>>>>>>>>PAYMENT INTENT<<<<<<<<<<<<<<<<<<
        app.post("/create-payment-intent", async (req, res) => {
            try {
                const { price } = req?.body;
                const amount = parseInt(price * 100);

                const paymentIntent = await stripe.paymentIntents.create({

                    amount: amount,

                    // don't forget to add it
                    payment_method_types: ["card"],

                    currency: "usd",
                });

                res.send({
                    clientSecret: paymentIntent.client_secret,
                });

            } catch (error) {
                console.log(error)
            }
        })

        // >>>>>>>>>>>>payment related api's<<<<<<<<<<<<<<<
        app.post('/payments', verifyToken, async (req, res) => {
            try {
                const paymentInfo = req?.body;
                const result = await paymentCollection.insertOne(paymentInfo);

                // update participant count
                const id = paymentInfo.contestId;
                const filter = { _id: new ObjectId(id) };
                const contest = await contestCollection.findOne(filter);
                const previousCount = contest?.participateCount;

                const updateDoc = {
                    $set: {
                        participateCount: previousCount + 1
                    },
                };
                const update = await contestCollection.updateOne(filter, updateDoc)

                res.send(result)
            } catch (error) {
                console.log(error)
            }
        })
        // >>>>>>>>>>>>payment related api's<<<<<<<<<<<<<<<

        // >>>>>>>>>>>>>>top contests<<<<<<<<<<<<<<<<<<<
        app.get('/populerContest', async (req, res) => {
            try {
                const searchText = req?.query?.searchText;
                const options = {
                    sort: { participateCount: -1 },
                };

                if (searchText) {
                    const query = {
                        $or: [
                            { contestType: { $regex: searchText, $options: 'i' } },
                        ]
                    };
                    const result = await contestCollection.find(query, options).limit(5).toArray() || [];
                    return res.send(result);
                }

                const cursor = contestCollection.find({}, options).limit(5);
                const result = await cursor.toArray();
                res.send(result);
            } catch (error) {
                console.log(error);
            }
        });

        app.get('/populerCreators', async (req, res) => {
            try {
                const options = {
                    sort: { participateCount: -1 },
                };
                const cursor = contestCollection.find({}, options).limit(10);
                const result = await cursor.toArray();
                res.send(result);
            } catch (error) {
                console.log(error)
            }
        })

        app.get('/getAllWinner', async (req, res) => {
            try {
                const filter = { isWin: true }
                const result = await paymentCollection.find(filter).toArray();
                res?.send(result);
            } catch (error) {
                console.log(error)
            }
        })

        app.get('/leaderboard', async (req, res) => {
            try {
                const pipeline = [
                    {
                        $match: { isWin: true }
                    },
                    {
                        $group: {
                            _id: '$email',
                            totalWins: { $sum: 1 },
                            totalPrizeMoney: { $sum: '$prizeMoney' },
                            img: { $first: '$img' },
                            prizeMoney: { $first: '$prizeMoney' },
                            name: { $first: '$name' }
                        }
                    },
                    {
                        $project: {
                            _id: 0,
                            email: '$_id',
                            totalWins: 1,
                            totalPrizeMoney: 1,
                            img: 1,
                            prizeMoney: 1,
                            name: 1
                        }
                    },
                    {
                        $sort: { totalWins: -1 }
                    }
                ];

                const result = await paymentCollection.aggregate(pipeline).toArray();
                res.send(result);
            } catch (error) {
                console.log(error);
                res.status(500).send('Internal Server Error');
            }
        });
        // >>>>>>>>>>>>>>top contests<<<<<<<<<<<<<<<<<<<



        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error

    }
}
run().catch(console.dir);
// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>DB ACTIVITIES<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<



app.get('/', (req, res) => {
    res.send('Contest hub server is running!')
})

app.listen(port, () => {
    console.log(`Contest hub app listening on port ${port}`)
})
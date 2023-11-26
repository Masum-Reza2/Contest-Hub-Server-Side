const express = require('express')
const cors = require('cors');
const app = express();
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000;


// >>>>>>>>>>>>>>>middlewares<<<<<<<<<<<<<<<<
app.use(cors());
app.use(express.json());
app.use(cookieParser());

const verifyToken = (req, res, next) => {
    try {
        const token = req?.headers?.token;
        // console.log(token)
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
                const user = await userCollection.findOne(filter)
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
                // console.log(user, 'from verifyadmin');
                if (user?.role !== 'admin') {
                    return res.status(403).send({ message: 'unauthorized access' })
                }
                next();
            } catch (error) {
                console.log(error)
            }
        }
        // role checker

        //  >>>>>>>>>>>>>>>>>>>>>>users related api<<<<<<<<<<<<<<
        app.post('/jwt', async (req, res) => {
            try {
                const user = req.body;
                const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '24h' });
                res.send({ token })
            } catch (error) {
                console.log(error)
            }
        })
        //  >>>>>>>>>>>>>>>>>>>>>>users related api<<<<<<<<<<<<<<


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
                console.log(contest)
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
        // contests related apis



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
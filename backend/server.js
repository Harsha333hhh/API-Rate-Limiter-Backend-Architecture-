// SERVER - Entry point. Sets up express, connects to MongoDB, mounts routes.
import dotenv from 'dotenv'
import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import { connect } from 'mongoose'
import { userRoute } from './APIs/UsersApi.js'
import { messageRoute } from './APIs/MessagesApi.js'

dotenv.config()

// create http server
const app = express()
const port = process.env.PORT || 4000
const mongodbUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/messagingdb'
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
const allowedOrigins = frontendUrl
  .split(',')
  .map((url) => url.trim())
  .concat(['http://localhost:5173', 'http://localhost:5174'])

// trust the first proxy so req.ip gives the real client IP (needed for IP-based rate limiting)
app.set('trust proxy', 1)

// middlewares
app.use(cors({ origin: allowedOrigins, credentials: true }))
app.use(express.json()) // body parser
app.use(cookieParser())

// forward req to specific APIs
app.use('/user-api', userRoute)
app.use('/message-api', messageRoute)

// dealing with invalid path
app.use((req, res, next) => {
  console.log(req.url) // log the path of the invalid request
  res.status(404).json({ message: `${req.url} is invalid` })
})

// error handling middleware
app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ message: 'error', reason: err.message })
})

// connect to MongoDB then start the server
async function connectDB() {
  try {
    await connect(mongodbUri)
    console.log('Connected to DB')
    app.listen(port, () => console.log(`server listening to port ${port}...`))
  } catch (err) {
    console.error('DB connection error:', err.message)
    process.exit(1)
  }
}

connectDB()

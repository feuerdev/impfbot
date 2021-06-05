import ImpfBot from "./ImpfBot"
import express from "express"

import dotenv from "dotenv"
dotenv.config()


const bot = new ImpfBot(Number(process.env.INTERVAL))
const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

bot.run()
app.listen(3000)
 
app.post("/api/subscribe", function(req, res) {
	const fcmToken:string = req.body.fcmToken
	const age:number = req.body.age
	const zip:string = req.body.zip

	bot.addSubscription(fcmToken, age, zip)

	res.sendStatus(200)
})
 
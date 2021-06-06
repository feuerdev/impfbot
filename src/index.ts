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
 
app.post("/api/subscribe", async function(req, res) {
	const fcmToken:string = req.body.fcmToken
	const ageOver60:boolean = req.body.ageOver60
	const zip:string = req.body.zip

	const succeeded = await bot.addSubscription(fcmToken, ageOver60, zip)

	if(succeeded) {
		res.sendStatus(200)
	} else {
		res.sendStatus(400)
	}

})

app.post("/api/unsubscribe", async function(req, res) {
	const fcmToken:string = req.body.fcmToken

	const succeeded = await bot.removeSubscription(fcmToken)

	if(succeeded) {
		res.sendStatus(200)
	} else {
		res.sendStatus(400)
	}

})
 
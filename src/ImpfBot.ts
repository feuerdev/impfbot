/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable indent */
import axios from "axios"
import admin, { ServiceAccount } from "firebase-admin"
import serviceAccount from "./firebase-service-account.json"
import ImpfCenter from "./ImpfCenter"
import ImpfRequest from "./ImpfRequest"
import ImpfResponse from "./ImpfResponse"
import ImpfUser from "./ImpfUser"

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount as ServiceAccount)
})
const db = admin.firestore()


//const AGE_OVER_60 = -284000400
const AGE_UNDER_60 = -252464400

export default class ImpfBot {

  users: ImpfUser[] = []
  requests: ImpfRequest[] = []
  interval = 5000

  async run(): Promise<void> {

    //Manually load all Centers
    const zips = [26160,26624,38102,29221,49681,27472,27749,27211,26721,49808,26419,38518,38642,37081,37412,48529,31787,30521,21423,29683,38350,31137,37603,26835,21337,31623,37154,26123,27793,49080,49134,27711,31224,27404,38229,31655,21684,29525,49393,27283,26919,26389,26427,38300,38440]
    zips.forEach(zip => {
      const center = new ImpfCenter(String(zip))
      const request = new ImpfRequest(center)
      this.requests.push(request)
    })
    
    const savedSubscriptions = await db.collection("subscriptions").get()
    savedSubscriptions.forEach((doc) => {
      const data = doc.data()
      const user = new ImpfUser(data.fcmToken, data.zip, data.centerId, data.minAppointments, data.notifyForAllCenters, data.allowedVaccines)
      console.log("Loaded user: "+user.fcmToken)
      this.users.push(user)
    })

    setInterval(() => {
      console.log(new Date().toString() + " - Checking for appointments")
      for (const request of this.requests) {
        // if(request.center.zip == "30521") {
        //   console.log("Faking Check")
        //   const response = new ImpfResponse(
        //     "915745288482899",
        //     "Fake 1",
        //     "30521",
        //     "Johnson&Johnson",
        //     "vector",
        //     false,
        //     50)
        //   this.handleResponse(request, response)
        // } else if(request.center.zip == "26160") {
        //   console.log("Faking Check")
        //   const response = new ImpfResponse(
        //     "123",
        //     "Fake 2",
        //     "26160",
        //     "Moderna",
        //     "mRNA",
        //     false,
        //     1)
        //   this.handleResponse(request, response)
        // } else {
          // console.log(`Checking center at ${request.center.zip}`)
          this.checkTermin(request.center.zip).then((response) => {
            this.handleResponse(request, response)
          })
        // }
      }
    }, this.interval)
  }

  handleResponse(request:ImpfRequest, response: ImpfResponse | undefined): void {
    if (!response) {
      return
    }

    if(!response.outOfStock) {
      if(!request.lastCheckHadAppointments) {
        request.startOfCurrentAppointmentWindow = new Date()
      }

      console.log(`${response.vaccinationCenterZip} - ${response.vaccinationCenterName} hat ${response.numberOfAppointments} Termine`)

      //Find fitting users which signed up since this request had appointments
      const users = this.users.filter(user => {
        return (
          (String(user.notifyForAllCenters) === "true" || (String(user.centerId) === String(response.vaccinationCenterPk))) &&
          String(user.allowedVaccines[response.vaccineName]) === "true" &&
          response.numberOfAppointments >= user.minAppointments &&
          (!request.lastCheckHadAppointments || (request.startOfCurrentAppointmentWindow!.getTime() < user.registrationDate.getTime()))
        )
      })

      users.forEach(user => {
        user.registrationDate = request.startOfCurrentAppointmentWindow!
      })
      
      const tokens = users.map(user => {
        return user.fcmToken
      })
      
      this.notifyUsers(tokens, response)
      request.lastCheckHadAppointments = true
    } else {
      request.lastCheckHadAppointments = false
      request.startOfCurrentAppointmentWindow = undefined
    }
  }

  notifyUsers(tokens:string[], response:ImpfResponse):void {
    if(!tokens || tokens.length === 0) {
      return
    }
    tokens.map(token=> {
      console.log("Notifying token: "+token)
    })
    const message = {
      notification: {
        title: "Impftermin verfügbar",
        body: `${response.numberOfAppointments} ${response.numberOfAppointments <= 1 ? "freier Termin" : "freie Termine"}\n${response.vaccinationCenterName} - ${response.vaccinationCenterZip}\n${response.vaccineName}`,
      },
      apns: {
        payload: {
          headers: {
            "apns-collapse-id": response.vaccinationCenterPk
          },
          aps: {
            sound: "default"
          },
        },
      },
      tokens: tokens,
    }

    admin.messaging().sendMulticast(message)
      .then((response) => {
        console.log(response.successCount + " messages were sent successfully")
      })
  }

  /// Remove users --------------------------- 
  async removeSubscription(fcmToken: string): Promise<boolean> {
    this.removeUser(fcmToken)
    return true
  }

  /// Adding users --------------------------- 
  async addSubscription(fcmToken: string, zip: string, minAppointments: number, notifyForAllCenters:boolean, allowBiontech: boolean, allowModerna: boolean,	allowJohnson: boolean,	allowAstra: boolean): Promise<boolean> {
    await this.removeSubscription(fcmToken)
    const response = await this.checkTermin(zip)

    if (!response) {
      return false
    }
    const allowedVaccines:Record<string, boolean> = {}
    allowedVaccines["BioNtech"] = allowBiontech
    allowedVaccines["Moderna"] = allowModerna
    allowedVaccines["Johnson&Johnson"] = allowJohnson
    allowedVaccines["AstraZeneca"] = allowAstra

    const user = new ImpfUser(fcmToken, zip, response.vaccinationCenterPk, minAppointments, notifyForAllCenters, allowedVaccines)
    const center = new ImpfCenter(response.vaccinationCenterZip)
    const request = new ImpfRequest(center)

    this.addUser(user)
    this.addRequest(request)

    console.log(`Added 1 subscription for ${user.zip} - ${fcmToken}`)
    console.log(`Total subscriptions: ${this.users.length}`)
    return true
  }

  addUser(user: ImpfUser): void {
    this.users.push(user)
    db.collection("subscriptions").doc(user.fcmToken).set(JSON.parse(JSON.stringify(user)))
  }

  addRequest(request: ImpfRequest): void {
    const alreadyAdded = this.requests.find(r => {
      return r.center.zip === request.center.zip
    })
    if (!alreadyAdded) {
      this.requests.push(request)
      db.collection("requests").doc("id" + (new Date()).getTime()).set(JSON.parse(JSON.stringify(request)))
    }
  }

  removeUser(fcmToken: string): void {
    const oldLength = this.users.length
    this.users = this.users.filter((user) => {
      if (user.fcmToken === fcmToken) {
        return false
      } else {
        return true
      }
    })
    const newLength = this.users.length
    console.log(`Removed ${oldLength - newLength} subscription - ${fcmToken}`)
    console.log(`Total subscriptions: ${this.users.length}`)
    db.collection("subscriptions").doc(fcmToken).delete()
  }

  ///Main Request
  async checkTermin(zip: string): Promise<ImpfResponse | undefined> {
    const url = `https://www.impfportal-niedersachsen.de/portal/rest/appointments/findVaccinationCenterListFree/${zip}?stiko=&count=1&birthdate=${AGE_UNDER_60}`
    const response = await axios.get(url).catch(error => {
      console.log(`Request ${zip} failed: ${error.toString()}`)
    })

    //Deal with errors
    if (response == null) {
      return
    }
    if (response.data == null) {
      return
    }

    if (response.data.succeeded == false) {
      return
    }

    if (response.data.resultList == null) {
      return
    }

    const results = response.data.resultList

    if (results.length === 0) {
      return
    }

    if (results.length > 1) {
      console.log(`Found more than one result for PLZ:${zip}`)
    }

    for (const result of results) {
      return new ImpfResponse(
        result.vaccinationCenterPk,
        result.name,
        result.zipcode,
        result.vaccineName,
        result.vaccineType,
        Boolean(result.outOfStock),
        Number(result.freeSlotSizeOnline))
    }
    return
  }
}
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

const AGE_OVER_60 = -284000400
const AGE_UNDER_60 = -252464400

export default class ImpfBot {

  users: ImpfUser[] = []
  requests: ImpfRequest[] = []
  interval = 1000

  run(): void {
    //TODO: Load users and centers from firestore

    setInterval(() => {
      for (const request of this.requests) {
        // if(request.center.zip == "30521") {
        //   console.log("Faking Check")
        //   const response = new ImpfResponse(
        //     "889791349656378",
        //     "Impfzentrum Hannover 4",
        //     "30521",
        //     "Johnson&Johnson",
        //     "vector",
        //     false,
        //     50)
        //   this.handleResponse(request, response)
        // } else {
          console.log(`Checking center at ${request.center.zip}`)
          this.checkTermin(request.over60, request.center.zip).then((response) => {
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

      //Find fitting users which signed up since this request had appointments
      const users = this.users.filter(user => {
        return (
          String(user.centerId) === String(response.vaccinationCenterPk) &&
          user.ageOver60 === request.over60 &&
          Boolean(user.allowedVaccines[response.vaccineName]) === true &&
          response.numberOfAppointments > user.minAppointments &&
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
        body: `${response.numberOfAppointments} freie Termine\n${response.vaccinationCenterName} - ${response.vaccinationCenterZip}\n${response.vaccineName}`,
      },
      apns: {
        payload: {
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
  async addSubscription(fcmToken: string, ageOver60: boolean, zip: string, minAppointments: number, allowBiontech: boolean, allowModerna: boolean,	allowJohnson: boolean,	allowAstra: boolean): Promise<boolean> {

    const response = await this.checkTermin(ageOver60, zip)

    if (!response) {
      return false
    }
    const allowedVaccines:Record<string, boolean> = {}
    allowedVaccines["BioNtech"] = allowBiontech
    allowedVaccines["Moderna"] = allowModerna
    allowedVaccines["Johnson&Johnson"] = allowJohnson
    allowedVaccines["AstraZeneca"] = allowAstra

    const user = new ImpfUser(fcmToken, ageOver60, zip, response.vaccinationCenterPk, minAppointments, allowedVaccines)
    const center = new ImpfCenter(response.vaccinationCenterPk, response.vaccinationCenterZip)
    const request = new ImpfRequest(center, ageOver60)

    this.addUser(user)
    this.addRequest(request)
    return true
  }

  addUser(user: ImpfUser): void {
    this.removeUser(user.fcmToken)
    //TODO: remove user from firestore

    this.users.push(user)
    //TODO: add user to firestore
  }

  addRequest(request: ImpfRequest): void {
    const alreadyAdded = this.requests.find(r => {
      return (
        r.center.zip === request.center.zip &&
        r.over60 == request.over60
        )
    })
    if (!alreadyAdded) {
      this.requests.push(request)
      //TODO: add request to firestore
    }
  }

  removeUser(fcmToken: string): void {
    this.users = this.users.filter((user) => {
      if (user.fcmToken === fcmToken) {
        return false
      } else {
        return true
      }
    })
  }

  ///Main Request
  async checkTermin(ageOver60: boolean, zip: string): Promise<ImpfResponse | undefined> {
    const wsAge = ageOver60 ? AGE_OVER_60 : AGE_UNDER_60
    const url = `https://www.impfportal-niedersachsen.de/portal/rest/appointments/findVaccinationCenterListFree/${zip}?stiko=&count=1&birthdate=${wsAge}`
    const response = await axios.get(url).catch(error => {
      console.log(error)
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
      console.log(`Found more than one result for PLZ:${zip} and age over 60:${ageOver60}`)
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
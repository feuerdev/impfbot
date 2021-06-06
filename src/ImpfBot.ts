/* eslint-disable indent */
import axios from "axios"
import admin, { ServiceAccount } from "firebase-admin"
import serviceAccount from "./firebase-service-account.json"
import ImpfCenter from "./ImpfCenter"
import ImpfResponse from "./ImpfResponse"
import ImpfUser from "./ImpfUser"

admin.initializeApp({
	credential: admin.credential.cert(serviceAccount as ServiceAccount)
})

const AGE_OVER_60 = -284000400
const AGE_UNDER_60 = -252464400

export default class ImpfBot {

  users: ImpfUser[] = []
  centers: ImpfCenter[] = []
  interval: number

  constructor(interval: number) {
    this.interval = interval
  }

  run(): void {
    //TODO: Load users and centers from firestore

    setInterval(() => {
      for (const center of this.centers) {
        console.log(`Checking center at ${center.zip}`)
        this.checkTermin(AGE_OVER_60, center.zip).then((response) => {
          this.handleResponse(response, true)
        })
        this.checkTermin(AGE_UNDER_60, center.zip).then((response) => {
          this.handleResponse(response, false)
        })
      }
    }, this.interval)
  }

  handleResponse(response:ImpfResponse|undefined, over60:boolean):void {
    if(!response) {
      return
    }

    if(!response.outOfStock) {
      const tokens = this.users.filter((user) => {
        return (
          user.centerId == response.vaccinationCenterPk &&
          this.ageOver60(user.age) == over60
        )
      }).map(user => {
        return user.fcmToken
      })

      console.log(`Notifying ${tokens.length} users`)
      
      const message = {
        data: {
          message:"Impftermin!"
        },
        tokens: tokens,
      }
      
      admin.messaging().sendMulticast(message)
        .then((response) => {
          console.log(response.successCount + " messages were sent successfully")
        })
    }
    //TODO: Implement only sending notification if last check was negative
    //TODO: Implement low prio user notification
  }

  /// Remove users --------------------------- 
  async removeSubscription(fcmToken:string):Promise<boolean> {
    this.removeUser(fcmToken)
    return true
  }

  /// Adding users --------------------------- 
  async addSubscription(fcmToken: string, age: number, zip: string):Promise<boolean> {

    const response = await this.checkTermin(age, zip)

    if (!response) {
      return false
    }

    const user = new ImpfUser(fcmToken, age, zip, response.vaccinationCenterPk)
    const center = new ImpfCenter(response.vaccinationCenterPk, response.vaccinationCenterZip)

    this.addUser(user)
    this.addCenter(center)
    return true
  }

  addUser(user:ImpfUser):void {
    this.removeUser(user.fcmToken)
    //TODO: remove user from firestore

    this.users.push(user)
    //TODO: add user to firestore
  }

  addCenter(center:ImpfCenter):void {
    const alreadyAdded = this.centers.find(c => {
      return c.id === center.id
    })
    if(!alreadyAdded) {
      this.centers.push(center)
      //TODO: add center to firestore
    }
  }

  removeUser(fcmToken:string):void {
    this.users = this.users.filter((user) => {
      if(user.fcmToken === fcmToken) {
        return false
      } else {
        return true
      }
    })
  }

///Main Request
  async checkTermin(age: number, zip: string): Promise<ImpfResponse | undefined> {
    const url = `https://www.impfportal-niedersachsen.de/portal/rest/appointments/findVaccinationCenterListFree/${zip}?stiko=&count=1&birthdate=${age}`
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
      console.log(`Found more than one result for PLZ:${zip} and Age:${age}`)
    }

    for (const result of results) {
      return new ImpfResponse(
        result.vaccinationCenterPk,
        result.name,
        result.zipcode,
        result.vaccineName,
        result.vaccineType,
        result.outOfStock)
    }
    return
  }

/// Helpers --------------------------- 
  groupedAge(age: number): number {
    if (this.ageOver60(age)) {
      return AGE_OVER_60
    } else {
      return AGE_UNDER_60
    }
  }

  ageOver60(age: number): boolean {
    return age < AGE_UNDER_60
  }
}
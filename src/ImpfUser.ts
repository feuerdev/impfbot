export default class ImpfUser {
	constructor(
		public fcmToken:string,
		public zip:string,
		public centerId:string,
		public minAppointments:number,
		public notifyForAllCenters:boolean,
		public allowedVaccines:Record<string, boolean>,
		public registrationDate:Date = new Date()) {}
}
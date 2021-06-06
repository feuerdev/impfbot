export default class ImpfUser {
	constructor(
		public fcmToken:string,
		public ageOver60:boolean,
		public zip:string,
		public centerId:string,
		public minAppointments:number,
		public allowedVaccines:Record<string, boolean>,
		public registrationDate:Date = new Date()) {}
}
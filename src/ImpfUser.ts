
export default class ImpfUser {
	constructor(
		public fcmToken:string,
		public ageOver60:boolean,
		public zip:string,
		public centerId:string) {}
}

export enum Frequency {
	low,
	high
}

export default class ImpfUser {
	constructor(
		public fcmToken:string,
		public ageOver60:boolean,
		public zip:string,
		public centerId:string,
		public frequency:Frequency,
		public allowedVaccines:Record<string, boolean>) {}
}
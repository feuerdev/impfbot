export default class ImpfResponse {
	constructor(
    public vaccinationCenterPk: string,
    public vaccinationCenterName: string,
    public vaccinationCenterZip: string,
    public vaccineName: string,
    public vaccineType: string,
    public outOfStock: boolean,
    public numberOfAppointments:number) { }
}
import ImpfCenter from "./ImpfCenter"

export default class ImpfRequest {
	constructor(
    public center:ImpfCenter,
    public over60:boolean,
    public lastCheckHadAppointments:boolean = false,
    public startOfCurrentAppointmentWindow:Date|undefined = undefined,
	) {}
}
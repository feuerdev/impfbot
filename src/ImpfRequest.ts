import ImpfCenter from "./ImpfCenter"

export default class ImpfRequest {
	constructor(
    public center:ImpfCenter,
    public lastCheckHadAppointments:boolean = false,
    public startOfCurrentAppointmentWindow:Date|undefined = undefined,
	) {}
}
declare module 'node-zklib' {
  interface AttendanceRecord {
    uid: number
    timestamp: string
    type: number
    status: number
  }

  interface DeviceAttendanceRecord {
    userSn: number
    deviceUserId: string
    recordTime: string
    ip: string
  }

  interface AttendanceResult {
    data: DeviceAttendanceRecord[]
    err: any
  }

  class ZKLib {
    constructor(ip: string, port: number, timeout: number, inport: number)

    ip: string
    connectionType: 'tcp' | 'udp' | null

    createSocket(
      cbErr?: (error: Error) => void,
      cbClose?: () => void
    ): Promise<void>
    getAttendances(
      cb?: (percent: number, total: number) => void
    ): Promise<AttendanceResult>
    disconnect(): Promise<void>
    getInfo(): Promise<any>
    getUsers(): Promise<any>
    getRealTimeLogs(cb: (data: any) => void): Promise<void>
    clearAttendanceLog(): Promise<void>
    executeCmd(command: number, data?: string): Promise<any>
  }

  export default ZKLib
}

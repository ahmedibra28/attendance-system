import ZKLib from 'node-zklib'
import { PrismaClient } from '@prisma/client'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

const prisma = new PrismaClient()

interface DeviceAttendanceRecord {
  userSn: number
  deviceUserId: string
  recordTime: Date
  ip: string
}

interface ProcessedAttendanceRecord {
  userId: string
  timestamp: Date
  type: 'CHECK_IN' | 'CHECK_OUT'
  deviceId: string
}

function determineAttendanceTypes(
  records: DeviceAttendanceRecord[]
): ProcessedAttendanceRecord[] {
  const groups: Record<string, DeviceAttendanceRecord[]> = {}

  for (const record of records) {
    const dateKey = dayjs(record.recordTime).format('YYYY-MM-DD')
    const key = `${record.deviceUserId}_${dateKey}`
    if (!groups[key]) groups[key] = []
    groups[key].push(record)
  }

  const processed: ProcessedAttendanceRecord[] = []

  for (const group of Object.values(groups)) {
    const sorted = group.sort(
      (a, b) =>
        new Date(a.recordTime).getTime() - new Date(b.recordTime).getTime()
    )

    if (sorted.length === 0) continue

    const [first] = sorted
    if (!first) continue

    processed.push({
      userId: first.deviceUserId,
      timestamp: first.recordTime,
      type: 'CHECK_IN',
      deviceId: first.ip,
    })

    if (sorted.length > 1) {
      const last = sorted[sorted.length - 1]
      if (!last) continue

      const diffMinutes = dayjs(last.recordTime).diff(
        dayjs(first.recordTime),
        'minute'
      )

      if (diffMinutes > 5) {
        processed.push({
          userId: last.deviceUserId,
          timestamp: last.recordTime,
          type: 'CHECK_OUT',
          deviceId: last.ip,
        })
      }
    }
  }

  return processed
}

async function main() {
  const deviceIP = '10.0.4.105'
  const devicePort = 4370

  const zk = new ZKLib(deviceIP, devicePort, 10000, 4000)

  try {
    console.log(`Connecting to ${deviceIP}...`)
    await zk.createSocket()

    const result: any = await zk.getAttendances()

    if (result?.data && Array.isArray(result.data)) {
      //   await prisma.attendanceLog.deleteMany({})
      const processed = determineAttendanceTypes(result.data)

      let stored = 0
      for (const log of processed) {
        await prisma.attendanceLog.upsert({
          where: {
            userId_timestamp: {
              userId: log.userId,
              timestamp: log.timestamp,
            },
          },
          update: { type: log.type },
          create: {
            userId: log.userId,
            timestamp: log.timestamp,
            type: log.type,
            deviceId: log.deviceId,
          },
        })
        stored++
      }

      console.log(`Sync complete. Stored: ${stored}`)
    } else {
      console.log('Invalid or empty log data.')
    }

    await zk.disconnect()
  } catch (error) {
    console.error('ZK Connection Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()

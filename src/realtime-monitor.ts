import ZKLib from 'node-zklib'
import { PrismaClient } from '@prisma/client'
import dayjs from 'dayjs'

const prisma = new PrismaClient()

// Configuration
const DEVICE_IP = '10.0.4.105'
const DEVICE_PORT = 4370
const RECONNECT_INTERVAL = 5000 // 5 seconds

let zkInstance: any = null

async function setupRealTimeMonitor() {
  zkInstance = new ZKLib(DEVICE_IP, DEVICE_PORT, 10000, 4000)

  try {
    console.log(`[${dayjs().format('HH:mm:ss')}] Attempting to connect...`)

    // 1. Create Socket
    await zkInstance.createSocket()
    console.log('✓ Connected to device')

    // 2. Get Users (Optional: Cache them to map IDs to Names instantly)
    // const users = await zkInstance.getUsers()

    console.log('✓ Registering Real-time events...')

    // 3. LISTEN: This callback fires immediately when someone scans a finger
    await zkInstance.getRealTimeLogs(async (data: any) => {
      // Data usually looks like: { userId: 1, attTime: '2023-11-19 14:00:00', ... }
      console.log('[REALTIME EVENT]', data)

      if (!data || !data.userId) return

      const timestamp = new Date(data.attTime)
      const userId = data.userId.toString()

      try {
        // 4. Immediately Save to DB
        // We use "upsert" to be safe, though real-time is usually unique
        await prisma.attendanceLog.upsert({
          where: {
            userId_timestamp: {
              userId: userId,
              timestamp: timestamp,
            },
          },
          update: {
            // If it exists, do nothing or update status
          },
          create: {
            userId: userId,
            timestamp: timestamp,
            type: 'CHECK_IN', // Default to IN, or use logic below
            deviceId: DEVICE_IP,
          },
        })
        console.log(
          `✓ Saved log for User ${userId} at ${dayjs(timestamp).format(
            'HH:mm:ss'
          )}`
        )
      } catch (dbError) {
        console.error('! Database Error:', dbError)
      }
    })

    // 4. CRITICAL: You may need to "enable" the device to start sending events
    // Some devices won't send data without this command.
    // Note: Some library versions call this 'enableDevice()' or 'enableTCP()'
    try {
      if (typeof zkInstance.enableDevice === 'function') {
        await zkInstance.enableDevice()
        console.log('✓ Device Enabled')
      }
    } catch (e) {
      console.warn('! Warning: Could not enable device (might be auto-enabled)')
    }
  } catch (error) {
    console.error('X Connection Error:', error)
    scheduleReconnect()
  }
}

// Reconnection Logic
function scheduleReconnect() {
  console.log(`Retrying in ${RECONNECT_INTERVAL / 1000} seconds...`)
  if (zkInstance) {
    try {
      zkInstance.disconnect()
    } catch (e) {
      /* ignore */
    }
  }
  setTimeout(setupRealTimeMonitor, RECONNECT_INTERVAL)
}

// Start the process
setupRealTimeMonitor()

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down...')
  if (zkInstance) await zkInstance.disconnect()
  await prisma.$disconnect()
  process.exit(0)
})

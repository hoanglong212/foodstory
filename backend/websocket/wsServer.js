import jwt from 'jsonwebtoken'
import { WebSocket, WebSocketServer } from 'ws'

const HEARTBEAT_INTERVAL_MS = 30_000
const SUBSCRIPTION_TIMEOUT_MS = 10_000
const rooms = new Map()

function removeFromRoom(socket) {
  if (!socket.recipeId) {
    return
  }

  const room = rooms.get(socket.recipeId)
  if (!room) {
    return
  }

  room.delete(socket)
  if (room.size === 0) {
    rooms.delete(socket.recipeId)
  }
}

function rejectConnection(socket, message = 'Unauthorized') {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'error', message }))
    socket.close(1008, message)
  } else {
    socket.terminate()
  }
}

function parseSubscription(message) {
  const payload = JSON.parse(message.toString())
  const recipeId = String(payload?.recipeId ?? '').trim()

  if (payload?.type !== 'subscribe' || !/^[1-9]\d*$/.test(recipeId) || !payload.token) {
    return null
  }

  return {
    recipeId,
    token: payload.token,
  }
}

export function initWebSocketServer(server) {
  const webSocketServer = new WebSocketServer({ server })

  webSocketServer.on('error', (error) => {
    if (error.code !== 'EADDRINUSE') {
      console.error('WebSocket server error:', error)
    }
  })

  webSocketServer.on('connection', (socket) => {
    socket.isAlive = true

    const subscriptionTimeout = setTimeout(() => {
      rejectConnection(socket)
    }, SUBSCRIPTION_TIMEOUT_MS)

    socket.once('message', (message) => {
      clearTimeout(subscriptionTimeout)

      try {
        const subscription = parseSubscription(message)
        if (!subscription) {
          rejectConnection(socket)
          return
        }

        const payload = jwt.verify(subscription.token, process.env.JWT_SECRET)
        if (!payload?.id) {
          rejectConnection(socket)
          return
        }

        const room = rooms.get(subscription.recipeId) || new Set()
        socket.recipeId = subscription.recipeId
        socket.userId = payload.id
        room.add(socket)
        rooms.set(subscription.recipeId, room)
      } catch {
        rejectConnection(socket)
      }
    })

    socket.on('pong', () => {
      socket.isAlive = true
    })

    socket.on('close', () => {
      clearTimeout(subscriptionTimeout)
      removeFromRoom(socket)
    })

    socket.on('error', () => {
      removeFromRoom(socket)
    })
  })

  const heartbeat = setInterval(() => {
    webSocketServer.clients.forEach((socket) => {
      if (socket.readyState !== WebSocket.OPEN) {
        return
      }

      if (socket.isAlive === false) {
        socket.terminate()
        return
      }

      socket.isAlive = false
      socket.ping()
    })
  }, HEARTBEAT_INTERVAL_MS)

  heartbeat.unref()
  server.on('close', () => clearInterval(heartbeat))

  return webSocketServer
}

export function broadcastToRecipe(recipeId, eventPayload) {
  const room = rooms.get(String(recipeId))
  if (!room) {
    return
  }

  const message = JSON.stringify(eventPayload)
  room.forEach((socket) => {
    if (socket.readyState !== WebSocket.OPEN) {
      return
    }

    socket.send(message, (error) => {
      if (error) {
        socket.terminate()
      }
    })
  })
}

export function broadcastToAll(eventPayload, options = {}) {
  const message = JSON.stringify(eventPayload)
  const excludedUserId = Number(options.excludeUserId)

  rooms.forEach((room) => {
    room.forEach((socket) => {
      if (
        socket.readyState !== WebSocket.OPEN ||
        (excludedUserId && Number(socket.userId) === excludedUserId)
      ) {
        return
      }

      socket.send(message, (error) => {
        if (error) {
          socket.terminate()
        }
      })
    })
  })
}

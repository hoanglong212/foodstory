import { onMounted, onUnmounted, ref, toValue, watch } from 'vue'
import { useAuthStore } from '../stores/authStore'
import { useCommentStore } from '../stores/commentStore'
import { useRatingStore } from '../stores/ratingStore'
import { useUiStore } from '../stores/uiStore'

const RECONNECT_DELAYS = [3000, 6000, 12000]

export function useRealtimeComments(recipeId) {
  const authStore = useAuthStore()
  const commentStore = useCommentStore()
  const ratingStore = useRatingStore()
  const uiStore = useUiStore()
  const isConnected = ref(false)
  const connectionFailed = ref(false)

  let socket = null
  let reconnectTimer = 0
  let stabilityTimer = 0
  let reconnectAttempts = 0
  let connectionVersion = 0
  let isMounted = false
  let intentionallyClosed = false

  function currentRecipeId() {
    return String(toValue(recipeId) ?? '').trim()
  }

  function clearReconnectTimer() {
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer)
      reconnectTimer = 0
    }
  }

  function clearStabilityTimer() {
    if (stabilityTimer) {
      window.clearTimeout(stabilityTimer)
      stabilityTimer = 0
    }
  }

  function scheduleReconnect(version) {
    if (
      intentionallyClosed ||
      version !== connectionVersion ||
      !authStore.isLoggedIn ||
      !authStore.token
    ) {
      return
    }

    if (reconnectAttempts >= RECONNECT_DELAYS.length) {
      connectionFailed.value = true
      return
    }

    const delay = RECONNECT_DELAYS[reconnectAttempts]
    reconnectAttempts += 1
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = 0
      connect()
    }, delay)
  }

  function handleMessage(event) {
    try {
      const payload = JSON.parse(event.data)

      if (payload.type === 'new_comment' && payload.comment) {
        commentStore.addCommentFromSocket(payload.comment)
      } else if (payload.type === 'comment_updated' && payload.comment) {
        commentStore.updateCommentFromSocket(payload.comment)
      } else if (payload.type === 'comment_deleted') {
        commentStore.deleteCommentFromSocket(payload)
      } else if (payload.type === 'rating_updated') {
        ratingStore.updateRatingFromSocket(payload)
      } else if (
        payload.type === 'checklist_generated' &&
        Number(payload.userId) !== Number(authStore.user?.id)
      ) {
        const itemCount = Number(payload.itemCount || 0)
        uiStore.setSuccess(
          `${payload.username || 'Another cook'} generated an ingredient checklist for "${payload.recipeTitle || 'this recipe'}".`,
          {
            title: 'Someone is cooking this recipe',
            eyebrow: 'Live kitchen activity',
            icon: 'utensils',
            detail: `${itemCount} ingredient${itemCount === 1 ? '' : 's'} prepared for shopping or cooking.`,
            duration: 6000,
            variant: 'activity',
          },
        )
      } else if (payload.type === 'error') {
        console.warn(payload.message || 'WebSocket error')
      }
    } catch {
      console.warn('Ignored an invalid WebSocket message.')
    }
  }

  function connect() {
    const subscribedRecipeId = currentRecipeId()
    if (
      !isMounted ||
      intentionallyClosed ||
      !subscribedRecipeId ||
      !authStore.isLoggedIn ||
      !authStore.token
    ) {
      return
    }

    const version = connectionVersion
    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3000'
    let nextSocket

    try {
      nextSocket = new WebSocket(wsUrl)
    } catch {
      scheduleReconnect(version)
      return
    }

    socket = nextSocket
    nextSocket.addEventListener('open', () => {
      if (version !== connectionVersion || intentionallyClosed) {
        nextSocket.close()
        return
      }

      connectionFailed.value = false
      isConnected.value = true
      nextSocket.send(
        JSON.stringify({
          type: 'subscribe',
          recipeId: subscribedRecipeId,
          token: authStore.token,
        }),
      )
      stabilityTimer = window.setTimeout(() => {
        if (nextSocket.readyState === WebSocket.OPEN && version === connectionVersion) {
          reconnectAttempts = 0
        }
        stabilityTimer = 0
      }, 1000)
    })

    nextSocket.addEventListener('message', handleMessage)
    nextSocket.addEventListener('close', () => {
      if (socket === nextSocket) {
        socket = null
      }
      if (version !== connectionVersion || intentionallyClosed) {
        return
      }

      clearStabilityTimer()
      isConnected.value = false
      scheduleReconnect(version)
    })
  }

  function restartConnection() {
    connectionVersion += 1
    clearReconnectTimer()
    clearStabilityTimer()
    reconnectAttempts = 0
    connectionFailed.value = false
    isConnected.value = false

    const previousSocket = socket
    socket = null
    previousSocket?.close()
    connect()
  }

  onMounted(() => {
    isMounted = true
    connect()
  })

  watch(
    () => currentRecipeId(),
    (nextId, previousId) => {
      if (isMounted && nextId !== previousId) {
        restartConnection()
      }
    },
  )

  watch(
    () => authStore.token,
    (nextToken, previousToken) => {
      if (isMounted && nextToken !== previousToken) {
        restartConnection()
      }
    },
  )

  onUnmounted(() => {
    intentionallyClosed = true
    isMounted = false
    connectionVersion += 1
    clearReconnectTimer()
    clearStabilityTimer()
    isConnected.value = false

    const activeSocket = socket
    socket = null
    activeSocket?.close()
  })

  return {
    isConnected,
    connectionFailed,
  }
}

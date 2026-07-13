import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { describe, it } from 'node:test'

import {
  isValidVisionAutoProcessPid,
  terminateVisionAutoProcessTree,
} from '../services/visionAuto/visionAutoProcessTreeService.js'

describe('Vision Auto owned process-tree termination', () => {
  it('rejects invalid PIDs without spawning a command', async () => {
    let spawned = false
    const result = await terminateVisionAutoProcessTree('1 & taskkill', {
      spawnImpl() { spawned = true },
    })
    assert.equal(isValidVisionAutoProcessPid('1 & taskkill'), false)
    assert.equal(spawned, false)
    assert.deepEqual(result, { attempted: false, killed: false, reason: 'invalid_pid' })
  })

  it('treats an already-exited owned PID as safely settled', async () => {
    const child = new EventEmitter()
    const resultPromise = terminateVisionAutoProcessTree(12345, {
      spawnImpl(_command, args, options) {
        assert.equal(options.shell, false)
        assert.equal(args.includes('12345'), true)
        queueMicrotask(() => child.emit('close', 128))
        return child
      },
    })
    const result = await resultPromise
    assert.equal(result.attempted, true)
    assert.equal(result.killed, true)
    assert.equal(result.exitCode, 128)
  })

  it('bounds a process-tree command that never settles', async () => {
    const child = new EventEmitter()
    const result = await terminateVisionAutoProcessTree(12345, {
      timeoutMs: 10,
      spawnImpl() { return child },
    })
    assert.equal(result.attempted, true)
    assert.equal(result.killed, false)
    assert.equal(result.reason, 'timeout')
  })
})

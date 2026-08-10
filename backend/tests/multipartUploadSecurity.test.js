import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import express from 'express'

import foodMapDiscoveryRouter from '../routes/foodMapDiscoveryRoutes.js'
import { createFoodMapSocialDiscoveryRouter } from '../routes/foodMapSocialDiscoveryRoutes.js'
import visionRouter, { createVisionRouter } from '../routes/vision.js'
import { createVisionAutoRouter } from '../routes/visionAutoRoutes.js'

const servers = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))))
})

async function startApp(path, router) {
  const app = express()
  app.use(path, router)
  app.use((error, _req, res, _next) => {
    res.status(500).json({ error: error?.code || error?.message || 'internal_error' })
  })
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance))
  })
  servers.push(server)
  const address = server.address()
  return `http://127.0.0.1:${address.port}`
}

function nestedForm(field = 'url[nested]') {
  const form = new FormData()
  form.append(field, 'https://example.com')
  return form
}

describe('multipart upload security limits', () => {
  it('rejects nested multipart fields on Vision Auto before analyze runs', async () => {
    let analyzeCalled = false
    const router = createVisionAutoRouter({
      analyze: async () => {
        analyzeCalled = true
        return { status: 'unexpected' }
      },
      isRouteEnabled: () => true,
      isServiceEnabled: () => true,
    })
    const base = await startApp('/api/food-map', router)
    const response = await fetch(`${base}/api/food-map/vision-auto-v2`, {
      method: 'POST',
      body: nestedForm(),
    })

    assert.equal(response.status, 400)
    assert.equal(analyzeCalled, false)
  })

  it('rejects uploaded bytes that do not match the declared image MIME type', async () => {
    let analyzeCalled = false
    const router = createVisionAutoRouter({
      analyze: async () => {
        analyzeCalled = true
        return { status: 'unexpected' }
      },
      isRouteEnabled: () => true,
      isServiceEnabled: () => true,
    })
    const base = await startApp('/api/food-map', router)
    const form = new FormData()
    form.append('image', new Blob(['<html>not an image</html>'], { type: 'image/jpeg' }), 'fake.jpg')
    const response = await fetch(`${base}/api/food-map/vision-auto-v2`, {
      method: 'POST',
      body: form,
    })

    assert.equal(response.status, 400)
    assert.equal(analyzeCalled, false)
    const payload = await response.json()
    assert.equal(payload.code, 'INVALID_IMAGE_CONTENT')
  })

  it('still accepts flat Vision Auto fields with the hardened Multer limits', async () => {
    let analyzeCalled = false
    const router = createVisionAutoRouter({
      analyze: async ({ url }) => {
        analyzeCalled = true
        return { status: 'ok', url }
      },
      isRouteEnabled: () => true,
      isServiceEnabled: () => true,
    })
    const base = await startApp('/api/food-map', router)
    const form = new FormData()
    form.append('url', 'https://www.youtube.com/shorts/dQw4w9WgXcQ')
    const response = await fetch(`${base}/api/food-map/vision-auto-v2`, {
      method: 'POST',
      body: form,
    })

    assert.equal(response.status, 200)
    assert.equal(analyzeCalled, true)
  })

  it('rejects nested multipart fields on social discovery before analyze runs', async () => {
    let analyzeCalled = false
    const router = createFoodMapSocialDiscoveryRouter({
      analyze: async () => {
        analyzeCalled = true
        return { status: 'unexpected' }
      },
    })
    const base = await startApp('/api/food-map', router)
    const response = await fetch(`${base}/api/food-map/social-discovery`, {
      method: 'POST',
      body: nestedForm('hint[nested]'),
    })

    assert.equal(response.status, 400)
    assert.equal(analyzeCalled, false)
  })

  it('rejects nested multipart fields on legacy discovery', async () => {
    const base = await startApp('/api/food-map', foodMapDiscoveryRouter)
    const response = await fetch(`${base}/api/food-map/discover`, {
      method: 'POST',
      body: nestedForm('hint[nested]'),
    })
    assert.equal(response.status, 400)
  })

  it('rejects multipart text fields on the image-only legacy vision route', async () => {
    const base = await startApp('/api/vision', visionRouter)
    const response = await fetch(`${base}/api/vision/search`, {
      method: 'POST',
      body: nestedForm('url[nested]'),
    })
    assert.equal(response.status, 400)
  })

  it('accepts exactly one supported image file on the legacy vision route', async () => {
    let receivedFile = null
    const router = createVisionRouter({
      searchUploadedImage: async (file) => {
        receivedFile = file
        return {
          results: [],
          recipes: [],
          restaurants: [],
          total: 0,
        }
      },
    })
    const base = await startApp('/api/vision', router)
    const form = new FormData()
    form.append(
      'image',
      new Blob([Buffer.from('RIFF0000WEBPVP8 ')], { type: 'image/webp' }),
      'dish.webp'
    )
    const response = await fetch(`${base}/api/vision/search`, {
      method: 'POST',
      body: form,
    })

    assert.equal(response.status, 200)
    assert.equal(receivedFile?.mimetype, 'image/webp')
    assert.equal(receivedFile?.originalname, 'dish.webp')
  })
})

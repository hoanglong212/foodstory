import express from 'express'
import { retrieveRelevantDocuments } from '../services/aiRetrievalService.js'

const router = express.Router()

router.post('/retrieve', async (req, res) => {
  try {
    const { query, topK = 5 } = req.body

    if (!query || !query.trim()) {
      return res.status(400).json({
        message: 'Query is required',
      })
    }

    const results = await retrieveRelevantDocuments(query, Number(topK))

    return res.json({
      query,
      topK: Number(topK),
      results: results.map((item) => ({
        documentId: item.documentId,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        title: item.title,
        score: Number(item.score.toFixed(4)),
        chunkText: item.chunkText,
        metadata: item.metadata,
      })),
    })
  } catch (error) {
    console.error('AI retrieval error:', error)

    return res.status(500).json({
      message: 'AI retrieval failed',
      error: error.message,
    })
  }
})

export default router
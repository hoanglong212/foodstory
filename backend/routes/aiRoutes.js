import express from 'express'
import { retrieveRelevantDocumentsWithDebug } from '../services/aiRetrievalService.js'

const router = express.Router()

router.post('/retrieve', async (req, res) => {
  try {
    const { query, topK = 5 } = req.body

    if (typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({
        message: 'Query is required',
      })
    }

    const retrieval = await retrieveRelevantDocumentsWithDebug(query, topK)
    const roundScore = (score) => Number(score.toFixed(4))

    return res.json({
      query: retrieval.query,
      topK: retrieval.topK,
      status: retrieval.status,
      detectedIntent: retrieval.detectedIntent,
      cuisineConstraint: retrieval.cuisineConstraint,
      locationConstraint: retrieval.locationConstraint,
      message: retrieval.message,
      results: retrieval.results.map((item) => ({
        documentId: item.documentId,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        title: item.title,
        score: roundScore(item.score),
        semanticScore: roundScore(item.semanticScore),
        intentScore: roundScore(item.intentScore),
        constraintScore: roundScore(item.constraintScore),
        keywordScore: roundScore(item.keywordScore),
        categoryScore: roundScore(item.categoryScore),
        locationScore: roundScore(item.locationScore),
        detectedIntent: item.detectedIntent,
        cuisineConstraint: item.cuisineConstraint,
        locationConstraint: item.locationConstraint,
        matchLevel: item.matchLevel,
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

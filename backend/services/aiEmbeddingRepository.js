import pool from '../db.js'

function parseJsonColumn(value, fallback) {
  if (value === null || value === undefined) return fallback
  if (typeof value !== 'string') return value
  return JSON.parse(value)
}

export async function saveAiDocumentWithEmbedding({
  sourceType,
  sourceId,
  title,
  content,
  metadata = {},
  chunkText,
  embedding,
  embeddingModel,
}) {
  const connection = await pool.getConnection()

  try {
    await connection.beginTransaction()

    const [documentResult] = await connection.execute(
      `
      INSERT INTO ai_documents
      (source_type, source_id, title, content, metadata)
      VALUES (?, ?, ?, ?, ?)
      `,
      [
        sourceType,
        sourceId,
        title,
        content,
        JSON.stringify(metadata),
      ]
    )

    const documentId = documentResult.insertId

    await connection.execute(
      `
      INSERT INTO ai_embeddings
      (document_id, chunk_text, embedding, embedding_model, source_type, source_id)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        documentId,
        chunkText,
        JSON.stringify(embedding),
        embeddingModel,
        sourceType,
        sourceId,
      ]
    )

    await connection.commit()

    return {
      documentId,
      sourceType,
      sourceId,
      title,
    }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

export async function getAllAiEmbeddings() {
  const [rows] = await pool.execute(
    `
    SELECT 
      e.id,
      e.document_id AS documentId,
      e.chunk_text AS chunkText,
      e.embedding,
      e.embedding_model AS embeddingModel,
      e.source_type AS sourceType,
      e.source_id AS sourceId,
      d.title,
      d.content,
      d.metadata
    FROM ai_embeddings e
    JOIN ai_documents d ON d.id = e.document_id
    WHERE e.embedding_type = 'text'
    `
  )

  return rows.map((row) => ({
    ...row,
    embedding: parseJsonColumn(row.embedding, []),
    metadata: parseJsonColumn(row.metadata, {}),
  }))
}

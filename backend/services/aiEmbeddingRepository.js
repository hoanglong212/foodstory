import mysql from 'mysql2/promise'
import 'dotenv/config'

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'foodstory',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
})

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
    `
  )

  return rows.map((row) => ({
    ...row,
    embedding: JSON.parse(row.embedding),
    metadata: row.metadata ? JSON.parse(row.metadata) : {},
  }))
}
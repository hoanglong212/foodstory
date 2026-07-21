import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDatabaseConfig } from '../config/database.js'
import { schemaForConfiguredDatabase } from '../database/bootstrapProduction.js'

test('database config keeps local defaults without TLS', () => {
  const config = buildDatabaseConfig({})
  assert.equal(config.host, '127.0.0.1')
  assert.equal(config.port, 3306)
  assert.equal(config.database, 'foodstory')
  assert.equal(config.ssl, undefined)
})

test('database config parses hosted MySQL URL and required TLS', () => {
  const config = buildDatabaseConfig({
    DATABASE_URL: 'mysql://cloud%40user:p%40ss@example.aivencloud.com:12691/defaultdb',
    DB_SSL_MODE: 'required',
  })
  assert.equal(config.host, 'example.aivencloud.com')
  assert.equal(config.port, 12691)
  assert.equal(config.user, 'cloud@user')
  assert.equal(config.password, 'p@ss')
  assert.equal(config.database, 'defaultdb')
  assert.deepEqual(config.ssl, { rejectUnauthorized: false })
})

test('verify-ca requires and decodes a PEM certificate', () => {
  const pem = '-----BEGIN CERTIFICATE-----\nexample\n-----END CERTIFICATE-----'
  const config = buildDatabaseConfig({
    DB_SSL_MODE: 'verify-ca',
    DB_SSL_CA_BASE64: Buffer.from(pem).toString('base64'),
  })
  assert.deepEqual(config.ssl, { rejectUnauthorized: true, ca: pem })
  assert.throws(
    () => buildDatabaseConfig({ DB_SSL_MODE: 'verify-ca' }),
    /DB_SSL_CA or DB_SSL_CA_BASE64 is required/u,
  )
})

test('production schema bootstrap does not switch or create databases', () => {
  const prepared = schemaForConfiguredDatabase(`
    CREATE DATABASE IF NOT EXISTS foodstory CHARACTER SET utf8mb4;
    USE foodstory;
    CREATE TABLE IF NOT EXISTS recipes (id INT PRIMARY KEY);
  `)
  assert.doesNotMatch(prepared, /CREATE\s+DATABASE/iu)
  assert.doesNotMatch(prepared, /\bUSE\s+foodstory/iu)
  assert.match(prepared, /CREATE TABLE IF NOT EXISTS recipes/iu)
})

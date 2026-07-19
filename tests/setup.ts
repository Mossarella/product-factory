// Global test setup — runs before every test file
Object.assign(process.env, { NODE_ENV: 'test' })
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/productfactory_test'
process.env.AUTH_SECRET = 'test-secret-do-not-use-in-prod'
process.env.AUTH_URL = 'http://localhost:3000'

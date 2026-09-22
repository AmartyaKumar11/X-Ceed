// Script to initialize MongoDB database and collections
const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load environment variables
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  console.log('Loading environment from:', envPath);
  dotenv.config({ path: envPath });
}

// Get connection string and database name
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/x-ceed-db';
let uriWithoutDB = uri.split('/').slice(0, 3).join('/');
const dbName = uri.split('/')[3]?.split('?')[0] || 'x-ceed-db';

console.log('MongoDB URI:', uriWithoutDB);
console.log('Database name:', dbName);

// MongoDB connection options
const options = {
  connectTimeoutMS: 30000,
  socketTimeoutMS: 30000,
  serverSelectionTimeoutMS: 30000,
};

async function initializeDatabase() {
  let client;

  try {
    console.log('Connecting to MongoDB...');
    client = new MongoClient(uriWithoutDB, options);
    await client.connect();
    console.log('Connected to MongoDB successfully!');

    // Initialize database and collections
    const db = client.db(dbName);
    console.log(`Using database: ${dbName}`);

    // Create collections if they don't exist
    const requiredCollections = ['users', 'jobs', 'applications', 'notifications', 'aggregated_jobs', 'ai_cache'];
    const existingCollections = await db.listCollections().toArray();
    const existingCollectionNames = existingCollections.map(c => c.name);
    
    console.log('Existing collections:', existingCollectionNames);

    for (const collectionName of requiredCollections) {
      if (!existingCollectionNames.includes(collectionName)) {
        console.log(`Creating collection: ${collectionName}`);
        await db.createCollection(collectionName);
        console.log(`Collection ${collectionName} created successfully`);
      } else {
        console.log(`Collection ${collectionName} already exists`);
      }
    }

    // Aggregated jobs indexes (Remotive + Jobicy)
    const agg = db.collection('aggregated_jobs');
    await agg.createIndex(
      { title: 'text', company: 'text', description: 'text' },
      { name: 'aggregated_jobs_search' }
    ).catch((e) => console.warn('text index:', e.message));
    await agg.createIndex({ source_id: 1 }, { unique: true }).catch((e) => console.warn('source_id index:', e.message));
    await agg.createIndex({ active: 1, published_at: -1 }).catch(() => {});
    await agg.createIndex({ expires_at: 1 }).catch(() => {});
    console.log('aggregated_jobs indexes ensured');

    // Count documents in each collection
    for (const collectionName of requiredCollections) {
      const count = await db.collection(collectionName).countDocuments();
      console.log(`${collectionName} collection has ${count} documents`);
    }

    console.log('Database initialization completed successfully');
    return true;
  } catch (error) {
    console.error('Database initialization error:', error);
    return false;
  } finally {
    if (client) {
      await client.close();
      console.log('MongoDB connection closed');
    }
  }
}

// Run the initialization function
initializeDatabase()
  .then((success) => {
    if (success) {
      console.log('Database setup complete. You should now see the database in MongoDB Compass.');
    } else {
      console.error('Failed to initialize database.');
    }
    process.exit(success ? 0 : 1);
  });

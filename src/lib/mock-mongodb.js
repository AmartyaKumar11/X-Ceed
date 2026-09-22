// Simple in-memory user store for testing when MongoDB Atlas is having issues
const bcrypt = require('bcryptjs');

const testUsers = [
  {
    _id: '674e2d9f8b1234567890abcd',
    name: 'Test User',
    email: 'test@example.com',
    password: '$2b$10$kzP9Zigz9MTDesyMnbLi9Oxbgq0WlHZN7oGEZQipWdjVE7wdddzvi', // password123
    role: 'applicant',
    isEmailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    _id: '674e2d9f8b1234567890abce',
    name: 'John Doe',
    email: 'john@example.com',
    password: '$2b$10$kzP9Zigz9MTDesyMnbLi9Oxbgq0WlHZN7oGEZQipWdjVE7wdddzvi', // password123
    role: 'applicant',
    isEmailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    _id: '674e2d9f8b1234567890abcf',
    name: 'Amartya Kumar',
    email: 'amartya-applicant@gmail.com',
    password: '$2b$10$N9qo8uLOickgx2ZMRZoMye.Jw3QN1V/9cg7t7vY6MvS4m0rqBQ6Em', // applicant
    role: 'applicant',
    userType: 'applicant',
    isEmailVerified: true,
    personal: {
      name: 'Amartya Kumar'
    },
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    _id: '674e2d9f8b1234567890abd0',
    name: 'Amartya Recruiter',
    email: 'amartya-recruiter@gmail.com',
    password: '$2b$10$N9qo8uLOickgx2ZMRZoMye.Jw3QN1V/9cg7t7vY6MvS4m0rqBQ6Em', // applicant (same hash)
    role: 'recruiter',
    userType: 'recruiter',
    isEmailVerified: true,
    recruiter: {
      name: 'Amartya Recruiter'
    },
    createdAt: new Date(),
    updatedAt: new Date()
  }
];

class MockUsersCollection {
  async findOne(query) {
    if (query.email) {
      return testUsers.find(user => user.email === query.email) || null;
    }
    if (query._id) {
      return testUsers.find(user => user._id === query._id) || null;
    }
    return null;
  }

  async insertOne(userData) {
    const newUser = {
      _id: '674e2d9f8b' + Date.now().toString(16),
      ...userData,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    testUsers.push(newUser);
    return { insertedId: newUser._id };
  }

  async updateOne(filter, update) {
    const userIndex = testUsers.findIndex(user => 
      (filter.email && user.email === filter.email) ||
      (filter._id && user._id === filter._id)
    );
    
    if (userIndex !== -1) {
      testUsers[userIndex] = { ...testUsers[userIndex], ...update.$set, updatedAt: new Date() };
      return { modifiedCount: 1 };
    }
    return { modifiedCount: 0 };
  }

  async deleteOne(filter) {
    const userIndex = testUsers.findIndex(user => 
      (filter.email && user.email === filter.email) ||
      (filter._id && user._id === filter._id)
    );
    
    if (userIndex !== -1) {
      testUsers.splice(userIndex, 1);
      return { deletedCount: 1 };
    }
    return { deletedCount: 0 };
  }

  async find() {
    return {
      toArray: async () => testUsers
    };
  }
}

class MockDatabase {
  collection(name) {
    if (name === 'users') {
      return new MockUsersCollection();
    }
    // Return a basic mock for other collections
    return {
      findOne: async () => null,
      insertOne: async () => ({ insertedId: 'mock-id' }),
      updateOne: async () => ({ modifiedCount: 0 }),
      deleteOne: async () => ({ deletedCount: 0 }),
      find: async () => ({ toArray: async () => [] })
    };
  }
}

class MockMongoClient {
  async connect() {
    console.log('🔄 Using mock MongoDB client for testing');
    return this;
  }

  async close() {
    console.log('✅ Mock MongoDB client closed');
  }

  db(name) {
    console.log(`📁 Mock database accessed: ${name}`);
    return new MockDatabase();
  }
}

module.exports = { MockMongoClient, testUsers };

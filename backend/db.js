const Database = require("better-sqlite3");

// Create / open database file
const db = new Database("ecommerce.db");

// ================= PRODUCTS TABLE =================
db.prepare(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    description TEXT,
    imageUrl TEXT NOT NULL
  )
`).run();

// ================= USERS TABLE =================
db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  )
`).run();

// ================= CART TABLE =================
db.prepare(`
  CREATE TABLE IF NOT EXISTS carts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    productId INTEGER NOT NULL,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    imageUrl TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    UNIQUE(userId, productId),
    FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(productId) REFERENCES products(id) ON DELETE CASCADE
  )
`).run();

module.exports = db;

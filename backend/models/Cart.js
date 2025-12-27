const express = require("express");
const router = express.Router();
const db = require("../db"); // your better-sqlite3 db instance
const jwt = require("jsonwebtoken");

// Middleware to verify user token and get userId
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return res.status(401).json({ error: "No token provided" });

  const token = authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Invalid token format" });

  jwt.verify(token, process.env.JWT_SECRET || "your_jwt_secret", (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid or expired token" });
    req.user = user;
    next();
  });
}

// GET /api/cart
// Get all cart items for the logged-in user
router.get("/", authenticateToken, (req, res) => {
  const userId = req.user.id;

  const stmt = db.prepare(`
    SELECT productId AS productId, name, price, imageUrl, quantity
    FROM carts WHERE userId = ?
  `);

  try {
    const cartItems = stmt.all(userId);
    res.json(cartItems);
  } catch (err) {
    console.error("Failed to get cart items:", err);
    res.status(500).json({ error: "Failed to get cart items" });
  }
});

// POST /api/cart
// Add or update cart item for logged-in user
// Body: { productId, quantity }
router.post("/", authenticateToken, (req, res) => {
  const userId = req.user.id;
  const { productId, quantity } = req.body;

  if (!productId || !quantity || quantity < 1) {
    return res.status(400).json({ error: "Invalid productId or quantity" });
  }

  // Get product details from products table
  const productStmt = db.prepare("SELECT name, price, imageUrl FROM products WHERE id = ?");
  const product = productStmt.get(productId);

  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  // Check if cart item exists for user + product
  const cartCheckStmt = db.prepare("SELECT id, quantity FROM carts WHERE userId = ? AND productId = ?");
  const existingCartItem = cartCheckStmt.get(userId, productId);

  try {
    if (existingCartItem) {
      // Update quantity
      const newQty = existingCartItem.quantity + quantity;
      const updateStmt = db.prepare("UPDATE carts SET quantity = ? WHERE id = ?");
      updateStmt.run(newQty, existingCartItem.id);
    } else {
      // Insert new cart row
      const insertStmt = db.prepare(`
        INSERT INTO carts (userId, productId, name, price, imageUrl, quantity)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      insertStmt.run(userId, productId, product.name, product.price, product.imageUrl, quantity);
    }
    res.json({ message: "Cart updated" });
  } catch (err) {
    console.error("Failed to update cart:", err);
    res.status(500).json({ error: "Failed to update cart" });
  }
});

// DELETE /api/cart/:productId
// Remove product from cart for logged-in user
router.delete("/:productId", authenticateToken, (req, res) => {
  const userId = req.user.id;
  const productId = req.params.productId;

  try {
    const deleteStmt = db.prepare("DELETE FROM carts WHERE userId = ? AND productId = ?");
    const info = deleteStmt.run(userId, productId);

    if (info.changes === 0) {
      return res.status(404).json({ error: "Cart item not found" });
    }

    res.json({ message: "Item removed from cart" });
  } catch (err) {
    console.error("Failed to delete cart item:", err);
    res.status(500).json({ error: "Failed to delete cart item" });
  }
});

module.exports = router;

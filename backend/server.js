require("dotenv").config();
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const db = require("./db");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// Serve uploaded images
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ================= MULTER CONFIG =================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "uploads");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ storage });

// ================= AUTH =================
const ADMIN = {
  email: process.env.ADMIN_EMAIL,
  password: bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10),
};

// ================= ADMIN LOGIN =================
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;

  if (email !== ADMIN.email) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const valid = bcrypt.compareSync(password, ADMIN.password);
  if (!valid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign({ role: "admin" }, process.env.JWT_SECRET, {
    expiresIn: "2h",
  });

  res.json({ token });
});

// ================= USER SIGNUP =================
app.post("/api/signup", async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: "All fields are required" });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    db.prepare(
      "INSERT INTO users (name, email, password) VALUES (?, ?, ?)"
    ).run(name, email, hashedPassword);

    res.json({ message: "Signup successful" });
  } catch {
    res.status(400).json({ error: "Email already exists" });
  }
});

// ================= USER LOGIN =================
app.post("/api/user/login", async (req, res) => {
  const { email, password } = req.body;

  const user = db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(email);

  if (!user) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: "user",
    },
    process.env.JWT_SECRET,
    { expiresIn: "2h" }
  );

  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email },
  });
});

// ================= AUTH MIDDLEWARE =================
function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ error: "Token missing" });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err)
      return res.status(403).json({ error: "Token invalid or expired" });
    req.user = user;
    next();
  });
}

function authenticateAdmin(req, res, next) {
  authenticateToken(req, res, () => {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin only" });
    }
    next();
  });
}

// ================= PRODUCTS =================
app.post(
  "/api/products",
  authenticateAdmin,
  upload.single("image"),
  (req, res) => {
    const { name, price, description } = req.body;
    if (!name || !price || !req.file) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const imageUrl = `/uploads/${req.file.filename}`;

    const result = db.prepare(
      "INSERT INTO products (name, price, description, imageUrl) VALUES (?, ?, ?, ?)"
    ).run(name, price, description, imageUrl);

    res.json({
      id: result.lastInsertRowid,
      name,
      price,
      description,
      imageUrl,
    });
  }
);

app.get("/api/products", (req, res) => {
  const products = db.prepare("SELECT * FROM products").all();
  res.json(products);
});

// ================= UPDATE PRODUCT =================
app.put("/api/products/:id", authenticateAdmin, (req, res) => {
  const { id } = req.params;
  const { name, price, description } = req.body;

  if (!name || !price) {
    return res.status(400).json({ error: "Name and price are required" });
  }

  const existing = db.prepare("SELECT * FROM products WHERE id = ?").get(id);
  if (!existing) {
    return res.status(404).json({ error: "Product not found" });
  }

  try {
    db.prepare(
      "UPDATE products SET name = ?, price = ?, description = ? WHERE id = ?"
    ).run(name, price, description, id);

    res.json({ message: "Product updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update product" });
  }
});

// ================= DELETE PRODUCT =================
app.delete("/api/products/:id", authenticateAdmin, (req, res) => {
  const { id } = req.params;

  const existing = db.prepare("SELECT * FROM products WHERE id = ?").get(id);
  if (!existing) {
    return res.status(404).json({ error: "Product not found" });
  }

  try {
    db.prepare("DELETE FROM products WHERE id = ?").run(id);
    res.json({ message: "Product deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete product" });
  }
});

// ================= DELETE USER (ADMIN ONLY) =================
app.delete("/api/users/:id", authenticateAdmin, (req, res) => {
  const userId = req.params.id;

  // Check if user exists
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  // Delete user
  db.prepare("DELETE FROM users WHERE id = ?").run(userId);

  res.json({ message: `User with ID ${userId} deleted successfully` });
});

// ================= CART =================

// GET CART
app.get("/api/cart", authenticateToken, (req, res) => {
  const cart = db.prepare(
    "SELECT * FROM carts WHERE userId = ?"
  ).all(req.user.id);
  res.json(cart);
});

// ADD / UPDATE CART
app.post("/api/cart", authenticateToken, (req, res) => {
  const { productId, quantity } = req.body;
  const userId = req.user.id;

  if (!productId || quantity == null || quantity <= 0) {
    return res.status(400).json({ error: "Invalid data" });
  }

  // FETCH PRODUCT DATA
  const product = db.prepare(
    "SELECT name, price, imageUrl FROM products WHERE id = ?"
  ).get(productId);

  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  const existing = db.prepare(
    "SELECT * FROM carts WHERE userId = ? AND productId = ?"
  ).get(userId, productId);

  if (existing) {
    db.prepare(
      "UPDATE carts SET quantity = ? WHERE id = ?"
    ).run(quantity, existing.id);
  } else {
    db.prepare(
      `INSERT INTO carts (userId, productId, name, price, imageUrl, quantity)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      userId,
      productId,
      product.name,
      product.price,
      product.imageUrl,
      quantity
    );
  }

  res.json({ message: "Cart updated" });
});

// REMOVE ITEM
app.delete("/api/cart/:productId", authenticateToken, (req, res) => {
  db.prepare(
    "DELETE FROM carts WHERE userId = ? AND productId = ?"
  ).run(req.user.id, req.params.productId);

  res.json({ message: "Item removed" });
});

// CLEAR CART
app.delete("/api/cart", authenticateToken, (req, res) => {
  db.prepare("DELETE FROM carts WHERE userId = ?").run(req.user.id);
  res.json({ message: "Cart cleared" });
});

// ================= START =================
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
